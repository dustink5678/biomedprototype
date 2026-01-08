/**
 * @file index.ts
 * @description Firebase Cloud Functions entry point - exports all callable functions.
 * 
 * @module functions/index
 * @requires firebase-admin - Admin SDK initialization
 * @requires ./fileUploads - File upload functions
 * @requires ./sessionOperations - Session CRUD functions
 * 
 * @connections
 * - Called by: Client app via Firebase SDK
 * - Exports: createSession, uploadSessionFiles
 * 
 * @summary
 * Entry point for TypeScript Cloud Functions.
 * Initializes Firebase Admin SDK and exports:
 * - createSession: Create new session in Firestore
 * - uploadSessionFiles: Upload media files to Storage
 */

import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK
admin.initializeApp();

// Import and export Cloud Functions
import { uploadSessionFiles } from './fileUploads';
import { createSession } from './sessionOperations';

export { createSession, uploadSessionFiles };
