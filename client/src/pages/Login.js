/**
 * @file Login.js
 * @description Authentication page supporting multiple sign-in methods (Google OAuth, Simple login).
 * 
 * @module pages/Login
 * @requires react-router-dom - Navigation after successful login
 * @requires ../context/AuthContext - Authentication state
 * @requires ../context/FirebaseContext - Firebase auth methods
 * @requires ../config/auth - Authentication configuration
 * @requires ../hooks/useAuthMode - Development mode auth switching
 * 
 * @connections
 * - Used by: App.js (route - entry point for unauthenticated users)
 * - Uses: AuthContext, FirebaseContext for authentication
 * - Uses: useAuthMode hook for dev mode auth switching
 * - Uses: LoadingSpinner component
 * 
 * @summary
 * Handles user authentication with support for:
 * - Google OAuth sign-in (production)
 * - Simple email/password login (development)
 * - Development mode auth method switching
 * - Error handling with user-friendly messages
 * - Automatic redirect to dashboard on successful login
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFirebase } from '../context/FirebaseContext';
import { getAuthMethodConfig, getEnvironmentInfo, AUTH_MODES } from '../config/auth';
import { useAuthMode } from '../hooks/useAuthMode';
import LoadingSpinner from '../components/LoadingSpinner';

const Login = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { signInWithGoogle, signInSimple } = useFirebase();
  const { authMode, setAuthMode, canChangeMode } = useAuthMode();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Get current auth configuration
  const authConfig = getAuthMethodConfig(authMode);
  const environmentInfo = getEnvironmentInfo();

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);



  const handleSignIn = async () => {
    setLoading(true);
    setError(null);

    try {
      let firebaseUser;

      switch (authMode) {
        case AUTH_MODES.GOOGLE:
          firebaseUser = await signInWithGoogle();
          break;

        case AUTH_MODES.SIMPLE:
          if (!email || !password) {
            throw new Error('Email and password are required');
          }
          firebaseUser = await signInSimple(email, password);
          break;

        default:
          throw new Error(`Unsupported authentication mode: ${authMode}`);
      }

      // The AuthContext will automatically handle the user state
      // through the Firebase auth state listener
      navigate('/dashboard');
    } catch (error) {
      console.error('Sign-in error:', error);

      // Handle different error types with specific messages
      if (error.message?.includes('popup was blocked')) {
        setError('Authentication popup was blocked by your browser. Please disable popup blockers for this site and try again, or allow popups when prompted.');
      } else if (error.code === 'auth/popup-closed-by-user') {
        setError('Sign-in was cancelled. Please try again.');
      } else if (error.code === 'auth/popup-blocked') {
        setError('Pop-up was blocked. Please allow pop-ups for this site and try again.');
      } else if (error.code === 'auth/cancelled-popup-request') {
        setError('Another sign-in request is in progress. Please wait and try again.');
      } else if (error.code === 'auth/network-request-failed') {
        setError('Network error. Please check your internet connection and try again.');
      } else {
        setError(error.message || 'Sign-in failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingSpinner text="Authenticating..." />;
  }

  return (
    <div className="professional-login-container">
      <div className="login-main">
        <div className="login-container-professional">
          <div className="app-header">
            <div className="app-logo">
              <img src="/logo.png" alt="BMed Logo" className="app-logo-image" />
            </div>
            <div className="app-info">
              <h1 className="app-name">BMed Prototype</h1>
              <p className="app-subtitle">Professional Recording System</p>
            </div>
          </div>

          <div className="login-form-container">
            <div className="form-header">
              <h2 className="form-title">{authConfig.title}</h2>
              <p className="form-subtitle">{authConfig.subtitle}</p>
            </div>

            {/* Development Mode Selector - Hidden in production */}
            {canChangeMode && environmentInfo.environment === 'development' && (
              <div className="auth-mode-selector">
                <label htmlFor="auth-mode-select">Authentication Mode:</label>
                <select
                  id="auth-mode-select"
                  value={authMode}
                  onChange={(e) => setAuthMode(e.target.value)}
                  className="auth-mode-dropdown"
                >
                  <option value={AUTH_MODES.SIMPLE}>Simple Login</option>
                  <option value={AUTH_MODES.GOOGLE}>Google OAuth</option>
                </select>
              </div>
            )}

            {error && (
              <div className="alert alert-error" role="alert">
                <div className="alert-body">
                  <strong>Sign in error:</strong> {error}
                  {error.includes('popup') && (
                    <div style={{ marginTop: '10px', fontSize: '14px' }}>
                      <strong>How to enable popups:</strong>
                      <ul style={{ marginTop: '5px', paddingLeft: '20px' }}>
                        <li>Look for a popup blocked icon in your browser's address bar</li>
                        <li>Click it and select "Always allow popups from this site"</li>
                        <li>Or disable popup blockers temporarily for this site</li>
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Dynamic Form Fields */}
            {authConfig.requiresForm && (
              <div className="simple-auth-form">
                <div className="form-group">
                  <label htmlFor="email">Email Address</label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="password">Password</label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                  />
                </div>
              </div>
            )}

            <div className="signin-container">
              <button
                type="button"
                onClick={handleSignIn}
                className={`btn-auth ${authMode}`}
                disabled={loading}
              >
                {authMode === AUTH_MODES.GOOGLE && (
                  <svg className="google-logo" width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                )}
                {loading ? 'Signing in...' : authConfig.buttonText}
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="login-footer">
        <div className="footer-content">
          <div className="footer-links">
            <button className="footer-link" onClick={() => {}}>Privacy Policy</button>
            <button className="footer-link" onClick={() => {}}>Terms of Service</button>
            <button className="footer-link" onClick={() => {}}>Support</button>
            <button className="footer-link" onClick={() => {}}>Contact Us</button>
          </div>
          <div className="footer-text">
            <p>BMed Prototype Recording System © 2024</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login; 