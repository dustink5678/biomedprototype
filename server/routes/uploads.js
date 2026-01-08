/**
 * @file uploads.js
 * @description File upload routes for local server (development mode).
 * 
 * @module server/routes/uploads
 * @requires express - Web framework
 * @requires multer - Multipart form data handling
 * @requires fs-extra - File system operations
 * @requires uuid - Unique ID generation
 * 
 * @connections
 * - Used by: server/index.js (mounted at /api/uploads)
 * - Note: Production uses Firebase Storage instead
 * 
 * @summary
 * Local file upload handling for development:
 * - POST /session/:sessionId - Upload session files
 * - POST /recording-chunk/:sessionId - Upload recording chunk
 * - POST /combine-chunks/:sessionId - Combine chunks into final file
 * - GET /session/:sessionId - Get session uploads
 * - DELETE /:uploadId/file/:filename - Delete uploaded file
 * 
 * Supports video (mp4), audio (wav, mp3), and text files.
 * 500MB file size limit, 10 files per request maximum.
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
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

// Apply mock auth to all upload routes
router.use(mockAuthMiddleware);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    await fs.ensureDir(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

// File filter for allowed types
const fileFilter = (req, file, cb) => {
  const allowedTypes = {
    'video/mp4': '.mp4',
    'audio/wav': '.wav',
    'audio/mpeg': '.mp3',
    'text/plain': '.txt'
  };

  if (allowedTypes[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} not allowed. Allowed types: ${Object.keys(allowedTypes).join(', ')}`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit
    files: 10 // Maximum 10 files per request
  }
});

/**
 * Upload files for a session
 * POST /api/uploads/session/:sessionId
 */
router.post('/session/:sessionId', upload.array('files', 10), async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const { synchronizationData } = req.body;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: 'No files uploaded',
        message: 'At least one file is required'
      });
    }

    // Process uploaded files
    const processedFiles = {
      video: [],
      audio: [],
      transcription: [],
      other: []
    };

    for (const file of req.files) {
      const fileInfo = {
        originalName: file.originalname,
        filename: file.filename,
        path: file.path,
        size: file.size,
        mimetype: file.mimetype,
        uploadedAt: new Date().toISOString()
      };

      // Categorize files by type
      if (file.mimetype.startsWith('video/')) {
        processedFiles.video.push(fileInfo);
      } else if (file.mimetype.startsWith('audio/')) {
        processedFiles.audio.push(fileInfo);
      } else if (file.mimetype === 'text/plain') {
        processedFiles.transcription.push(fileInfo);
      } else {
        processedFiles.other.push(fileInfo);
      }
    }

    // Create session upload record
    const uploadRecord = {
      id: uuidv4(),
      sessionId,
      uploadedBy: req.user.id,
      files: processedFiles,
      synchronizationData: synchronizationData ? JSON.parse(synchronizationData) : null,
      createdAt: new Date().toISOString()
    };

    // Save upload record to session directory
    const sessionDir = path.join(__dirname, '../sessions', sessionId);
    await fs.ensureDir(sessionDir);
    
    const uploadsFile = path.join(sessionDir, 'uploads.json');
    let existingUploads = [];
    
    try {
      existingUploads = await fs.readJson(uploadsFile);
    } catch (error) {
      // File doesn't exist yet, use empty array
    }
    
    existingUploads.push(uploadRecord);
    await fs.writeJson(uploadsFile, existingUploads);

    res.status(201).json({
      message: 'Files uploaded successfully',
      uploadRecord,
      filesProcessed: {
        video: processedFiles.video.length,
        audio: processedFiles.audio.length,
        transcription: processedFiles.transcription.length,
        other: processedFiles.other.length
      }
    });

  } catch (error) {
    console.error('Upload error:', error);
    
    // Clean up uploaded files on error
    if (req.files) {
      for (const file of req.files) {
        try {
          await fs.remove(file.path);
        } catch (cleanupError) {
          console.error('File cleanup error:', cleanupError);
        }
      }
    }

    res.status(500).json({
      error: 'Upload failed',
      message: error.message || 'Failed to process uploaded files'
    });
  }
});

/**
 * Upload recording data chunks (for real-time recording)
 * POST /api/uploads/recording-chunk/:sessionId
 */
router.post('/recording-chunk/:sessionId', upload.single('chunk'), async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const { chunkIndex, totalChunks, timestamp, type } = req.body;

    if (!req.file) {
      return res.status(400).json({
        error: 'No chunk uploaded',
        message: 'Recording chunk file is required'
      });
    }

    const chunkInfo = {
      sessionId,
      chunkIndex: parseInt(chunkIndex),
      totalChunks: parseInt(totalChunks),
      filename: req.file.filename,
      path: req.file.path,
      size: req.file.size,
      timestamp: parseInt(timestamp),
      type, // 'video', 'audio', or 'transcription'
      uploadedAt: new Date().toISOString()
    };

    // Save chunk info to session directory
    const sessionDir = path.join(__dirname, '../sessions', sessionId);
    await fs.ensureDir(sessionDir);
    
    const chunksFile = path.join(sessionDir, 'chunks.json');
    let existingChunks = [];
    
    try {
      existingChunks = await fs.readJson(chunksFile);
    } catch (error) {
      // File doesn't exist yet, use empty array
    }
    
    existingChunks.push(chunkInfo);
    await fs.writeJson(chunksFile, existingChunks);

    res.json({
      message: 'Chunk uploaded successfully',
      chunkInfo
    });

  } catch (error) {
    console.error('Chunk upload error:', error);
    
    // Clean up uploaded chunk on error
    if (req.file) {
      try {
        await fs.remove(req.file.path);
      } catch (cleanupError) {
        console.error('Chunk cleanup error:', cleanupError);
      }
    }

    res.status(500).json({
      error: 'Chunk upload failed',
      message: error.message || 'Failed to process recording chunk'
    });
  }
});

/**
 * Combine recording chunks into final files
 * POST /api/uploads/combine-chunks/:sessionId
 */
router.post('/combine-chunks/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const { type } = req.body; // 'video', 'audio', or 'transcription'

    const sessionDir = path.join(__dirname, '../sessions', sessionId);
    const chunksFile = path.join(sessionDir, 'chunks.json');

    let chunks = [];
    try {
      chunks = await fs.readJson(chunksFile);
    } catch (error) {
      return res.status(404).json({
        error: 'No chunks found',
        message: 'No recording chunks found for this session'
      });
    }

    // Filter chunks by type and sort by index
    const typeChunks = chunks
      .filter(chunk => chunk.type === type)
      .sort((a, b) => a.chunkIndex - b.chunkIndex);

    if (typeChunks.length === 0) {
      return res.status(404).json({
        error: 'No chunks of specified type',
        message: `No ${type} chunks found for this session`
      });
    }

    // Combine chunks into final file
    const finalFilename = `${sessionId}-${type}-${Date.now()}.${type === 'video' ? 'mp4' : type === 'audio' ? 'wav' : 'txt'}`;
    const finalFilePath = path.join(sessionDir, finalFilename);

    if (type === 'transcription') {
      // For transcription, concatenate text content
      let combinedText = '';
      for (const chunk of typeChunks) {
        const chunkContent = await fs.readFile(chunk.path, 'utf8');
        combinedText += chunkContent;
      }
      await fs.writeFile(finalFilePath, combinedText);
    } else {
      // For video/audio, concatenate binary data
      const writeStream = fs.createWriteStream(finalFilePath);
      for (const chunk of typeChunks) {
        const chunkData = await fs.readFile(chunk.path);
        writeStream.write(chunkData);
      }
      writeStream.end();
      
      // Wait for write to complete
      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });
    }

    // Clean up individual chunks
    for (const chunk of typeChunks) {
      try {
        await fs.remove(chunk.path);
      } catch (cleanupError) {
        console.error('Chunk cleanup error:', cleanupError);
      }
    }

    // Remove processed chunks from chunks.json
    const remainingChunks = chunks.filter(chunk => chunk.type !== type);
    await fs.writeJson(chunksFile, remainingChunks);

    res.json({
      message: `${type} chunks combined successfully`,
      finalFile: finalFilename,
      chunksProcessed: typeChunks.length
    });

  } catch (error) {
    console.error('Chunk combination error:', error);
    res.status(500).json({
      error: 'Chunk combination failed',
      message: error.message || 'Failed to combine chunks'
    });
  }
});

/**
 * Get uploaded files for a session
 * GET /api/uploads/session/:sessionId
 */
router.get('/session/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const sessionDir = path.join(__dirname, '../sessions', sessionId);
    
    const uploadsFile = path.join(sessionDir, 'uploads.json');
    let uploads = [];
    
    try {
      uploads = await fs.readJson(uploadsFile);
    } catch (error) {
      // No uploads file exists yet
    }

    res.json({
      sessionId,
      uploads,
      count: uploads.length
    });

  } catch (error) {
    console.error('Get uploads error:', error);
    res.status(500).json({
      error: 'Failed to fetch uploads',
      message: error.message || 'Could not retrieve upload information'
    });
  }
});

/**
 * Delete uploaded file
 * DELETE /api/uploads/:uploadId/file/:filename
 */
router.delete('/:uploadId/file/:filename', async (req, res) => {
  try {
    const { uploadId, filename } = req.params;

    // Find the file path
    const filePath = path.join(__dirname, '../uploads', filename);
    
    // Check if file exists
    const fileExists = await fs.pathExists(filePath);
    if (!fileExists) {
      return res.status(404).json({
        error: 'File not found',
        message: 'The specified file does not exist'
      });
    }

    // Remove the file
    await fs.remove(filePath);

    res.json({
      message: 'File deleted successfully',
      filename
    });

  } catch (error) {
    console.error('File deletion error:', error);
    res.status(500).json({
      error: 'File deletion failed',
      message: error.message || 'Failed to delete file'
    });
  }
});

// Error handling middleware for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large',
        message: 'File size exceeds the 500MB limit'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        error: 'Too many files',
        message: 'Maximum 10 files allowed per upload'
      });
    }
  }

  res.status(400).json({
    error: 'Upload error',
    message: error.message || 'File upload failed'
  });
});

module.exports = router; 