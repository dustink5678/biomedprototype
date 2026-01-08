/**
 * @file UserProfile.js
 * @description Displays authenticated user information in a card format.
 * 
 * @module components/UserProfile
 * @requires react
 * @requires ../context/AuthContext - User data
 * 
 * @connections
 * - Used by: Dashboard page
 * - Uses: AuthContext for user information
 * 
 * @summary
 * User profile card showing:
 * - Profile avatar (if available)
 * - User name and email
 * - Authentication provider badge
 * - User ID and auth method details
 */

import React from 'react';
import { useAuth } from '../context/AuthContext';

const UserProfile = () => {
  const { user } = useAuth();

  if (!user) {
    return <div>No user information available</div>;
  }

  return (
    <div className="user-profile-card">
      <div className="profile-header">
        {user.photoURL && (
          <img 
            src={user.photoURL} 
            alt={user.name} 
            className="profile-avatar"
          />
        )}
        <div className="profile-info">
          <h3 className="profile-name">{user.name}</h3>
          <p className="profile-email">{user.email}</p>
          {user.isFirebaseUser && (
            <span className="profile-provider">Google Account</span>
          )}
        </div>
      </div>
      
      <div className="profile-details">
        <div className="detail-item">
          <span className="detail-label">User ID:</span>
          <span className="detail-value">{user.id}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Authentication:</span>
          <span className="detail-value">{user.provider || 'Legacy'}</span>
        </div>
      </div>
    </div>
  );
};

export default UserProfile; 