/**
 * @file nlpService.js
 * @description Client interface to Google Cloud Function for NLP analysis.
 * 
 * @module services/nlpService
 * @requires firebase/auth - Firebase authentication for Cloud Function authorization
 * 
 * @connections
 * - Used by: Recording, Upload pages (after session completion)
 * - Calls: Google Cloud Function (nlp_processor_gcf)
 * - Uses: Firebase Auth for bearer token authorization
 * 
 * @summary
 * Sends transcription text to Cloud Function for NLP analysis.
 * Returns structured analysis including:
 * - Sentiment (label + confidence score)
 * - Named entities
 * - Part-of-speech counts and percentages
 * - Topic classification
 * - Flagged words
 * - Text statistics (word/char/sentence counts)
 * 
 * Cloud Function URL configured via REACT_APP_GCF_NLP_URL environment variable.
 * No client-side fallback - only Cloud Functions are supported.
 */

import { getAuth } from 'firebase/auth';

// Analyzes transcription text using Google Cloud Function NLP
export const analyzeTranscription = async (transcription, audioUrl = null) => {
    const logPrefix = '[nlpService:analyzeTranscription]';

    try {

        // Get Firebase Auth token
        const auth = getAuth();
        const user = auth.currentUser;
        if (!user) {
            throw new Error('User not authenticated');
        }

        const token = await user.getIdToken();

        // Call Google Cloud Function
        const gcfUrl = process.env.REACT_APP_GCF_NLP_URL || 'https://us-central1-biomedicalprototype.cloudfunctions.net/nlp_processor_gcf';

        const payload = {
            transcription: transcription ? transcription.trim() : '',
            audioUrl: audioUrl || ''
        };

        const requestStartTime = Date.now();
        const response = await fetch(gcfUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        // eslint-disable-next-line no-unused-vars
        const requestTime = Date.now() - requestStartTime;

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`${logPrefix} Step 3: Cloud Function error response:`, errorText);
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();


        // Check if we got a transcription back from the server (if we sent audio)
        const effectiveTranscription = result.transcription || transcription;

        if (result.success) {

            // If server transcribed it, log it
            if (result.transcription && result.transcription !== transcription) {
            }

            // Calculate POS percentages
            const posCounts = result.pos || {};
            const totalPosTags = Object.values(posCounts).reduce((sum, count) => sum + count, 0);
            const posPercentages = {};
            Object.keys(posCounts).forEach(tag => {
                posPercentages[tag] = totalPosTags > 0 ? ((posCounts[tag] / totalPosTags) * 100).toFixed(1) + '%' : '0.0%';
            });

            // Transform sentiment from string to object format
            let sentimentObj = { label: 'NEUTRAL', score: 0.5 };
            if (result.sentiment && typeof result.sentiment === 'string') {
                const sentimentStr = result.sentiment.toUpperCase();
                if (sentimentStr === 'POSITIVE') {
                    sentimentObj = { label: 'POSITIVE', score: 0.8 };
                } else if (sentimentStr === 'NEGATIVE') {
                    sentimentObj = { label: 'NEGATIVE', score: 0.8 };
                }
            } else if (result.sentiment && typeof result.sentiment === 'object') {
                // Handle case where sentiment is already an object
                sentimentObj = result.sentiment;
            }


            // Transform GCF response to match client-side analyzer format
            return {
                sentiment: sentimentObj,
                entities: result.entities || [],
                pos_counts: posCounts,
                pos_percentages: posPercentages,
                topics: result.topics || { primary: 'general', scores: {} },
                flagged_words: result.flagged_words || [],
                transcription: effectiveTranscription, // Return the actual text used/generated
                stats: {
                    words: result.word_count || 0,
                    chars: result.char_count || 0,
                    sentences: result.sentence_count || 0
                },
                success: true
            };
        } else {
            console.error(`${logPrefix} Step 3: Cloud Function returned error:`, result.error);
            throw new Error(result.error || 'NLP analysis failed');
        }
    } catch (error) {
        console.error(`${logPrefix} Google Cloud Functions NLP analysis failed - NO FALLBACK AVAILABLE:`, error);

        // Return failure - no client-side fallback allowed
        return {
            success: false,
            error: `Cloud Function NLP analysis failed: ${error.message}. No fallback available - only Cloud Functions are supported.`
        };
    }
};
