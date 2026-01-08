/**
 * @file Sessions.js
 * @description Session management page with folder organization, filtering, and bulk actions.
 * 
 * @module pages/Sessions
 * @requires firebase/firestore - Database operations for sessions and folders
 * @requires react-router-dom - Navigation to session replay
 * @requires ../context/AuthContext - User authentication state
 * @requires ../services/firebaseSessions - Session CRUD operations
 * 
 * @connections
 * - Used by: App.js (route)
 * - Uses: LoadingSpinner component
 * - Uses: AuthContext for user data
 * - Uses: firebaseSessions service for deletion
 * - Navigates to: Replay page on session click
 * 
 * @summary
 * Comprehensive session management interface featuring:
 * - Card-based session display with metadata
 * - Dual view modes: All Sessions / By Folder
 * - Search with auto-expand in folder view
 * - Multi-select with bulk delete and folder assignment
 * - Filter by status, sort by date/title/duration
 * - Folder CRUD operations (create, delete, move sessions)
 */

import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, updateDoc, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { deleteSessionDoc } from '../services/firebaseSessions';
import { analyzeTranscription } from '../services/nlpService';

// Trash Icon Component
const TrashIcon = ({ size = 16 }) => (
  <svg 
    viewBox="0 0 24 24" 
    width={size} 
    height={size} 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
  >
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    <line x1="10" y1="11" x2="10" y2="17"></line>
    <line x1="14" y1="11" x2="14" y2="17"></line>
  </svg>
);

// Folder Icon Component
const FolderIcon = ({ size = 18, open = false }) => (
  <svg 
    viewBox="0 0 24 24" 
    width={size} 
    height={size} 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
  >
    {open ? (
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
    ) : (
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
    )}
  </svg>
);

// Chevron Icon Component
const ChevronIcon = ({ direction = 'down', size = 16 }) => (
  <svg 
    viewBox="0 0 24 24" 
    width={size} 
    height={size} 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    style={{ 
      transform: direction === 'right' ? 'rotate(-90deg)' : 'rotate(0deg)',
      transition: 'transform 0.2s ease'
    }}
  >
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
);

const Sessions = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  // Session state
  const [sessions, setSessions] = useState([]);
  const [filteredSessions, setFilteredSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');

  // Multi-select state (Phase 2)
  const [selectedSessionIds, setSelectedSessionIds] = useState(new Set());
  
  // Folder state (Phase 3)
  const [viewMode, setViewMode] = useState('all'); // 'all' | 'folders'
  const [folders, setFolders] = useState([]);
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  
  // Highlighted session for folder search (Phase 4)
  const [highlightedSessionId, setHighlightedSessionId] = useState(null);
  
  // NLP Analysis state
  const [analyzingSessionIds, setAnalyzingSessionIds] = useState(new Set());
  const [analyzedSessionIds, setAnalyzedSessionIds] = useState(new Set());

  useEffect(() => {
    if (!authLoading) {
      loadSessions();
      loadFolders();
    }
  }, [authLoading, user]);

  useEffect(() => {
    filterAndSortSessions();
  }, [sessions, searchTerm, statusFilter, sortBy, sortOrder]);

  // Auto-expand folders when searching in folder view (Phase 4)
  useEffect(() => {
    if (viewMode === 'folders' && searchTerm) {
      const matchingFolderIds = new Set();
      filteredSessions.forEach(session => {
        matchingFolderIds.add(session.folderId || 'uncategorized');
      });
      setExpandedFolders(matchingFolderIds);
      
      if (filteredSessions.length > 0) {
        setHighlightedSessionId(filteredSessions[0].id);
      }
    } else {
      setHighlightedSessionId(null);
    }
  }, [searchTerm, viewMode, filteredSessions]);

  const loadSessions = async () => {
    try {
      setLoading(true);
      setError(null);

      const sessionsCol = collection(db, 'sessions');
      let q = query(sessionsCol, orderBy('createdAt', 'desc'));
      if (user?.uid) {
        q = query(sessionsCol, where('agentId', '==', user.uid), orderBy('createdAt', 'desc'));
      }
      const snap = await getDocs(q);
      const sessionsData = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter(session => !session.deletedAt);

      if ((sessionsData?.length === 0) && process.env.NODE_ENV === 'development') {
        const allQuery = query(sessionsCol, orderBy('createdAt', 'desc'));
        const allSnap = await getDocs(allQuery);
        const allSessions = allSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter(session => !session.deletedAt);
        setSessions(allSessions || []);
      } else {
        setSessions(sessionsData || []);
      }
    } catch (error) {
      console.error('[Sessions] Failed to load sessions:', error);
      setError(`Failed to load sessions: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadFolders = async () => {
    try {
      const foldersCol = collection(db, 'folders');
      let q = query(foldersCol, orderBy('name', 'asc'));
      if (user?.uid) {
        q = query(foldersCol, where('userId', '==', user.uid), orderBy('name', 'asc'));
      }
      const snap = await getDocs(q);
      const foldersData = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setFolders(foldersData);
    } catch (error) {
      console.error('[Sessions] Failed to load folders:', error);
    }
  };

  const filterAndSortSessions = () => {
    let filtered = sessions;

    if (searchTerm) {
      filtered = filtered.filter(session =>
        (session.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (session.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (session.agentName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (session.intervieweeName || '').toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(session => session.status === statusFilter);
    }

    filtered.sort((a, b) => {
      let valueA = a[sortBy];
      let valueB = b[sortBy];

      if (sortBy === 'createdAt' || sortBy === 'startTime' || sortBy === 'endTime') {
        try {
          if (valueA?.toDate) valueA = valueA.toDate();
          if (valueB?.toDate) valueB = valueB.toDate();
          valueA = new Date(valueA);
          valueB = new Date(valueB);
          if (isNaN(valueA.getTime())) valueA = new Date(0);
          if (isNaN(valueB.getTime())) valueB = new Date(0);
        } catch (error) {
          valueA = new Date(0);
          valueB = new Date(0);
        }
      }

      if (sortBy === 'duration') {
        valueA = valueA || 0;
        valueB = valueB || 0;
      }

      return sortOrder === 'asc' 
        ? (valueA > valueB ? 1 : -1)
        : (valueA < valueB ? 1 : -1);
    });

    setFilteredSessions(filtered);
  };

  // Selection handlers (Phase 2)
  const toggleSessionSelection = (sessionId) => {
    setSelectedSessionIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sessionId)) {
        newSet.delete(sessionId);
      } else {
        newSet.add(sessionId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedSessionIds.size === filteredSessions.length) {
      setSelectedSessionIds(new Set());
    } else {
      setSelectedSessionIds(new Set(filteredSessions.map(s => s.id)));
    }
  };

  // NLP Analysis handler - manually trigger analysis for pending sessions
  const handleAnalyzeSession = async (session) => {
    setAnalyzingSessionIds(prev => new Set([...prev, session.id]));
    
    try {
      const sessionRef = doc(db, 'sessions', session.id);
      await updateDoc(sessionRef, { nlpStatus: 'processing' });
      
      const transcription = session.transcriptionText || '';
      const audioUrl = session.files?.audioUrl || null;
      
      const nlpResults = await analyzeTranscription(transcription, audioUrl);
      
      if (nlpResults.success) {
        await updateDoc(sessionRef, {
          nlpAnalysis: nlpResults,
          nlpStatus: 'completed',
          nlpProcessedAt: new Date()
        });
        // Show "Analyzed" checkmark briefly
        setAnalyzedSessionIds(prev => new Set([...prev, session.id]));
        setTimeout(() => {
          setAnalyzedSessionIds(prev => {
            const next = new Set(prev);
            next.delete(session.id);
            return next;
          });
        }, 2000);
      } else {
        await updateDoc(sessionRef, { nlpStatus: 'failed' });
      }
    } catch (error) {
      console.error('Analysis failed:', error);
      try {
        const sessionRef = doc(db, 'sessions', session.id);
        await updateDoc(sessionRef, { nlpStatus: 'failed' });
      } catch (updateError) {
        // Ignore update error
      }
    } finally {
      setAnalyzingSessionIds(prev => {
        const next = new Set(prev);
        next.delete(session.id);
        return next;
      });
      loadSessions(); // Refresh sessions list
    }
  };

  const deleteSession = async (sessionId, sessionTitle) => {
    if (!window.confirm(`Are you sure you want to delete "${sessionTitle}"?\n\nThis action cannot be undone.`)) {
      return;
    }

    const originalSessions = [...sessions];
    try {
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      setSelectedSessionIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(sessionId);
        return newSet;
      });
      await deleteSessionDoc(sessionId);
    } catch (error) {
      console.error('Failed to delete session:', error);
      setSessions(originalSessions);
      alert(`Failed to delete session: ${error.message || 'Unknown error'}`);
    }
  };

  const deleteSelectedSessions = async () => {
    if (selectedSessionIds.size === 0) return;
    
    const count = selectedSessionIds.size;
    if (!window.confirm(`Are you sure you want to delete ${count} session${count > 1 ? 's' : ''}?\n\nThis action cannot be undone.`)) {
      return;
    }

    const originalSessions = [...sessions];
    try {
      const idsToDelete = Array.from(selectedSessionIds);
      setSessions(prev => prev.filter(s => !selectedSessionIds.has(s.id)));
      setSelectedSessionIds(new Set());
      
      await Promise.all(idsToDelete.map(id => deleteSessionDoc(id)));
    } catch (error) {
      console.error('Failed to delete sessions:', error);
      setSessions(originalSessions);
      alert(`Failed to delete sessions: ${error.message || 'Unknown error'}`);
    }
  };

  // Folder handlers (Phase 3)
  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    
    try {
      const foldersCol = collection(db, 'folders');
      await addDoc(foldersCol, {
        name: newFolderName.trim(),
        userId: user?.uid || null,
        createdAt: new Date()
      });
      setNewFolderName('');
      setShowNewFolderModal(false);
      loadFolders();
    } catch (error) {
      console.error('Failed to create folder:', error);
      alert(`Failed to create folder: ${error.message}`);
    }
  };

  const deleteFolder = async (folderId, folderName) => {
    if (!window.confirm(`Delete folder "${folderName}"?\n\nSessions in this folder will be moved to Uncategorized.`)) {
      return;
    }

    try {
      // Move sessions to uncategorized
      const sessionsInFolder = sessions.filter(s => s.folderId === folderId);
      await Promise.all(sessionsInFolder.map(session => 
        updateDoc(doc(db, 'sessions', session.id), { folderId: null })
      ));
      
      // Delete folder
      await deleteDoc(doc(db, 'folders', folderId));
      
      loadFolders();
      loadSessions();
    } catch (error) {
      console.error('Failed to delete folder:', error);
      alert(`Failed to delete folder: ${error.message}`);
    }
  };

  const moveSessionsToFolder = async (folderId) => {
    if (selectedSessionIds.size === 0) return;
    
    try {
      await Promise.all(Array.from(selectedSessionIds).map(sessionId =>
        updateDoc(doc(db, 'sessions', sessionId), { folderId: folderId || null })
      ));
      setSelectedSessionIds(new Set());
      loadSessions();
    } catch (error) {
      console.error('Failed to move sessions:', error);
      alert(`Failed to move sessions: ${error.message}`);
    }
  };

  const toggleFolderExpanded = (folderId) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(folderId)) {
        newSet.delete(folderId);
      } else {
        newSet.add(folderId);
      }
      return newSet;
    });
  };

  const formatDate = (dateValue) => {
    if (!dateValue) return 'N/A';
    try {
      let date;
      if (typeof dateValue === 'string') {
        date = new Date(dateValue);
      } else if (dateValue.toDate) {
        date = dateValue.toDate();
      } else {
        date = new Date(dateValue);
      }
      if (isNaN(date.getTime())) return 'Invalid Date';
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch (error) {
      return 'Invalid Date';
    }
  };

  const formatDuration = (milliseconds) => {
    if (!milliseconds) return '0:00';
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = Math.floor((milliseconds % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getFolderName = (folderId) => {
    if (!folderId) return 'Uncategorized';
    const folder = folders.find(f => f.id === folderId);
    return folder?.name || 'Uncategorized';
  };

  const handleSessionClick = (e, sessionId) => {
    if (e.target.closest('.session-checkbox, .session-actions')) return;
    navigate(`/replay/${sessionId}`);
  };

  // Session Card Component
  const SessionCard = ({ session }) => {
    const isSelected = selectedSessionIds.has(session.id);
    const isHighlighted = highlightedSessionId === session.id;
    
    return (
      <div 
        className={`session-card ${isSelected ? 'selected' : ''} ${isHighlighted ? 'highlighted' : ''}`}
        onClick={(e) => handleSessionClick(e, session.id)}
        style={{
          padding: '16px 20px',
          marginBottom: '12px',
          backgroundColor: isHighlighted ? 'var(--bg-hover, rgba(255,255,255,0.1))' : 'var(--bg-secondary)',
          borderRadius: '8px',
          cursor: 'pointer',
          border: isSelected ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
          transition: 'all 0.15s ease'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          {/* Checkbox */}
          <div 
            className="session-checkbox"
            onClick={(e) => { e.stopPropagation(); toggleSessionSelection(session.id); }}
            style={{ paddingTop: '2px' }}
          >
            <input 
              type="checkbox" 
              checked={isSelected}
              onChange={() => {}}
              style={{ 
                width: '18px', 
                height: '18px', 
                cursor: 'pointer',
                accentColor: 'var(--primary-color)'
              }}
            />
          </div>
          
          {/* Session Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ 
              fontWeight: '600', 
              fontSize: '15px',
              color: 'var(--text-primary)', 
              marginBottom: '6px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {session.title || 'Untitled Session'}
            </div>
            <div style={{ 
              fontSize: '13px', 
              color: 'var(--text-secondary)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              alignItems: 'center'
            }}>
              <span style={{ 
                backgroundColor: 'var(--bg-tertiary)', 
                padding: '2px 8px', 
                borderRadius: '4px',
                fontSize: '12px'
              }}>
                {getFolderName(session.folderId)}
              </span>
              <span>•</span>
              <span>{formatDate(session.createdAt)}</span>
              <span>•</span>
              <span>{formatDuration(session.duration)}</span>
              {session.agentName && (
                <>
                  <span>•</span>
                  <span>{session.agentName}</span>
                </>
              )}
            </div>
          </div>
          
          {/* Actions */}
          <div 
            className="session-actions" 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '16px',
              flexShrink: 0
            }}
          >
            <span 
              onClick={(e) => { e.stopPropagation(); /* Resume functionality placeholder */ }}
              style={{ 
                fontSize: '13px', 
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                opacity: 0.7
              }}
              title="Resume session (coming soon)"
            >
              Resume
            </span>
            {/* NLP Analyze Link */}
            {session.nlpStatus === 'pending' && !analyzingSessionIds.has(session.id) && (
              <span 
                onClick={(e) => { e.stopPropagation(); handleAnalyzeSession(session); }}
                style={{ 
                  fontSize: '13px', 
                  color: 'var(--primary-color)',
                  cursor: 'pointer'
                }}
                title="Run NLP analysis on this session"
              >
                Analyze
              </span>
            )}
            {analyzingSessionIds.has(session.id) && (
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Analyzing...
              </span>
            )}
            {analyzedSessionIds.has(session.id) && (
              <span style={{ fontSize: '13px', color: 'var(--success-color)' }}>
                Analyzed ✓
              </span>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); deleteSession(session.id, session.title); }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
                transition: 'all 0.15s ease'
              }}
              onMouseOver={(e) => e.currentTarget.style.color = 'var(--danger-color, #dc3545)'}
              onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
              title="Delete session"
            >
              <TrashIcon size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Folder Section Component (Phase 3)
  const FolderSection = ({ folder, sessionsInFolder }) => {
    const isExpanded = expandedFolders.has(folder?.id || 'uncategorized');
    const folderId = folder?.id || 'uncategorized';
    const folderName = folder?.name || 'Uncategorized';
    
    return (
      <div style={{ marginBottom: '16px' }}>
        <div 
          onClick={() => toggleFolderExpanded(folderId)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 16px',
            backgroundColor: 'var(--bg-tertiary)',
            borderRadius: '8px',
            cursor: 'pointer',
            userSelect: 'none'
          }}
        >
          <ChevronIcon direction={isExpanded ? 'down' : 'right'} />
          <FolderIcon open={isExpanded} />
          <span style={{ fontWeight: '600', flex: 1 }}>{folderName}</span>
          <span style={{ 
            fontSize: '13px', 
            color: 'var(--text-secondary)',
            backgroundColor: 'var(--bg-secondary)',
            padding: '2px 10px',
            borderRadius: '12px'
          }}>
            {sessionsInFolder.length}
          </span>
          {folder && (
            <button
              onClick={(e) => { e.stopPropagation(); deleteFolder(folder.id, folder.name); }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '4px',
                opacity: 0.6
              }}
              title="Delete folder"
            >
              <TrashIcon size={14} />
            </button>
          )}
        </div>
        
        {isExpanded && (
          <div style={{ paddingLeft: '20px', marginTop: '8px' }}>
            {sessionsInFolder.length === 0 ? (
              <div style={{ 
                padding: '20px', 
                textAlign: 'center', 
                color: 'var(--text-secondary)',
                fontSize: '14px'
              }}>
                No sessions in this folder
              </div>
            ) : (
              sessionsInFolder.map(session => (
                <SessionCard key={session.id} session={session} />
              ))
            )}
          </div>
        )}
      </div>
    );
  };

  // New Folder Modal (Phase 3)
  const NewFolderModal = () => (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
      onClick={() => setShowNewFolderModal(false)}
    >
      <div 
        style={{
          backgroundColor: 'var(--bg-primary)',
          padding: '24px',
          borderRadius: '12px',
          width: '400px',
          maxWidth: '90%'
        }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ marginBottom: '20px', color: 'var(--text-primary)' }}>Create New Folder</h3>
        <input
          type="text"
          className="form-control"
          placeholder="Folder name..."
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && createFolder()}
          autoFocus
          style={{ marginBottom: '20px' }}
        />
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button 
            className="btn btn-secondary" 
            onClick={() => setShowNewFolderModal(false)}
          >
            Cancel
          </button>
          <button 
            className="btn btn-primary" 
            onClick={createFolder}
            disabled={!newFolderName.trim()}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return <LoadingSpinner text="Loading sessions..." />;
  }

  // Group sessions by folder for folder view
  const sessionsByFolder = {};
  if (viewMode === 'folders') {
    // Initialize with all folders
    folders.forEach(f => { sessionsByFolder[f.id] = []; });
    sessionsByFolder['uncategorized'] = [];
    
    // Distribute sessions
    filteredSessions.forEach(session => {
      const folderId = session.folderId || 'uncategorized';
      if (!sessionsByFolder[folderId]) {
        sessionsByFolder[folderId] = [];
      }
      sessionsByFolder[folderId].push(session);
    });
  }

  return (
    <div className="container">
      {/* Page Header */}
      <div className="page-header">
        <h1 className="page-title">Sessions</h1>
        <p className="page-subtitle">
          Manage and organize your recording sessions
        </p>
      </div>

      {/* Error Display */}
      {error && (
        <div className="error-container">
          <div className="error-title">Sessions Error</div>
          <div className="error-message">{error}</div>
          <button onClick={loadSessions} className="btn btn-primary" style={{ marginTop: '16px' }}>
            Retry
          </button>
        </div>
      )}

      {/* View Mode Toggle & Controls */}
      <div className="card" style={{ marginBottom: '20px' }}>
          <div className="card-body">
          {/* View Toggle Tabs */}
          <div style={{ 
            display: 'flex', 
            gap: '0', 
            marginBottom: '20px',
            borderBottom: '1px solid var(--border-color)'
          }}>
            <button
              onClick={() => setViewMode('all')}
              style={{
                padding: '10px 20px',
                backgroundColor: 'transparent',
                border: 'none',
                borderBottom: viewMode === 'all' ? '2px solid var(--primary-color)' : '2px solid transparent',
                color: viewMode === 'all' ? 'var(--primary-color)' : 'var(--text-secondary)',
                fontWeight: viewMode === 'all' ? '600' : '400',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              All Sessions
            </button>
            <button
              onClick={() => setViewMode('folders')}
              style={{
                padding: '10px 20px',
                backgroundColor: 'transparent',
                border: 'none',
                borderBottom: viewMode === 'folders' ? '2px solid var(--primary-color)' : '2px solid transparent',
                color: viewMode === 'folders' ? 'var(--primary-color)' : 'var(--text-secondary)',
                fontWeight: viewMode === 'folders' ? '600' : '400',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              By Folder
            </button>
      </div>

          {/* Filters Row */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
            gap: '12px', 
            alignItems: 'end' 
          }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '12px' }}>Search</label>
              <input
                type="text"
                className="form-control"
                placeholder="Search sessions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '12px' }}>Status</label>
              <select
                className="form-control"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All</option>
                <option value="created">Created</option>
                <option value="recording">Recording</option>
                <option value="Completed">Completed</option>
                <option value="paused">Paused</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '12px' }}>Sort By</label>
              <select
                className="form-control"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="createdAt">Date</option>
                <option value="title">Title</option>
                <option value="duration">Duration</option>
                <option value="agentName">Interviewer</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '12px' }}>Order</label>
              <select
                className="form-control"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              >
                <option value="desc">Newest First</option>
                <option value="asc">Oldest First</option>
              </select>
            </div>

              <button
                className="btn btn-primary"
                onClick={() => navigate('/recording')}
              style={{ height: '38px' }}
            >
              + New Session
            </button>

            {viewMode === 'folders' && (
              <button
                className="btn btn-secondary"
                onClick={() => setShowNewFolderModal(true)}
                style={{ height: '38px' }}
              >
                + New Folder
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Bulk Actions Bar (Phase 2) */}
      {selectedSessionIds.size > 0 && (
        <div style={{
          padding: '12px 20px',
          backgroundColor: 'var(--primary-color)',
          color: '#fff',
          borderRadius: '8px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px'
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={selectedSessionIds.size === filteredSessions.length}
              onChange={toggleSelectAll}
              style={{ width: '16px', height: '16px' }}
            />
            <span style={{ fontWeight: '500' }}>
              {selectedSessionIds.size} selected
            </span>
          </label>
          
          <div style={{ flex: 1 }} />
          
          {folders.length > 0 && (
            <select
              className="form-control"
              onChange={(e) => {
                if (e.target.value) {
                  moveSessionsToFolder(e.target.value === 'uncategorized' ? null : e.target.value);
                }
              }}
              value=""
              style={{ 
                width: 'auto', 
                backgroundColor: 'rgba(255,255,255,0.9)', 
                color: '#333',
                padding: '6px 12px'
              }}
            >
              <option value="">Move to folder...</option>
              <option value="uncategorized">Uncategorized</option>
              {folders.map(folder => (
                <option key={folder.id} value={folder.id}>{folder.name}</option>
              ))}
            </select>
          )}
          
          <button
            onClick={deleteSelectedSessions}
            style={{
              backgroundColor: 'rgba(255,255,255,0.2)',
              color: '#fff',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <TrashIcon size={14} />
            Delete
          </button>
        </div>
      )}

      {/* Sessions List */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Sessions ({filteredSessions.length})</span>
          {selectedSessionIds.size === 0 && filteredSessions.length > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
              <input 
                type="checkbox" 
                checked={false}
                onChange={toggleSelectAll}
                style={{ width: '14px', height: '14px' }}
              />
              Select All
            </label>
          )}
        </div>
        <div className="card-body">
          {filteredSessions.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              color: 'var(--text-secondary)'
            }}>
              <div style={{ fontSize: '18px', marginBottom: '10px' }}>
                {sessions.length === 0 ? 'No sessions yet' : 'No sessions match your filters'}
              </div>
              <div style={{ fontSize: '14px', marginBottom: '20px' }}>
                {sessions.length === 0
                  ? 'Start your first recording session'
                  : 'Try adjusting your search or filters'
                }
              </div>
              {sessions.length === 0 && (
                <button className="btn btn-primary" onClick={() => navigate('/recording')}>
                  Start Recording
                </button>
              )}
            </div>
          ) : viewMode === 'all' ? (
            // All Sessions View
            <div>
              {filteredSessions.map(session => (
                <SessionCard key={session.id} session={session} />
              ))}
            </div>
          ) : (
            // Folder View
            <div>
              {folders.map(folder => (
                <FolderSection 
                  key={folder.id} 
                  folder={folder} 
                  sessionsInFolder={sessionsByFolder[folder.id] || []} 
                />
              ))}
              <FolderSection 
                folder={null} 
                sessionsInFolder={sessionsByFolder['uncategorized'] || []} 
              />
            </div>
          )}
        </div>
      </div>

      {/* New Folder Modal */}
      {showNewFolderModal && <NewFolderModal />}
    </div>
  );
};

export default Sessions; 
