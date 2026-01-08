/**
 * @file SocketContext.js
 * @description React context for real-time communication (currently disabled/placeholder).
 * 
 * @module context/SocketContext
 * @requires react
 * 
 * @connections
 * - Used by: App.js (provider wrapping), Recording page
 * - Future: May integrate with Azure SignalR for production scalability
 * 
 * @summary
 * Real-time communication context (currently disabled):
 * - Provides socket connection state
 * - Placeholder methods for recording status updates
 * - Placeholder methods for transcription updates
 * - Ready for future Socket.IO or Azure SignalR integration
 * 
 * @exports useSocket - Hook to access socket context
 * @exports SocketProvider - Provider component
 */

import React, { createContext, useContext, useEffect, useState } from 'react';

const SocketContext = createContext();

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  // Disable socket connection for now since we're not using the server
  const initializeSocket = () => {
    setIsConnected(false);
  };

  const disconnectSocket = () => {
    setIsConnected(false);
  };

  const sendRecordingStatus = (sessionId, status, timestamp) => {
    // Status updates are handled directly in the Recording component
  };

  const sendTranscriptionUpdate = (sessionId, text, timestamp) => {
    // Transcription updates are handled directly in the Recording component
  };

  useEffect(() => {
    // Don't initialize socket connection
    return () => {
      // Don't disconnect
    };
  }, []);

  const value = {
    socket,
    isConnected,
    sendRecordingStatus,
    sendTranscriptionUpdate,
    disconnectSocket
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}; 