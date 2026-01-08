/**
 * @file fileUploads.ts
 * @description Cloud Function for uploading session files to Firebase Storage.
 * 
 * @module functions/fileUploads
 * @requires @google-cloud/storage - GCS client
 * @requires firebase-admin - Firestore access
 * @requires firebase-functions - Cloud Function definitions
 * 
 * @connections
 * - Called by: Client Upload page
 * - Writes to: Firebase Storage (sessions/[sessionId]/)
 * - Updates: Firestore session document with file URLs
 * 
 * @summary
 * Handles base64-encoded file uploads for sessions:
 * - Validates user authentication and session ownership
 * - Uploads video, audio, transcription files to Storage
 * - Generates signed URLs (24-hour expiry)
 * - Updates session document with file URLs and sync data
 */

import { Storage } from '@google-cloud/storage';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

const db = admin.firestore();
const storage = new Storage();

interface FileData {
    data: string; // base64 encoded file data
    name: string; // original filename
    type: string; // MIME type
}

interface UploadFilesData {
    sessionId: string;
    files: {
        video?: FileData;
        audio?: FileData;
        transcription?: FileData;
    };
    synchronizationData?: {
        baseTimestamp: number;
        uploadTime: string;
        fileTypes: {
            video: boolean;
            audio: boolean;
            transcription: boolean;
        };
    };
}

export const uploadSessionFiles = functions.https.onCall(async (data: UploadFilesData, context) => {
    try {
        // Check authentication
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }

        const { sessionId, files, synchronizationData } = data;

        // Verify session exists and user has access
        const sessionRef = db.collection('sessions').doc(sessionId);
        const sessionDoc = await sessionRef.get();

        if (!sessionDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Session not found');
        }

        const sessionData = sessionDoc.data();
        if (sessionData?.agentId !== context.auth.uid) {
            throw new functions.https.HttpsError('permission-denied', 'Access denied to this session');
        }

        const bucket = storage.bucket(process.env.FIREBASE_STORAGE_BUCKET || 'biomedicalprototype.firebasestorage.app');
        const processedFiles: any = {
            video: null,
            audio: null,
            transcription: null
        };

        // Upload files to Firebase Storage
        for (const [fileType, file] of Object.entries(files)) {
            if (file) {
                const fileName = `${sessionId}/${fileType}.${getFileExtension(file.name)}`;
                const fileRef = bucket.file(fileName);

                // Convert base64 to Buffer for upload
                const buffer = Buffer.from(file.data, 'base64');

                // Upload file to Firebase Storage
                await fileRef.save(buffer, {
                    metadata: {
                        contentType: file.type,
                        metadata: {
                            originalName: file.name,
                            sessionId: sessionId,
                            fileType: fileType
                        }
                    }
                });

                // Get download URL
                const [url] = await fileRef.getSignedUrl({
                    action: 'read',
                    expires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
                });

                processedFiles[fileType] = {
                    name: file.name,
                    size: buffer.length,
                    type: file.type,
                    url: url,
                    uploadedAt: admin.firestore.Timestamp.now()
                };
            }
        }

        // Update session with file URLs
        const updateData: any = {
            files: {
                videoUrl: processedFiles.video?.url || null,
                audioUrl: processedFiles.audio?.url || null,
                transcriptionUrl: processedFiles.transcription?.url || null,
                nlpAnalysisUrl: null
            },
            status: 'uploaded'
        };

        // Add synchronization data if provided
        if (synchronizationData) {
            updateData.synchronization = {
                baseTimestamp: synchronizationData.baseTimestamp,
                uploadTime: synchronizationData.uploadTime,
                fileTypes: synchronizationData.fileTypes
            };
        }

        await sessionRef.update(updateData);

        return {
            success: true,
            message: 'Files uploaded successfully',
            files: processedFiles
        };

    } catch (error) {
        console.error('Error uploading files:', error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', 'Failed to upload files');
    }
});

function getFileExtension(filename: string): string {
    return filename.split('.').pop() || '';
}
