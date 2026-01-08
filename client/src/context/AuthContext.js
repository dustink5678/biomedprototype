/**
 * @file AuthContext.js
 * @description React context providing authentication state and methods throughout the app.
 * 
 * @module context/AuthContext
 * @requires firebase/auth - Firebase authentication
 * @requires ../firebase - Firebase app instance
 * 
 * @connections
 * - Used by: App.js (provider wrapping), all pages and components needing user data
 * - Uses: firebase.js for auth instance
 * - Works with: FirebaseContext for sign-in methods
 * 
 * @summary
 * Central authentication state management:
 * - Listens to Firebase auth state changes
 * - Provides user object with profile data
 * - Handles logout functionality
 * - Exposes loading and error states
 * - Note: Sign-in is handled by FirebaseContext
 * 
 * @exports useAuth - Hook to access auth context
 * @exports AuthProvider - Provider component
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '../firebase';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Firebase-only authentication - no localStorage needed

  // Check for existing authentication on app load
  useEffect(() => {
    // Listen for Firebase auth state changes
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        // User is signed in with Firebase
        const userData = {
          id: firebaseUser.uid,
          email: firebaseUser.email,
          name: firebaseUser.displayName || firebaseUser.email,
          photoURL: firebaseUser.photoURL,
          provider: 'google',
          isFirebaseUser: true
        };
        setUser(userData);
        
        // Firebase handles persistence automatically
      } else {
        // User is signed out from Firebase
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Firebase-only authentication - no legacy auth needed

  // Google authentication is handled by FirebaseContext
  // This method is kept for backward compatibility but not used
  const login = async (email, password) => {
    throw new Error('Google authentication is required. Please use the Google sign-in button.');
  };

  // Registration is handled through Google authentication
  const register = async (userData) => {
    throw new Error('Registration is handled through Google authentication. Please use the Google sign-in button.');
  };

  const logout = async () => {
    try {
      // Sign out from Firebase
      await firebaseSignOut(auth);
    } catch (error) {
      console.error('Logout failed:', error);
    }

    // Clear state
    setUser(null);
    setError(null);
  };

  const updateProfile = async (updatedData) => {
    try {
      setLoading(true);
      setError(null);

      // In a real implementation, this would call a profile update endpoint
      // For now, we'll just update the local user state
      const updatedUser = { ...user, ...updatedData };
      setUser(updatedUser);

      return { success: true, user: updatedUser };

    } catch (error) {
      console.error('Profile update failed:', error);
      const errorMessage = error.response?.data?.message || 'Profile update failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  const clearError = () => {
    setError(null);
  };

  const value = {
    user,
    loading,
    error,
    login,
    register,
    logout,
    updateProfile,
    clearError,

  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 