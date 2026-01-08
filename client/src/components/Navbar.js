/**
 * @file Navbar.js
 * @description Main navigation component with responsive hamburger menu and user controls.
 * 
 * @module components/Navbar
 * @requires react-router-dom - Navigation and route detection
 * @requires ../context/AuthContext - User data and logout function
 * 
 * @connections
 * - Used by: App.js (global layout)
 * - Uses: AuthContext for user info and logout
 * - Links to: Dashboard, Recording, Sessions, Upload pages
 * 
 * @summary
 * Top navigation bar featuring:
 * - Brand logo linking to dashboard
 * - Navigation links with active state highlighting
 * - User avatar and name display
 * - Logout functionality
 * - Mobile-responsive hamburger menu
 */

import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isActive = (path) => {
    return location.pathname === path || location.pathname.startsWith(path);
  };

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <Link to="/dashboard" className="brand-link">
          <img src="/logo.png" alt="Acute Stress Center" className="brand-logo" />
        </Link>
      </div>

      <div className={`navbar-menu ${isMenuOpen ? 'is-active' : ''}`}>
        <div className="navbar-nav">
          <Link 
            to="/dashboard" 
            className={`nav-link ${isActive('/dashboard') ? 'active' : ''}`}
            onClick={() => setIsMenuOpen(false)}
          >
            Dashboard
          </Link>
          <Link 
            to="/recording" 
            className={`nav-link ${isActive('/recording') ? 'active' : ''}`}
            onClick={() => setIsMenuOpen(false)}
          >
            Recording
          </Link>
          <Link 
            to="/sessions" 
            className={`nav-link ${isActive('/sessions') ? 'active' : ''}`}
            onClick={() => setIsMenuOpen(false)}
          >
            Sessions
          </Link>
          <Link 
            to="/upload" 
            className={`nav-link ${isActive('/upload') ? 'active' : ''}`}
            onClick={() => setIsMenuOpen(false)}
          >
            Upload
          </Link>
        </div>

        <div className="navbar-end">
          <div className="user-menu">
            {user?.photoURL && (
              <img 
                src={user.photoURL} 
                alt={user.name} 
                className="user-avatar"
              />
            )}
            <div className="user-info">
              <span className="user-name">{user?.name}</span>
              {user?.isFirebaseUser && (
                <span className="user-provider">Google Account</span>
              )}
            </div>
            <button className="logout-btn" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </div>

      <button 
        className={`navbar-burger ${isMenuOpen ? 'is-active' : ''}`}
        onClick={() => setIsMenuOpen(!isMenuOpen)}
      >
        <span></span>
        <span></span>
        <span></span>
      </button>
    </nav>
  );
};

export default Navbar; 