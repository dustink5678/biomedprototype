/**
 * @file sessions.js
 * @description Session management routes for local server (development mode).
 * 
 * @module server/routes/sessions
 * @requires express - Web framework
 * @requires fs-extra - File system operations
 * @requires uuid - Unique ID generation
 * 
 * @connections
 * - Used by: server/index.js (mounted at /api/sessions)
 * - Note: Production uses Firebase Firestore instead
 * 
 * @summary
 * Local session CRUD operations for development:
 * - POST / - Create new session
 * - GET / - List all sessions
 * - GET /:sessionId - Get specific session
 * - POST /:sessionId/start - Start recording
 * - POST /:sessionId/stop - Stop recording
 * - POST /:sessionId/transcription - Update transcription
 * - DELETE /:sessionId - Delete session
 * 
 * Sessions stored as JSON files in ./sessions directory.
 */

const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Mock user middleware for demo
const mockAuthMiddleware = (req, res, next) => {
  // For demo purposes, always set a mock user
  req.user = {
    id: 'demo-user-1',
    name: 'System Administrator',
    role: 'administrator'
  };
  next();
};

// Apply mock auth to all session routes
router.use(mockAuthMiddleware);

// Mock session storage - replace with Firebase/Azure database
let mockSessions = [];

// Load existing sessions from file system on startup
const loadSessionsFromFileSystem = async () => {
  try {
    const sessionsDir = path.join(__dirname, '../sessions');
    if (await fs.pathExists(sessionsDir)) {
      const sessionFolders = await fs.readdir(sessionsDir);
      for (const folder of sessionFolders) {
        const metadataPath = path.join(sessionsDir, folder, 'metadata.json');
        if (await fs.pathExists(metadataPath)) {
          const session = await fs.readJson(metadataPath);
          // Only add if not already in memory
          if (!mockSessions.find(s => s.id === session.id)) {
            mockSessions.push(session);
          }
        }
      }
    }
  } catch (error) {
    console.error('Failed to load sessions from filesystem:', error);
  }
};

// Load sessions on module initialization
loadSessionsFromFileSystem();

// Helper function to update session in both memory and file system
const updateSession = async (sessionId, updatedData) => {
  try {
    // Update in memory
    const sessionIndex = mockSessions.findIndex(s => s.id === sessionId);
    if (sessionIndex !== -1) {
      mockSessions[sessionIndex] = { ...mockSessions[sessionIndex], ...updatedData };
    }

    // Update in file system
    const sessionDir = path.join(__dirname, '../sessions', sessionId);
    await fs.ensureDir(sessionDir);
    await fs.writeJson(path.join(sessionDir, 'metadata.json'), mockSessions[sessionIndex]);

    return mockSessions[sessionIndex];
  } catch (error) {
    console.error('Failed to update session:', error);
    throw error;
  }
};

/**
 * Create a new recording session
 * POST /api/sessions
 */
router.post('/', async (req, res) => {
  try {
    const { agentName, intervieweeName, sessionTitle, customQuestions, timestamp } = req.body;
    const agentId = req.user.id;

    const sessionId = uuidv4();
    const session = {
      id: sessionId,
      title: sessionTitle || `${agentName} - ${intervieweeName} Session`,
      description: `Recording session with ${intervieweeName}`,
      agentId,
      agentName: agentName || req.user.name,
      intervieweeName: intervieweeName || '',
      customQuestions: customQuestions || [],
      status: 'created',
      createdAt: new Date().toISOString(),
      startTime: null,
      endTime: null,
      duration: 0,
      files: {
        video: null,
        audio: null,
        transcription: null,
        metadata: null
      },
      synchronization: {
        baseTimestamp: null,
        videoOffset: 0,
        audioOffset: 0,
        transcriptionOffset: 0
      },
      statistics: {
        wordCount: 0,
        speakingTime: 0,
        silenceTime: 0,
        keyPhrases: []
      }
    };

    // Create session directory
    const sessionDir = path.join(__dirname, '../sessions', sessionId);
    await fs.ensureDir(sessionDir);

    // Save session metadata
    await fs.writeJson(path.join(sessionDir, 'metadata.json'), session);

    mockSessions.push(session);

    res.status(201).json({
      success: true,
      message: 'Session created successfully',
      session
    });

  } catch (error) {
    console.error('Session creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      message: 'Failed to create session'
    });
  }
});

/**
 * Get all sessions for the authenticated user
 * GET /api/sessions
 */
router.get('/', async (req, res) => {
  try {
    // For demo, return all sessions
    const userSessions = mockSessions;

    res.json({
      sessions: userSessions,
      count: userSessions.length
    });

  } catch (error) {
    console.error('Sessions fetch error:', error);
    res.status(500).json({
      error: 'Server error',
      message: 'Failed to fetch sessions'
    });
  }
});

/**
 * Get a specific session by ID
 * GET /api/sessions/:sessionId
 */
router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = mockSessions.find(s => s.id === sessionId);

    if (!session) {
      return res.status(404).json({
        error: 'Session not found',
        message: 'The requested session does not exist'
      });
    }

    res.json({
      message: 'Session retrieved successfully',
      session
    });

  } catch (error) {
    console.error('Session fetch error:', error);
    res.status(500).json({
      error: 'Server error',
      message: 'Failed to fetch session'
    });
  }
});

/**
 * Start a recording session
 * POST /api/sessions/:sessionId/start
 */
router.post('/:sessionId/start', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = mockSessions.find(s => s.id === sessionId);

    if (!session) {
      return res.status(404).json({
        error: 'Session not found',
        message: 'The session you are trying to start does not exist'
      });
    }

    if (session.status === 'recording') {
      return res.status(400).json({
        error: 'Session already recording',
        message: 'This session is already in recording state'
      });
    }

    // Update session status and timestamps
    const updatedSession = await updateSession(sessionId, {
      status: 'recording',
      startTime: new Date().toISOString(),
      synchronization: {
        ...session.synchronization,
        baseTimestamp: Date.now()
      }
    });

    res.json({
      message: 'Recording started successfully',
      session: updatedSession,
      baseTimestamp: updatedSession.synchronization.baseTimestamp
    });

  } catch (error) {
    console.error('Session start error:', error);
    res.status(500).json({
      error: 'Server error',
      message: 'Failed to start recording session'
    });
  }
});

/**
 * Stop a recording session
 * POST /api/sessions/:sessionId/stop
 */
router.post('/:sessionId/stop', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = mockSessions.find(s => s.id === sessionId);

    if (!session) {
      return res.status(404).json({
        error: 'Session not found',
        message: 'The session you are trying to stop does not exist'
      });
    }

    if (session.status !== 'recording' && session.status !== 'paused') {
      return res.status(400).json({
        error: 'Session not recording',
        message: 'This session is not currently recording'
      });
    }

    // Update session status and calculate duration
    const updatedSession = await updateSession(sessionId, {
      status: 'completed',
      endTime: new Date().toISOString(),
      duration: Date.now() - new Date(session.startTime).getTime()
    });

    res.json({
      message: 'Recording stopped successfully',
      session: updatedSession
    });

  } catch (error) {
    console.error('Session stop error:', error);
    res.status(500).json({
      error: 'Server error',
      message: 'Failed to stop recording session'
    });
  }
});

/**
 * Update session transcription
 * POST /api/sessions/:sessionId/transcription
 */
router.post('/:sessionId/transcription', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { transcription, timestamp, confidence } = req.body;

    const session = mockSessions.find(s => s.id === sessionId);

    if (!session) {
      return res.status(404).json({
        error: 'Session not found',
        message: 'The session does not exist'
      });
    }

    // Store transcription in the session
    session.transcription = transcription;
    session.files.transcription = transcription; // Also store in files for consistency
    session.statistics.wordCount = transcription ? transcription.split(' ').length : 0;

    res.json({
      message: 'Transcription updated successfully',
      timestamp: timestamp || Date.now(),
      transcription: transcription,
      wordCount: session.statistics.wordCount
    });

  } catch (error) {
    console.error('Transcription update error:', error);
    res.status(500).json({
      error: 'Server error',
      message: 'Failed to update transcription'
    });
  }
});

/**
 * Delete a session
 * DELETE /api/sessions/:sessionId
 */
router.delete('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const sessionIndex = mockSessions.findIndex(s => s.id === sessionId);

    if (sessionIndex === -1) {
      return res.status(404).json({
        error: 'Session not found',
        message: 'The session you are trying to delete does not exist'
      });
    }

    // Remove from memory
    mockSessions.splice(sessionIndex, 1);

    // Remove from file system
    const sessionDir = path.join(__dirname, '../sessions', sessionId);
    if (await fs.pathExists(sessionDir)) {
      await fs.remove(sessionDir);
    }

    res.json({
      message: 'Session deleted successfully'
    });

  } catch (error) {
    console.error('Session deletion error:', error);
    res.status(500).json({
      error: 'Server error',
      message: 'Failed to delete session'
    });
  }
});

module.exports = router; 