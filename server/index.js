/**
 * @file index.js
 * @description Express server entry point with Socket.IO for real-time communication.
 * 
 * @module server/index
 * @requires express - Web framework
 * @requires socket.io - Real-time bidirectional communication
 * @requires cors - Cross-Origin Resource Sharing
 * @requires fs-extra - Enhanced file system operations
 * 
 * @connections
 * - Routes: ./routes/auth, ./routes/sessions, ./routes/uploads
 * - Client connects via: HTTP API and WebSocket
 * 
 * @summary
 * Server setup and configuration:
 * - CORS configuration for localhost and production domains
 * - Socket.IO for recording status and transcription updates
 * - API routes for auth, sessions, and file uploads
 * - Health check endpoint at /api/health
 * - Error handling and 404 middleware
 * 
 * Note: This server is primarily for local development.
 * Production uses Firebase services directly.
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Enable CORS for both Express and Socket.IO
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Allow localhost on any port
    if (origin.match(/^https?:\/\/localhost:\d+$/)) {
      return callback(null, true);
    }

    // Allow Firebase hosting domain
    if (origin === 'https://biomedicalprototype.web.app') {
      return callback(null, true);
    }

    // Allow Railway domain (for testing)
    if (origin.includes('railway.app')) {
      return callback(null, true);
    }

    callback(new Error('Not allowed by CORS'));
  },
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
};

app.use(cors(corsOptions));

const io = socketIo(server, {
  cors: corsOptions
});

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Create required directories
const ensureDirectories = async () => {
  const dirs = [
    path.join(__dirname, 'uploads'),
    path.join(__dirname, 'sessions'),
    path.join(__dirname, 'recordings')
  ];

  for (const dir of dirs) {
    await fs.ensureDir(dir);
  }
};

ensureDirectories().catch(console.error);

// Import routes
const authRoutes = require('./routes/auth');
const sessionRoutes = require('./routes/sessions');
const uploadRoutes = require('./routes/uploads');

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/uploads', uploadRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Socket.IO handling
io.on('connection', (socket) => {
  // Handle recording status updates
  socket.on('recording-status', (data) => {
    socket.broadcast.emit('recording-status-update', data);
  });

  // Handle transcription updates
  socket.on('transcription-update', (data) => {
    socket.broadcast.emit('transcription-received', data);
  });

  socket.on('disconnect', () => {
    // Client disconnected
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
}); 