/**
 * @file App.js
 * @description Root application component defining routes, providers, and layout structure.
 * 
 * @module App
 * @requires react-router-dom - Client-side routing
 * @requires ./context/AuthContext - Authentication state provider
 * @requires ./context/SocketContext - Real-time communication provider
 * @requires ./context/FirebaseContext - Firebase services provider
 * 
 * @connections
 * - Entry point: index.js renders this component
 * - Provides: AuthProvider, FirebaseProvider, SocketProvider to all children
 * - Routes to: Login, Dashboard, Recording, Replay, Upload, Sessions pages
 * 
 * @summary
 * Main application structure:
 * - Context providers for Firebase, Auth, and Socket
 * - ProtectedRoute component for authenticated routes
 * - Route definitions with Navbar and main content layout
 * - Catch-all redirect to dashboard
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { FirebaseProvider } from './context/FirebaseContext';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Recording from './pages/Recording';
import Replay from './pages/Replay';
import Upload from './pages/Upload';
import Sessions from './pages/Sessions';

// Components
import Navbar from './components/Navbar';
import LoadingSpinner from './components/LoadingSpinner';

import './App.css';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <LoadingSpinner />;
  }
  
  return user ? children : <Navigate to="/login" />;
};

// Main App Component
function App() {
  return (
    <Router>
      <FirebaseProvider>
        <AuthProvider>
          <div className="App">
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<Login />} />
            
            {/* Protected Routes */}
            <Route path="/" element={
              <ProtectedRoute>
                <SocketProvider>
                  <Navbar />
                  <main className="main-content">
                    <Dashboard />
                  </main>
                </SocketProvider>
              </ProtectedRoute>
            } />
            
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <SocketProvider>
                  <Navbar />
                  <main className="main-content">
                    <Dashboard />
                  </main>
                </SocketProvider>
              </ProtectedRoute>
            } />
            
            <Route path="/recording" element={
              <ProtectedRoute>
                <SocketProvider>
                  <Navbar />
                  <main className="main-content">
                    <Recording />
                  </main>
                </SocketProvider>
              </ProtectedRoute>
            } />
            
            <Route path="/recording/:sessionId" element={
              <ProtectedRoute>
                <SocketProvider>
                  <Navbar />
                  <main className="main-content">
                    <Recording />
                  </main>
                </SocketProvider>
              </ProtectedRoute>
            } />
            
            <Route path="/replay/:sessionId" element={
              <ProtectedRoute>
                <SocketProvider>
                  <Navbar />
                  <main className="main-content">
                    <Replay />
                  </main>
                </SocketProvider>
              </ProtectedRoute>
            } />
            
            <Route path="/upload" element={
              <ProtectedRoute>
                <SocketProvider>
                  <Navbar />
                  <main className="main-content">
                    <Upload />
                  </main>
                </SocketProvider>
              </ProtectedRoute>
            } />
            
            <Route path="/sessions" element={
              <ProtectedRoute>
                <SocketProvider>
                  <Navbar />
                  <main className="main-content">
                    <Sessions />
                  </main>
                </SocketProvider>
              </ProtectedRoute>
            } />
            
            {/* Catch all route */}
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </AuthProvider>
        </FirebaseProvider>
    </Router>
  );
}

export default App; 