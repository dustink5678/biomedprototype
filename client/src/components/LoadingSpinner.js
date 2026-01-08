/**
 * @file LoadingSpinner.js
 * @description Reusable loading indicator component with customizable size and text.
 * 
 * @module components/LoadingSpinner
 * @requires react
 * 
 * @connections
 * - Used by: Dashboard, Login, Sessions, Recording, Replay, Upload pages
 * 
 * @summary
 * Displays a centered spinning loader with optional text message.
 * Supports three sizes: small, default, large.
 * Automatically injects size-specific CSS styles.
 */

import React from 'react';

const LoadingSpinner = ({ text = 'Loading...', size = 'default' }) => {
  const getSizeClass = () => {
    switch (size) {
      case 'small': return 'loading-spinner-small';
      case 'large': return 'loading-spinner-large';
      default: return '';
    }
  };

  return (
    <div className="loading-container">
      <div className={`loading-spinner ${getSizeClass()}`}></div>
      <div className="loading-text">{text}</div>
    </div>
  );
};

// Additional CSS for different sizes
const additionalStyles = `
.loading-spinner-small {
  width: 30px !important;
  height: 30px !important;
  border-width: 3px !important;
}

.loading-spinner-large {
  width: 80px !important;
  height: 80px !important;
  border-width: 6px !important;
}
`;

// Inject additional styles
if (typeof document !== 'undefined') {
  const styleElement = document.createElement('style');
  styleElement.textContent = additionalStyles;
  document.head.appendChild(styleElement);
}

export default LoadingSpinner; 