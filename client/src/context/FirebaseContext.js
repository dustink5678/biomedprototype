/**
 * @file FirebaseContext.js
 * @description React context providing Firebase authentication methods and user state.
 * 
 * @module context/FirebaseContext
 * @requires firebase/auth - Firebase auth methods
 * @requires ../firebase - Firebase app, auth, and provider instances
 * @requires ../config/auth - Authentication mode configuration
 * 
 * @connections
 * - Used by: App.js (provider wrapping), Login page
 * - Uses: firebase.js for auth instance and Google provider
 * - Uses: config/auth.js for auth mode settings
 * - Works with: AuthContext for state management
 * 
 * @summary
 * Firebase authentication methods:
 * - Google OAuth sign-in (popup with redirect fallback)
 * - Email/password sign-in (simple mode)
 * - Sign-out functionality
 * - Handles redirect results for popup-blocked scenarios
 * - Auth mode validation before sign-in attempts
 * 
 * @exports useFirebase - Hook to access Firebase context
 * @exports FirebaseProvider - Provider component
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, googleProvider, debugFirebaseConfig } from '../firebase';
import {
  signInWithPopup,
  signInWithRedirect,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  getRedirectResult
} from 'firebase/auth';
import { AUTH_MODES, getAuthMode } from '../config/auth';

const FirebaseContext = createContext();

export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (!context) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
};

export const FirebaseProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Sign in with Google
  const signInWithGoogle = async () => {
    const currentAuthMode = getAuthMode();
    if (currentAuthMode !== AUTH_MODES.GOOGLE) {
      throw new Error(`Google authentication is disabled. Current mode: ${currentAuthMode}`);
    }

    try {
      // Configure provider for better reliability
      googleProvider.setCustomParameters({
        prompt: 'select_account'
      });

      const result = await signInWithPopup(auth, googleProvider);
      return result.user;
    } catch (error) {
      console.error('Error signing in with Google:', error);

      // Handle specific Firebase Auth errors
      if (error.code === 'auth/popup-blocked') {
        // Try redirect method as fallback
        try {
          await signInWithRedirect(auth, googleProvider);
          return; // Redirect will handle the flow
        } catch (redirectError) {
          console.error('Redirect method also failed:', redirectError);
          throw new Error('Authentication popup was blocked. Please disable popup blockers for this site and try again, or use a different browser.');
        }
      }

      if (error.code === 'auth/popup-closed-by-user') {
        throw new Error('Sign-in was cancelled. Please try again.');
      }

      if (error.code === 'auth/cancelled-popup-request') {
        throw new Error('Another sign-in request is in progress. Please wait and try again.');
      }

      throw error;
    }
  };

  // Sign in with email and password (simple authentication)
  const signInSimple = async (email, password) => {
    const currentAuthMode = getAuthMode();
    if (currentAuthMode !== AUTH_MODES.SIMPLE) {
      throw new Error(`Simple authentication is disabled. Current mode: ${currentAuthMode}`);
    }

    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      return result.user;
    } catch (error) {
      console.error('Error signing in with email/password:', error);

      if (error.code === 'auth/user-not-found') {
        throw new Error('No account found with this email address.');
      }

      if (error.code === 'auth/wrong-password') {
        throw new Error('Incorrect password. Please try again.');
      }

      if (error.code === 'auth/invalid-email') {
        throw new Error('Please enter a valid email address.');
      }

      if (error.code === 'auth/too-many-requests') {
        throw new Error('Too many failed login attempts. Please try again later.');
      }

      throw new Error(`Authentication failed: ${error.message}`);
    }
  };


  // Sign out
  const signOutUser = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  // Listen for auth state changes
  useEffect(() => {
    // Debug Firebase configuration on mount
    debugFirebaseConfig();

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    // Handle redirect result on component mount
    const handleRedirectResult = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result?.user) {
        }
      } catch (error) {
        console.error('Redirect result error:', error);
        // Handle redirect errors if needed
      }
    };

    handleRedirectResult();

    return unsubscribe;
  }, []);

  const value = {
    user,
    loading,
    signInWithGoogle,
    signInSimple,
    signOutUser
  };

  return (
    <FirebaseContext.Provider value={value}>
      {children}
    </FirebaseContext.Provider>
  );
}; 