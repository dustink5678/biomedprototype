/**
 * @file Dashboard.js
 * @description Main dashboard page displaying user overview, recent sessions, and quick action cards.
 * 
 * @module pages/Dashboard
 * @requires firebase/firestore - Firestore database operations
 * @requires react-router-dom - Navigation
 * @requires ../context/AuthContext - User authentication state
 * @requires ../services/firebaseSessions - Session CRUD operations
 * 
 * @connections
 * - Used by: App.js (route)
 * - Uses: LoadingSpinner, UserProfile components
 * - Uses: AuthContext for user data
 * - Uses: firebaseSessions service for session operations
 * 
 * @summary
 * Serves as the landing page after login. Displays:
 * - User profile information
 * - Quick action cards for navigation (Recording, Sessions, Upload)
 * - Recent sessions table with view/record/delete actions
 * - Session statistics and NLP analysis status
 */

import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from '../components/LoadingSpinner';
import UserProfile from '../components/UserProfile';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { deleteSessionDoc } from '../services/firebaseSessions';

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [recentSessions, setRecentSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Firebase collections
  const sessionsCol = collection(db, 'sessions');

  useEffect(() => {
    loadDashboardData();
  }, []);


  // NLP analysis now runs automatically when sessions end



  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get sessions directly from Firestore
      let q = query(sessionsCol, orderBy('createdAt', 'desc'));
      if (user?.uid) {
        q = query(sessionsCol, where('agentId', '==', user.uid), orderBy('createdAt', 'desc'));
      }
      const snap = await getDocs(q);
      const sessions = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter(session => !session.deletedAt);

      // Get recent sessions (last 5)
      const recent = sessions
        .sort((a, b) => {
          let dateA = a.createdAt;
          let dateB = b.createdAt;

          // Handle different date formats
          try {
            if (dateA?.toDate) dateA = dateA.toDate();
            if (dateB?.toDate) dateB = dateB.toDate();

            dateA = new Date(dateA);
            dateB = new Date(dateB);

            if (isNaN(dateA.getTime())) dateA = new Date(0);
            if (isNaN(dateB.getTime())) dateB = new Date(0);
          } catch (error) {
            console.error('Error parsing date for sorting:', error);
            dateA = new Date(0);
            dateB = new Date(0);
          }

          return dateB - dateA;
        })
        .slice(0, 5);
      setRecentSessions(recent);

    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      if (error.code === 'ECONNREFUSED' || error.message.includes('Network Error')) {
        setError('Unable to connect to server. Please ensure the server is running.');
      } else if (error.response?.status === 404) {
        setError('API endpoint not found. Please check server configuration.');
      } else {
        setError(`Failed to load dashboard data: ${error.response?.data?.message || error.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const deleteSession = async (sessionId, sessionTitle) => {
    if (!window.confirm(`Are you sure you want to PERMANENTLY delete session "${sessionTitle}"?\n\nThis will:\n• Delete all video, audio, and transcription files\n• Remove the session from the database\n• This action CANNOT be undone`)) {
      return;
    }

    // Store original sessions for potential restoration
    const originalSessions = [...recentSessions];

    try {
      // Show loading state
      setRecentSessions(prev => prev.filter(s => s.id !== sessionId));

      // Permanently delete from Firebase
      await deleteSessionDoc(sessionId);

      // Success - session is already removed from state

    } catch (error) {
      console.error('Failed to delete session:', error);

      // Restore the session in the UI if deletion failed
      setRecentSessions(originalSessions);

      // Show error message
      alert(`Failed to delete session: ${error.message || 'Unknown error'}`);
    }
  };

  const formatDuration = (milliseconds) => {
    if (!milliseconds) return '0:00';
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = Math.floor((milliseconds % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateValue) => {
    if (!dateValue) return 'N/A';

    try {
      // Handle different date formats
      let date;
      if (typeof dateValue === 'string') {
        date = new Date(dateValue);
      } else if (dateValue.toDate) {
        // Firestore timestamp
        date = dateValue.toDate();
      } else {
        date = new Date(dateValue);
      }

      if (isNaN(date.getTime())) {
        return 'Invalid Date';
      }

      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      console.error('Error formatting date:', error, dateValue);
      return 'Invalid Date';
    }
  };


  if (loading) {
    return <LoadingSpinner text="Loading dashboard..." />;
  }

  return (
    <div className="container">
      {/* Page Header */}
      <div className="page-header">
        <h1 className="page-title">Welcome back, {user?.name || 'System Administrator'}</h1>
        <p className="page-subtitle">BMed Prototype Recording System Dashboard</p>
      </div>

      {/* Error Display */}
      {error && (
        <div className="error-container">
          <div className="error-title">Dashboard Error</div>
          <div className="error-message">{error}</div>
          <button
            onClick={loadDashboardData}
            className="btn btn-primary"
            style={{ marginTop: '16px' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* User Profile Section */}
      <UserProfile />


      {/* Recent Sessions */}
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Recent Sessions</span>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => navigate('/sessions')}
            >
              View All
            </button>
          </div>
        </div>
        <div className="card-body">
          {recentSessions.length === 0 ? (
            <div className="empty-state">
              <div style={{ fontSize: '18px', fontWeight: '600', marginBottom: '10px' }}>
                No sessions yet
              </div>
              <div style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
                Start your first recording session to see it here
              </div>
              <button
                className="btn btn-primary"
                onClick={() => navigate('/recording')}
              >
                Start Recording
              </button>
            </div>
          ) : (
            <div className="table">
              <table style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Session</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Duration</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSessions.map((session) => (
                    <tr key={session.id}>
                      <td>
                        <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                          {session.title}
                        </div>
                        {session.description && (
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            {session.description.length > 50
                              ? `${session.description.substring(0, 50)}...`
                              : session.description}
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                          {session.status}
                          {session.status === 'completed' && session.transcription && session.nlpStatus === 'completed' && (
                            <span> Auto-Analyzed</span>
                          )}
                        </div>
                      </td>
                      <td>{formatDate(session.createdAt)}</td>
                      <td>{formatDuration(session.duration)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => navigate(`/replay/${session.id}`)}
                          >
                            View
                          </button>
                          {session.status === 'created' && (
                            <button
                              className="btn btn-sm btn-success"
                              onClick={() => navigate(`/recording/${session.id}`)}
                            >
                              Record
                            </button>
                          )}

                          {session.transcription && session.nlpStatus === 'failed' && (
                            <span className="badge badge-danger">Analysis Failed</span>
                          )}
                          {session.transcription && session.nlpStatus === 'processing' && (
                            <span className="badge badge-info">
                              <span className="spinner-border spinner-border-sm me-1" role="status"></span>
                              Analyzing...
                            </span>
                          )}
                          {session.transcription && !session.nlpStatus && (
                            <span className="badge badge-warning">Analysis Pending</span>
                          )}


                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => deleteSession(session.id, session.title)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

    </div>
  );
};

export default Dashboard; 