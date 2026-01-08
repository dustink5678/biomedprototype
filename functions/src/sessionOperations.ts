/**
 * @file sessionOperations.ts
 * @description Cloud Function for creating new recording sessions.
 * 
 * @module functions/sessionOperations
 * @requires firebase-admin - Firestore access
 * @requires firebase-functions - Cloud Function definitions
 * @requires uuid - Session ID generation
 * 
 * @connections
 * - Called by: Client Recording and Upload pages
 * - Writes to: Firestore sessions collection
 * 
 * @summary
 * Creates new session documents with full metadata:
 * - Agent and interviewee information
 * - Questions array for segmentation
 * - Initial NLP analysis status
 * - File URL placeholders
 * - Synchronization timestamps
 * Returns session ID and basic info to client.
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { v4 as uuidv4 } from 'uuid';

const db = admin.firestore();

interface CreateSessionData {
    agentName?: string;
    intervieweeName?: string;
    sessionTitle?: string;
    customQuestions?: string[];
    timestamp?: string;
    // Additional fields for rich session creation (matching recording sessions)
    intervieweeInfo?: {
        name: string;
        role: string;
        department: string;
    };
    description?: string;
    duration?: number;
}

export const createSession = functions.https.onCall(async (data: CreateSessionData, context) => {
    try {
        // Check authentication
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }

        const { agentName, intervieweeName, sessionTitle, customQuestions, timestamp, intervieweeInfo, description, duration } = data;
        const agentId = context.auth.uid;

        // Convert questions array to question objects (matching recording format)
        const questions = (customQuestions || []).map((text, index) => ({
            id: `question_${Date.now()}_${index}`,
            text: text,
            order: index
        }));

        const sessionId = uuidv4();
        const session = {
            id: sessionId,
            title: sessionTitle || `${agentName} - ${intervieweeName} Session`,
            description: description || `Recording session with ${intervieweeName}`,
            agentId,
            agentName: agentName || context.auth.token.name || 'Unknown',
            intervieweeName: intervieweeName || '',
            intervieweeInfo: intervieweeInfo || null,
            customQuestions: customQuestions || [],
            sessionQuestions: questions, // Rich question objects for segmentation
            questions: questions, // For backwards compatibility
            status: 'created',
            createdAt: admin.firestore.Timestamp.now(),
            startTime: null,
            endTime: null,
            duration: duration || 0,
            files: {
                videoUrl: null,
                audioUrl: null,
                transcriptionUrl: null,
                nlpAnalysisUrl: null
            },
            synchronization: {
                baseTimestamp: timestamp ? new Date(timestamp).getTime() : Date.now(),
                uploadTime: new Date().toISOString(),
                fileTypes: {
                    video: false,
                    audio: false,
                    transcription: false
                }
            },
            nlpAnalysis: {
                status: 'pending',
                completedAt: null,
                results: null
            },
            segments: [], // Will be populated during upload processing
            transcription: null,
            statistics: {
                wordCount: 0,
                sentenceCount: 0,
                charCount: 0,
                questionsCount: questions.length,
                segmentsCount: 0
            }
        };

        // Save to Firestore
        await db.collection('sessions').doc(sessionId).set(session);

        return {
            success: true,
            session: {
                id: sessionId,
                title: session.title,
                description: session.description,
                status: session.status,
                createdAt: session.createdAt
            }
        };

    } catch (error) {
        console.error('Error creating session:', error);
        throw new functions.https.HttpsError('internal', 'Failed to create session');
    }
});














