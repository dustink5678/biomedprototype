/**
 * @file firebase.js
 * @description Firebase initialization and service exports.
 * 
 * @module firebase
 * @requires firebase/app - Firebase core
 * @requires firebase/auth - Firebase Authentication
 * @requires firebase/firestore - Cloud Firestore database
 * @requires firebase/functions - Cloud Functions
 * @requires firebase/storage - Cloud Storage
 * 
 * @connections
 * - Used by: All context providers, services, and pages needing Firebase
 * - Requires: Environment variables (REACT_APP_FIREBASE_*)
 * 
 * @summary
 * Initializes Firebase app with configuration from environment variables.
 * Exports initialized services:
 * - auth: Firebase Authentication
 * - db: Firestore with auto-detect long polling
 * - storage: Cloud Storage
 * - functions: Cloud Functions
 * - googleProvider: Configured Google OAuth provider
 * 
 * @security Configuration values MUST come from environment variables.
 */

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';

// Firebase configuration from environment variables (no hardcoded values for security)
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize core services
export const auth = getAuth(app);
// Use long polling auto-detect to avoid WebChannel issues on some networks/dev setups
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  ignoreUndefinedProperties: true,
});
export const storage = getStorage(app);
export const functions = getFunctions(app);

// Initialize Google Auth Provider
export const googleProvider = new GoogleAuthProvider();

// Add scopes for better user data access
googleProvider.addScope('profile');
googleProvider.addScope('email');

// Debug function to check Firebase configuration
export const debugFirebaseConfig = () => {
};

export default app;