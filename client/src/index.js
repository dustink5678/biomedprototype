/**
 * @file index.js
 * @description Application entry point - renders root React component.
 * 
 * @module index
 * @requires react - React library
 * @requires react-dom/client - React DOM rendering
 * @requires ./App - Root application component
 * @requires ./index.css - Global styles
 * 
 * @summary
 * Entry point that mounts the App component to the DOM.
 * Uses React 18 createRoot API with StrictMode enabled.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
); 