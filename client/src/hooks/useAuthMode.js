/**
 * @file useAuthMode.js
 * @description React hook for managing authentication mode in development.
 * 
 * @module hooks/useAuthMode
 * @requires react - React hooks
 * @requires react-router-dom - URL search params
 * @requires ../config/auth - Auth mode configuration
 * 
 * @connections
 * - Used by: Login page for auth mode selector
 * - Uses: config/auth for mode validation
 * 
 * @summary
 * Development-only hook for switching authentication modes:
 * - Reads/writes auth mode to URL query parameter
 * - Validates mode against available AUTH_MODES
 * - Provides setAuthMode and resetToDefault functions
 * - Returns canChangeMode flag based on environment
 */

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AUTH_MODES, getAuthMode, canSwitchAuthMode } from '../config/auth';

export const useAuthMode = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentMode, setCurrentMode] = useState(getAuthMode());

  // Allow URL parameter override in development
  useEffect(() => {
    if (canSwitchAuthMode()) {
      const urlAuthMode = searchParams.get('auth');
      if (urlAuthMode && Object.values(AUTH_MODES).includes(urlAuthMode)) {
        setCurrentMode(urlAuthMode);
      } else {
        setCurrentMode(getAuthMode());
      }
    }
  }, [searchParams]);

  const setAuthMode = (mode) => {
    if (!canSwitchAuthMode()) {
      return;
    }

    if (!Object.values(AUTH_MODES).includes(mode)) {
      console.error('Invalid auth mode:', mode);
      return;
    }

    // Update URL parameter
    const newParams = new URLSearchParams(searchParams);
    newParams.set('auth', mode);
    setSearchParams(newParams);

    // Update local state
    setCurrentMode(mode);
  };

  const resetToDefault = () => {
    if (canSwitchAuthMode()) {
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('auth');
      setSearchParams(newParams);
      setCurrentMode(getAuthMode());
    }
  };

  return {
    authMode: currentMode,
    setAuthMode,
    resetToDefault,
    canChangeMode: canSwitchAuthMode(),
    availableModes: Object.values(AUTH_MODES)
  };
};
