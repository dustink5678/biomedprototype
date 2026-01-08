/**
 * @file auth.js
 * @description Authentication configuration for different environments and modes.
 * 
 * @module config/auth
 * 
 * @connections
 * - Used by: FirebaseContext, Login page, useAuthMode hook
 * 
 * @summary
 * Configures authentication behavior based on environment:
 * - AUTH_MODES: Available auth methods (GOOGLE, SIMPLE)
 * - getAuthMode: Returns current auth mode from env or defaults
 * - getAuthMethodConfig: UI configuration for each auth method
 * - getEnvironmentInfo: Current environment details
 * - canSwitchAuthMode: Whether dev mode switching is enabled
 * 
 * Production defaults to Google OAuth.
 * Development defaults to simple email/password.
 */

export const AUTH_MODES = {
  GOOGLE: 'google',
  SIMPLE: 'simple'
};

// Environment detection
export const isDevelopment = process.env.NODE_ENV === 'development';
export const isProduction = process.env.NODE_ENV === 'production';

// Authentication mode selection based on environment
export const getAuthMode = () => {
  // Allow environment variable override
  const envAuthMode = process.env.REACT_APP_AUTH_MODE;

  // Validate the environment variable
  if (envAuthMode && Object.values(AUTH_MODES).includes(envAuthMode)) {
    return envAuthMode;
  }

  // Default based on environment
  if (isDevelopment) {
    return AUTH_MODES.SIMPLE;
  }

  if (isProduction) {
    return AUTH_MODES.GOOGLE;
  }

  // Safe fallback
  return AUTH_MODES.SIMPLE;
};

export const AUTH_MODE = getAuthMode();

// Auth method configuration
export const getAuthMethodConfig = (mode) => {
  const configs = {
    [AUTH_MODES.GOOGLE]: {
      method: 'google',
      title: 'Sign in',
      subtitle: 'Use your Google account to access the system',
      icon: '',
      buttonText: 'Continue with Google',
      requiresForm: false
    },
    [AUTH_MODES.SIMPLE]: {
      method: 'simple',
      title: 'System Login',
      subtitle: 'Enter your credentials to access the system',
      icon: '🔐',
      buttonText: 'Sign In',
      requiresForm: true,
      fields: ['email', 'password']
    }
  };

  return configs[mode] || configs[AUTH_MODES.SIMPLE];
};

// Current environment indicator
export const getEnvironmentInfo = () => {
  return {
    environment: isDevelopment ? 'development' : 'production',
    authMode: AUTH_MODE,
    displayName: isDevelopment ? 'Development Mode' : 'Production Mode'
  };
};

// Development mode switching (only in development)
export const canSwitchAuthMode = () => {
  return isDevelopment && process.env.REACT_APP_ENABLE_AUTH_SWITCHING === 'true';
};
