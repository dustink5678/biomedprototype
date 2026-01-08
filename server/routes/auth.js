/**
 * @file auth.js
 * @description Authentication routes for local server (development/demo mode).
 * 
 * @module server/routes/auth
 * @requires express - Web framework
 * @requires bcryptjs - Password hashing
 * @requires jsonwebtoken - JWT generation
 * 
 * @connections
 * - Used by: server/index.js (mounted at /api/auth)
 * - Note: Production uses Firebase Auth instead
 * 
 * @summary
 * Mock authentication system for development:
 * - POST /login - Authenticate with mock users
 * - POST /register - Submit registration request (demo)
 * - GET /profile - Get current user profile
 * - POST /logout - Sign out
 * 
 * Uses mock user database with predefined roles.
 * JWT_SECRET must be set via environment variable in production.
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const router = express.Router();

// Mock user database - replace with Firebase/Azure
const mockUsers = [
  {
    id: '1',
    name: 'System Administrator',
    email: 'admin@prototype.com',
    password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password
    role: 'administrator',
    department: 'IT Security',
    clearanceLevel: 'Top Secret',
    verified: true,
    createdAt: new Date().toISOString()
  },
  {
    id: '2',
    name: 'Recording Agent',
    email: 'agent@prototype.com',
    password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password
    role: 'agent',
    department: 'Field Operations',
    clearanceLevel: 'Secret',
    verified: true,
    createdAt: new Date().toISOString()
  },
  {
    id: '3',
    name: 'Supervisor',
    email: 'supervisor@prototype.com',
    password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password
    role: 'supervisor',
    department: 'Management',
    clearanceLevel: 'Secret',
    verified: true,
    createdAt: new Date().toISOString()
  }
];

const JWT_SECRET = process.env.JWT_SECRET;

// Ensure JWT_SECRET is set in production
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET environment variable must be set in production');
}

/**
 * Generate JWT token
 */
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      role: user.role,
      name: user.name,
      department: user.department,
      clearanceLevel: user.clearanceLevel
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
};

/**
 * Login endpoint
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        message: 'Email and password are required'
      });
    }

    // Find user by email
    const user = mockUsers.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication failed',
        message: 'Invalid credentials'
      });
    }

    // Mock password verification - for demo, always accept any password
    const isValidPassword = true; // Always allow login for demo purposes

    if (!user.verified) {
      return res.status(401).json({
        success: false,
        error: 'Account not verified',
        message: 'Your account requires administrator approval'
      });
    }

    // Generate JWT token
    const token = generateToken(user);

    // Return success response
    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        clearanceLevel: user.clearanceLevel
      }
    });

  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'Server error', 
      message: 'Login failed due to server error' 
    });
  }
});

/**
 * Registration endpoint (mock - requires admin approval)
 * POST /api/auth/register
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, department, clearanceLevel } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        message: 'Name, email, and password are required'
      });
    }

    // Check if user already exists
    const existingUser = mockUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
    
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'User exists',
        message: 'An account with this email already exists'
      });
    }

    // In a real implementation, this would create a pending user account
    res.status(202).json({
      success: true,
      message: 'Registration request submitted',
      details: 'Your account request has been submitted for administrator review. You will be notified once approved.'
    });

  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'Server error', 
      message: 'Registration failed due to server error' 
    });
  }
});

/**
 * Get current user profile
 * GET /api/auth/profile
 */
router.get('/profile', (req, res) => {
  try {
    // This would normally use authentication middleware
    // For demo, return mock profile
    const user = mockUsers[0];
    
    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        clearanceLevel: user.clearanceLevel
      }
    });

  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'Server error', 
      message: 'Failed to fetch profile' 
    });
  }
});

/**
 * Logout endpoint
 * POST /api/auth/logout
 */
router.post('/logout', (req, res) => {
  try {
    // In a real implementation, this would invalidate the token
    res.json({
      success: true,
      message: 'Logout successful'
    });

  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'Server error', 
      message: 'Logout failed' 
    });
  }
});

module.exports = router; 