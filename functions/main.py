"""
@file main.py
@description Google Cloud Function for NLP analysis with model volume mounting.

@module functions/main
@requires flair - NLP models (sentiment, NER, POS)
@requires transformers - HuggingFace topic classification
@requires google.cloud.speech - Audio transcription
@requires firebase_admin - Token verification

@connections
- Called by: Client nlpService.js
- Reads from: GCS volume mount at /mnt/models
- Authenticates: Firebase Auth tokens

@summary
Production NLP Cloud Function with optimized model loading:
- Models loaded from GCS volume mount (avoids runtime downloads)
- Sentiment analysis using Flair
- Named Entity Recognition using Flair
- Part-of-Speech tagging using Flair
- Topic classification using HuggingFace BART
- Audio transcription via Google Cloud Speech-to-Text
- Firebase Auth token verification

Entry point: nlp_analyze (HTTP function)
"""

import functions_framework
from flair.nn import Classifier
from flair.data import Sentence
from flair.splitter import SegtokSentenceSplitter
from flair.models import SequenceTagger
import contractions
from transformers import pipeline
import firebase_admin
from firebase_admin import auth
import flair
from pathlib import Path
import os
from google.cloud import speech
import urllib.parse
import shutil
import subprocess

# --- CONFIGURATION & SETUP ---

# 1. FORCE CACHE TO TMP
# Google Cloud Functions allows writes ONLY to /tmp.
# Flair defaults to ~/.flair which is read-only here.
flair.cache_root = Path('/tmp')

# 2. MODEL PATHS (FROM GCS MOUNT)
# We mount the bucket 'biomedicalprototype-models' to '/mnt/models'
MOUNT_PATH = Path('/mnt/models')
SENTIMENT_MODEL_PATH = MOUNT_PATH / 'sentiment.pt'
NER_MODEL_PATH = MOUNT_PATH / 'ner-fast.pt' 
POS_MODEL_PATH = MOUNT_PATH / 'pos-english.pt'
TOPIC_MODEL_PATH = MOUNT_PATH / 'bart-large-mnli'

# Initialize Firebase Admin (lazy)
firebase_app = None

def get_firebase_app():
    global firebase_app
    if firebase_app is None:
        firebase_app = firebase_admin.initialize_app()
    return firebase_app

# Global model variables
_sentiment_model = None
_ner_model = None
_pos_model = None
_topic_classifier = None
_speech_client = None

def get_speech_client():
    global _speech_client
    if _speech_client is None:
        _speech_client = speech.SpeechClient()
    return _speech_client

def get_models():
    """Load models from the GCS volume mount to avoid runtime downloads"""
    global _sentiment_model, _ner_model, _pos_model, _topic_classifier

    try:
        # A. Sentiment Model
        if _sentiment_model is None:
            if SENTIMENT_MODEL_PATH.exists():
                print(f"Loading sentiment model from {SENTIMENT_MODEL_PATH}...")
                _sentiment_model = Classifier.load(SENTIMENT_MODEL_PATH)
            else:
                print(f"⚠️ Model not found at {SENTIMENT_MODEL_PATH}. Downloading (slow)...")
            _sentiment_model = Classifier.load('sentiment')

        # B. NER Model
        if _ner_model is None:
            if NER_MODEL_PATH.exists():
                print(f"Loading NER model from {NER_MODEL_PATH}...")
                _ner_model = SequenceTagger.load(NER_MODEL_PATH)
            else:
                print(f"⚠️ Model not found at {NER_MODEL_PATH}. Downloading (slow)...")
                # Fallback to 'ner' (fast) if file missing
                _ner_model = SequenceTagger.load('ner')

        # C. POS Model
        if _pos_model is None:
            if POS_MODEL_PATH.exists():
                print(f"Loading POS model from {POS_MODEL_PATH}...")
                _pos_model = SequenceTagger.load(POS_MODEL_PATH)
            else:
                print("⚠️ POS model not found in mount. Attempting download (risky)...")
                # Fallback logic with aggressive cleanup
                pos_cache_dir = flair.cache_root / 'models' / 'pos-english'
                if pos_cache_dir.exists():
                    shutil.rmtree(pos_cache_dir, ignore_errors=True)
                
                try:
                    _pos_model = SequenceTagger.load('pos')
                except Exception as e:
                    print(f"⚠️ Failed to load POS fallback: {e}")
                    _pos_model = None

        # D. Topic Classifier (HuggingFace Transformers)
        if _topic_classifier is None:
            if TOPIC_MODEL_PATH.exists():
                print(f"Loading topic classification model from {TOPIC_MODEL_PATH}...")
                _topic_classifier = pipeline('zero-shot-classification',
                                           model=str(TOPIC_MODEL_PATH))
            else:
                print("⚠️ Topic model not found in mount. Attempting download (may be rate limited)...")
                try:
                    _topic_classifier = pipeline('zero-shot-classification',
                                               model='facebook/bart-large-mnli')
                except Exception as e:
                    print(f"⚠️ Failed to load Topic fallback: {e}")
                    _topic_classifier = None

        print("✅ All models loaded successfully")
        return _sentiment_model, _ner_model, _pos_model, _topic_classifier

    except Exception as e:
        print(f"❌ Error loading models: {str(e)}")
        if MOUNT_PATH.exists():
            print(f"Contents of {MOUNT_PATH}: {[p.name for p in MOUNT_PATH.glob('*')]}")
        else:
            print(f"Mount path {MOUNT_PATH} does not exist!")
        raise

def convert_to_gs_uri(http_url):
    """Converts a Firebase Storage HTTP URL to a gs:// URI"""
    if not http_url or not http_url.startswith('https://firebasestorage.googleapis.com'):
        return http_url
    try:
        # Parse the URL: /v0/b/[BUCKET]/o/[OBJECT_PATH]?token=...
        parsed = urllib.parse.urlparse(http_url)
        path_parts = parsed.path.split('/')
        
        # Bucket is usually at index 3, Object path starts at index 5
        # Example path: /v0/b/my-bucket/o/folder%2Ffile.wav
        if len(path_parts) > 5 and path_parts[2] == 'b' and path_parts[4] == 'o':
            bucket = path_parts[3]
            # The object path is URL-encoded (e.g., %2F for /)
            object_path = urllib.parse.unquote(path_parts[5])
            
            gs_uri = f"gs://{bucket}/{object_path}"
            print(f"Converted URL to GS URI: {gs_uri}")
            return gs_uri
            
    except Exception as e:
        print(f"Error converting URL to GS URI: {e}")
    
    return http_url

def transcribe_gcs(gcs_uri):
    """Transcribe audio from GCS using Google Cloud Speech-to-Text"""
    
    # Convert HTTPS URL to GS URI if needed
    gcs_uri = convert_to_gs_uri(gcs_uri)
    
    print(f"🎙️ Transcribing audio from {gcs_uri}...")
    client = get_speech_client()
    
    audio = speech.RecognitionAudio(uri=gcs_uri)
    
    # Configure for WebM/Opus (standard for browser recording) or generic
    # Use 'latest_long' model for better quality on longer audio
    config = speech.RecognitionConfig(
        encoding=speech.RecognitionConfig.AudioEncoding.WEBM_OPUS,
        sample_rate_hertz=48000, # Standard for WebM
        language_code="en-US",
        enable_automatic_punctuation=True,
        model="latest_long",
        use_enhanced=True,
    )

    try:
        # Use long_running_recognize for robustness with longer files
        operation = client.long_running_recognize(config=config, audio=audio)
        
        print("Waiting for transcription to complete...")
        response = operation.result(timeout=480) # 8 minute timeout inside function

        transcript = ""
        for result in response.results:
            transcript += result.alternatives[0].transcript + " "
        
        return transcript.strip()
        
    except Exception as e:
        print(f"Transcription failed with WebM config, trying linear16/wav fallback: {e}")
        try:
            # Fallback configuration for WAV/Linear16
            config = speech.RecognitionConfig(
                language_code="en-US",
                enable_automatic_punctuation=True,
                model="latest_long",
                use_enhanced=True,
            )
            operation = client.long_running_recognize(config=config, audio=audio)
            response = operation.result(timeout=480)
            
            transcript = ""
            for result in response.results:
                transcript += result.alternatives[0].transcript + " "
            return transcript.strip()
        except Exception as e2:
            print(f"Transcription completely failed: {e2}")
            raise e2

def analyze_transcription(transcription):
    """Core NLP analysis function"""
    try:
        if not transcription or not isinstance(transcription, str):
            raise ValueError("Invalid transcription input")

        clean = contractions.fix(transcription.strip())
        if not clean:
            raise ValueError("Empty transcription after cleaning")

        sentiment_model, ner_model, pos_model, topic_classifier = get_models()

        splitter = SegtokSentenceSplitter()
        sentences = splitter.split(clean)
        sentence = Sentence(clean)

        print("Running analysis pipeline...")
        sentiment_model.predict(sentence)
        ner_model.predict(sentences)

        if pos_model is not None:
            try:
                pos_model.predict(sentence)
            except Exception as e:
                print(f"⚠️ POS prediction failed: {e}")

        candidate_labels = ["politics", "finance", "technology", "health", "sports", "education"]
        
        topics = {
            'primary': 'unavailable',
            'scores': {}
        }
        
        if topic_classifier is not None:
            try:
                topic_result = topic_classifier(clean, candidate_labels)
                topics = {
                    'primary': topic_result['labels'][0],
                    'scores': dict(zip(topic_result['labels'], [float(x) for x in topic_result['scores']]))
                }
            except Exception as e:
                print(f"⚠️ Topic prediction failed: {e}")

        # Process Results
        sentiment_label = sentence.labels[0].value if sentence.labels else 'neutral'
        sentiment_score = float(sentence.labels[0].score) if sentence.labels else 0.0

        pos_counts = {}
        if pos_model is not None:
            for token in sentence:
                if token.tag:
                    base = token.tag.split('-')[0]
                    pos_counts[base] = pos_counts.get(base, 0) + 1

        entities = []
        for s in sentences:
            for span in s.get_spans('ner'):
                entities.append({
                    'text': span.text,
                    'label': span.tag,
                    'score': float(span.score)
                })

        return {
            'success': True,
            'sentiment': {
                'label': sentiment_label,
                'score': sentiment_score
            },
            'entities': entities,
            'pos': pos_counts,
            'topics': topics,
            'stats': {
                'words': len(sentence),
                'sentences': len(sentences),
                'chars': len(clean)
        }
        }

    except Exception as e:
        print(f"Analysis error: {str(e)}")
        raise

@functions_framework.http
def nlp_analyze(request):
    # CORS
    if request.method == 'OPTIONS':
        headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '3600'
        }
        return ('', 204, headers)

    headers = {'Access-Control-Allow-Origin': '*'}

    try:
        # Auth
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return ({'error': 'Unauthorized'}, 401, headers)

        token = auth_header.split(' ')[1]
        get_firebase_app()
        decoded = auth.verify_id_token(token)
        uid = decoded['uid']

        # Input
        if not request.is_json:
            return ({'error': 'JSON required'}, 400, headers)

        data = request.get_json()
        
        # Determine mode: Text Analysis vs Audio Transcription + Analysis
        text = data.get('transcription', '').strip()
        audio_uri = data.get('audioUrl', '').strip()
        
        result = {}
        
        if audio_uri:
            print(f"🎤 Received audio for transcription: {audio_uri}")
            try:
                # Perform server-side transcription
                text = transcribe_gcs(audio_uri)
                print(f"📝 Transcribed text: {text[:50]}...")
                result['transcription'] = text
                
                # If transcription failed or was empty, handle gracefully
                if not text:
                     result['success'] = False
                     result['error'] = "Transcription yielded no text"
                     return (result, 200, headers)
                     
            except Exception as e:
                print(f"Transcription error: {e}")
                return ({'error': f'Transcription failed: {str(e)}'}, 500, headers)
        
        # If we have text (from input or transcription), analyze it
        if text:
            analysis = analyze_transcription(text)
            result.update(analysis) # Merge analysis results
            result['user_id'] = uid
            return (result, 200, headers)
        else:
             return ({'error': 'No text provided and no audio to transcribe'}, 400, headers)

    except ValueError as e:
        return ({'error': str(e)}, 400, headers)
    except Exception as e:
        print(f"Server Error: {e}")
        return ({'error': 'Internal server error'}, 500, headers)
