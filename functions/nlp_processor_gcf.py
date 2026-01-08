"""
@file nlp_processor_gcf.py
@description Flask-based NLP processor for Google Cloud Functions (legacy/alternative deployment).

@module functions/nlp_processor_gcf
@requires flask - Web framework
@requires flair - NLP models
@requires transformers - Topic classification
@requires firebase_admin - Authentication

@connections
- Called by: Client nlpService.js (alternative endpoint)
- Authenticates: Firebase Auth tokens

@summary
Alternative Flask-based NLP processor supporting:
- Sentiment analysis (Flair fast model)
- Named Entity Recognition (Flair fast model)
- Part-of-Speech tagging (Flair fast model)
- Topic classification (BART zero-shot)
- Audio transcription via OpenAI Whisper API
- Flagged word detection (server-side)

Endpoints:
- POST /nlp_analyze - Main analysis endpoint
- GET /health - Health check

Models loaded lazily and cached for performance.
Falls back to standard models if fast models fail.
"""

import json
import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from flair.nn import Classifier
from flair.data import Sentence
from flair.splitter import SegtokSentenceSplitter
from flair.models import SequenceTagger
import contractions
from transformers import pipeline
import firebase_admin
from firebase_admin import auth
import requests
from urllib.parse import urlparse
import tempfile

# Initialize Flask application
app = Flask(__name__)

# Configure CORS for the app
CORS(app, origins=[
    'http://localhost:3000',  # Development
    'https://biomedicalprototype.web.app',  # Production
    'https://biomedicalprototype.firebaseapp.com'  # Production fallback
])

# Initialize Firebase Admin (lazy initialization)
firebase_app = None

def get_firebase_app():
    global firebase_app
    if firebase_app is None:
        firebase_app = firebase_admin.initialize_app()
    return firebase_app

# Global model variables for caching (loaded once per instance)
_sentiment_model = None
_ner_model = None
_pos_model = None
_topic_classifier = None

def get_models():
    """Load and cache ML models globally for performance"""
    global _sentiment_model, _ner_model, _pos_model, _topic_classifier

    try:
        # Use faster, lighter models for better performance
        if _sentiment_model is None:
            print("Loading fast sentiment model...")
            _sentiment_model = Classifier.load('sentiment-fast')

        if _ner_model is None:
            print("Loading fast NER model...")
            _ner_model = Classifier.load('ner-fast')

        if _pos_model is None:
            print("Loading fast POS model...")
            _pos_model = SequenceTagger.load('pos-fast')

        if _topic_classifier is None:
            print("Loading lightweight topic classification model...")
            # Use a smaller, faster model for topic classification
            _topic_classifier = pipeline('zero-shot-classification',
                                       model='facebook/bart-large-mnli',
                                       device=-1)  # Force CPU usage

        print("All models loaded successfully")
        return _sentiment_model, _ner_model, _pos_model, _topic_classifier

    except Exception as e:
        print(f"Error loading models: {str(e)}")
        # Try fallback models if fast models fail
        try:
            print("Trying fallback models...")
            if _sentiment_model is None:
                _sentiment_model = Classifier.load('sentiment')
            if _ner_model is None:
                _ner_model = Classifier.load('ner')
            if _pos_model is None:
                _pos_model = SequenceTagger.load('pos')
            if _topic_classifier is None:
                _topic_classifier = pipeline('zero-shot-classification',
                                           model='facebook/bart-large-mnli')
            print("Fallback models loaded successfully")
            return _sentiment_model, _ner_model, _pos_model, _topic_classifier
        except Exception as fallback_error:
            print(f"Fallback models also failed: {str(fallback_error)}")
            raise e

def analyze_transcription(transcription, audio_url=None):
    """Core NLP analysis function using cached models with error resilience"""
    result = {
        'success': False,
        'sentiment': 'neutral',
        'entities': [],
        'pos': {},
        'topics': {'primary': 'general', 'scores': {}},
        'word_count': 0,
        'sentence_count': 0,
        'char_count': 0,
        'errors': []
    }

    try:
        # Handle audio transcription if no text provided
        if not transcription or not isinstance(transcription, str) or not transcription.strip():
            if audio_url:
                print(f"Transcription empty, attempting audio transcription from: {audio_url}")
                try:
                    transcription = transcribe_audio(audio_url)
                    print(f"Audio transcription successful: {len(transcription)} characters")
                except Exception as audio_error:
                    print(f"Audio transcription failed: {str(audio_error)}")
                    result['errors'].append(f"Audio transcription failed: {str(audio_error)}")
                    raise ValueError("No transcription text available and audio transcription failed")

        # Input validation
        if not transcription or not isinstance(transcription, str):
            raise ValueError("Invalid transcription input")

        # Clean and prepare text
        clean = contractions.fix(transcription.strip())
        if not clean:
            raise ValueError("Empty transcription after cleaning")

        result['char_count'] = len(clean)

        # Basic statistics (always work)
        words = clean.split()
        result['word_count'] = len(words)
        sentences = clean.split('.')
        result['sentence_count'] = len([s for s in sentences if s.strip()])

        print(f"Starting NLP analysis for {len(clean)} chars, {len(words)} words, {len(sentences)} sentences")

        try:
            # Get cached models
            sentiment_model, ner_model, pos_model, topic_classifier = get_models()
        except Exception as model_error:
            print(f"Model loading failed: {str(model_error)}")
            result['errors'].append(f"Model loading failed: {str(model_error)}")
            result['success'] = True  # Return partial results
            return result

        # Run ML inferences with individual error handling
        sentence = None
        sentences_list = None

        # Sentiment Analysis
        try:
            print("Running sentiment analysis...")
            if sentence is None:
                sentence = Sentence(clean)
            sentiment_model.predict(sentence)
            sentiment_label = sentence.labels[0].value if sentence.labels else 'neutral'
            result['sentiment'] = sentiment_label
            print(f"Sentiment: {sentiment_label} (type: {type(sentiment_label)})")
            print(f"Sentence labels: {[str(label) for label in sentence.labels] if sentence.labels else 'None'}")
        except Exception as e:
            print(f"Sentiment analysis failed: {str(e)}")
            result['errors'].append(f"Sentiment failed: {str(e)}")

        # NER Analysis
        try:
            print("Running NER analysis...")
            if sentences_list is None:
                splitter = SegtokSentenceSplitter()
                sentences_list = splitter.split(clean)
            ner_model.predict(sentences_list)

            entities = []
            for s in sentences_list:
                for span in s.get_spans('ner'):
                    entities.append({
                        'text': span.text,
                        'label': span.tag,
                        'score': float(span.score)
                    })
            result['entities'] = entities
            print(f"Found {len(entities)} entities")
        except Exception as e:
            print(f"NER analysis failed: {str(e)}")
            result['errors'].append(f"NER failed: {str(e)}")

        # POS Tagging
        try:
            print("Running POS tagging...")
            if sentence is None:
                sentence = Sentence(clean)
            pos_model.predict(sentence)

            pos_counts = {}
            for token in sentence:
                tag = token.tag
                base = tag.split('-')[0]  # Remove sub-tags
                pos_counts[base] = pos_counts.get(base, 0) + 1
            result['pos'] = pos_counts
            print(f"POS tagging completed: {len(pos_counts)} tag types")
        except Exception as e:
            print(f"POS tagging failed: {str(e)}")
            result['errors'].append(f"POS failed: {str(e)}")

        # Topic Classification
        try:
            print("Running topic classification...")
            candidate_labels = ["politics", "finance", "technology", "health", "sports", "education"]
            topic_result_ml = topic_classifier(clean, candidate_labels)
            result['topics'] = {
                'primary': topic_result_ml['labels'][0],
                'scores': dict(zip(topic_result_ml['labels'], [float(x) for x in topic_result_ml['scores']]))
            }
            print(f"Topic: {topic_result_ml['labels'][0]}")
        except Exception as e:
            print(f"Topic classification failed: {str(e)}")
            result['errors'].append(f"Topic failed: {str(e)}")

        # Flagged words detection (server-side)
        try:
            print("Running flagged words detection...")
            flagged_words = detect_flagged_words_server(clean)
            result['flagged_words'] = flagged_words
            print(f"Found {len(flagged_words)} flagged words")
        except Exception as e:
            print(f"Flagged words detection failed: {str(e)}")
            result['errors'].append(f"Flagged words failed: {str(e)}")
            result['flagged_words'] = []

        result['success'] = True
        print(f"Analysis completed with {len(result['errors'])} errors")
        return result

    except Exception as e:
        print(f"Critical error during NLP analysis: {str(e)}")
        result['errors'].append(f"Critical error: {str(e)}")
        return result

def transcribe_audio(audio_url):
    """Transcribe audio using OpenAI Whisper API"""
    try:
        # Get OpenAI API key from environment
        openai_api_key = os.environ.get('OPENAI_API_KEY')
        if not openai_api_key:
            raise ValueError("OPENAI_API_KEY environment variable not set")

        print(f"Downloading audio from: {audio_url}")

        # Download audio file
        response = requests.get(audio_url, timeout=60)
        response.raise_for_status()

        # Save to temporary file
        with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as temp_file:
            temp_file.write(response.content)
            temp_file_path = temp_file.name

        print(f"Audio downloaded to: {temp_file_path}, size: {len(response.content)} bytes")

        # Transcribe using OpenAI Whisper API
        print("Sending to OpenAI Whisper API...")
        with open(temp_file_path, 'rb') as audio_file:
            whisper_response = requests.post(
                'https://api.openai.com/v1/audio/transcriptions',
                headers={
                    'Authorization': f'Bearer {openai_api_key}'
                },
                files={
                    'file': ('audio.webm', audio_file, 'audio/webm')
                },
                data={
                    'model': 'whisper-1',
                    'response_format': 'text',
                    'language': 'en'
                },
                timeout=120  # 2 minutes timeout
            )

        # Clean up temp file
        os.unlink(temp_file_path)

        if whisper_response.status_code == 200:
            transcription = whisper_response.text.strip()
            print(f"Whisper transcription successful: {len(transcription)} characters")
            return transcription
        else:
            error_msg = f"Whisper API error: {whisper_response.status_code} - {whisper_response.text}"
            print(error_msg)
            raise Exception(error_msg)

    except Exception as e:
        print(f"Audio transcription failed: {str(e)}")
        raise

def detect_flagged_words_server(text):
    """Server-side flagged words detection"""
    lower_text = text.lower()
    words = lower_text.split()
    word_count = {}

    # Count word frequencies
    for word in words:
        clean_word = ''.join(c for c in word if c.isalnum()).lower()
        if len(clean_word) > 2:  # Ignore very short words
            word_count[clean_word] = word_count.get(clean_word, 0) + 1

    # Define flagged word categories
    flagged_categories = {
        'profanity': [
            'damn', 'hell', 'shit', 'fuck', 'bitch', 'asshole', 'bastard', 'crap',
            'piss', 'dick', 'cock', 'pussy', 'tits', 'ass', 'cum', 'jerk'
        ],
        'sensitive': [
            'kill', 'death', 'die', 'dead', 'suicide', 'abuse', 'rape', 'violence',
            'hate', 'racist', 'sexist', 'discrimination', 'harassment', 'bullying'
        ],
        'urgency': [
            'emergency', 'urgent', 'crisis', 'critical', 'immediate', 'asap',
            'priority', 'important', 'attention', 'warning', 'alert', 'help',
            'problem', 'issue', 'trouble', 'worried', 'concerned', 'serious'
        ],
        'medical': [
            'pain', 'hurt', 'injury', 'illness', 'disease', 'sick', 'hospital',
            'doctor', 'medication', 'treatment', 'symptoms', 'diagnosis', 'health',
            'medicine', 'therapy', 'appointment', 'checkup', 'condition'
        ],
        'positive': [
            'happy', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic',
            'awesome', 'brilliant', 'perfect', 'love', 'excited', 'thrilled',
            'delighted', 'pleased', 'satisfied', 'joy', 'cheerful', 'optimistic',
            'hopeful', 'grateful', 'thankful', 'blessed', 'proud', 'confident',
            'successful', 'achieved', 'accomplished', 'victory', 'win', 'celebrate',
            'good', 'nice', 'better', 'best', 'well', 'fine', 'okay', 'yes',
            'right', 'correct', 'true', 'sure', 'absolutely', 'definitely'
        ]
    }

    flagged_words = []

    # Check for profanity and sensitive words
    for category, word_list in flagged_categories.items():
        for flagged_word in word_list:
            if flagged_word in word_count:
                flagged_words.append({
                    'word': flagged_word,
                    'category': category,
                    'frequency': word_count[flagged_word],
                    'severity': 'high' if category in ['profanity', 'sensitive'] else 'medium' if category == 'urgency' else 'low'
                })

    # Check for frequently repeated words (potential emphasis or issues)
    total_words = sum(word_count.values())
    for word, count in word_count.items():
        frequency = count / total_words
        if frequency > 0.05 and count > 3:  # More than 5% of text and repeated more than 3 times
            if not any(fw['word'] == word for fw in flagged_words):
                flagged_words.append({
                    'word': word,
                    'category': 'repetitive',
                    'frequency': count,
                    'severity': 'low'
                })

    # Sort by severity
    severity_order = {'high': 3, 'medium': 2, 'low': 1}
    flagged_words.sort(key=lambda x: severity_order[x['severity']], reverse=True)

    return flagged_words

@app.route('/nlp_analyze', methods=['POST', 'OPTIONS'])
def nlp_analyze():
    """Google Cloud Function endpoint for NLP analysis"""
    # Handle preflight OPTIONS request
    if request.method == 'OPTIONS':
        response = app.make_response('')
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'POST, OPTIONS')
        return response

    try:
        # Get Firebase Auth token from header
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({
                'success': False,
                'error': 'Missing or invalid Authorization header'
            }), 401

        token = auth_header.split(' ')[1]

        # Verify Firebase token
        try:
            get_firebase_app()
            decoded_token = auth.verify_id_token(token)
            user_id = decoded_token['uid']
            print(f"Authenticated user: {user_id}")
        except Exception as e:
            print(f"Token verification failed: {str(e)}")
            return jsonify({
                'success': False,
                'error': 'Invalid authentication token'
            }), 401

        # Get request data
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': 'No JSON data provided'
            }), 400

        transcription = data.get('transcription', '').strip()
        audio_url = data.get('audioUrl', '').strip()

        if not transcription and not audio_url:
            return jsonify({
                'success': False,
                'error': 'No transcription or audio URL provided'
            }), 400

        # Run NLP analysis
        result = analyze_transcription(transcription, audio_url)

        # Add user ID to result for tracking
        result['user_id'] = user_id

        return jsonify(result)

    except ValueError as e:
        print(f"Validation error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400

    except Exception as e:
        print(f"Server error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'nlp_processor_gcf',
        'models_loaded': _sentiment_model is not None
    })

if __name__ == '__main__':
    # For local testing
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 8080)), debug=True)
