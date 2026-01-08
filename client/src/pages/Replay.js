/**
 * @file Replay.js
 * @description Session playback and analysis view with synchronized media, transcription, and NLP results.
 * 
 * @module pages/Replay
 * @requires react-router-dom - Navigation and URL params
 * @requires firebase - Storage for media files
 * @requires services/firebaseSessions - Session data retrieval
 * @requires jspdf - PDF export functionality
 * @requires xlsx - Excel export functionality
 * 
 * @connections
 * - Route: /replay/:sessionId (defined in App.js)
 * - Reads from: Firestore sessions collection, Firebase Storage
 * - Uses: NLPResults component for displaying analysis
 * 
 * @summary
 * Multi-tab session review interface:
 * - Dashboard: Overview with key metrics and export buttons (Excel/PDF)
 * - Transcription: Segmented Q&A display with timestamps
 * - Analysis: Detailed NLP results (sentiment, entities, topics, POS)
 * - Media: Synchronized video/audio playback with transcription highlights
 * 
 * Supports export of session statistics to Excel (CSV) and PDF formats.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import LoadingSpinner from '../components/LoadingSpinner';
import { getSession } from '../services/firebaseSessions';

// Simple SVG Pie Chart Component
const PieChart = ({ data, size = 180 }) => {
  if (!data || data.length === 0) return null;

  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) return null;

  const colors = [
    '#4A90D9', '#50C878', '#FFB347', '#FF6B6B', '#9B59B6',
    '#3498DB', '#2ECC71', '#F39C12', '#E74C3C', '#8E44AD'
  ];

  let currentAngle = -90; // Start from top
  const radius = size / 2 - 10;
  const center = size / 2;

  const slices = data.map((item, index) => {
    const percentage = (item.value / total) * 100;
    const angle = (item.value / total) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle = endAngle;

    // Calculate arc path
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    const x1 = center + radius * Math.cos(startRad);
    const y1 = center + radius * Math.sin(startRad);
    const x2 = center + radius * Math.cos(endRad);
    const y2 = center + radius * Math.sin(endRad);

    const largeArc = angle > 180 ? 1 : 0;

    const pathData = `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;

    return {
      path: pathData,
      color: colors[index % colors.length],
      label: item.label,
      percentage: percentage.toFixed(1)
    };
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {slices.map((slice, idx) => (
          <path
            key={idx}
            d={slice.path}
            fill={slice.color}
            stroke="var(--bg-primary)"
            strokeWidth="2"
          />
        ))}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {slices.map((slice, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <div style={{
              width: '12px',
              height: '12px',
              backgroundColor: slice.color,
              borderRadius: '2px',
              flexShrink: 0
            }} />
            <span style={{ textTransform: 'capitalize' }}>{slice.label}</span>
            <span style={{ color: 'var(--text-secondary)' }}>({slice.percentage}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const Replay = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [currentSession, setCurrentSession] = useState(null);
  const [recordingData, setRecordingData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const videoRef = useRef(null);
  const audioRef = useRef(null);

  // Firebase-only recording loading
  const loadRecordingFromFirebase = useCallback(async (session) => {
    try {

      const result = { sessionId };

      // Enhanced error handling for file loading

      // Load video from Firebase Storage
      if (session?.files?.videoUrl) {
        try {
          const res = await fetch(session.files.videoUrl);
          if (res.ok) {
            result.videoBlob = await res.blob();
          } else {
            console.error('Failed to load video, status:', res.status);
          }
        } catch (error) {
          console.error('Error loading video:', error);
        }
      }

      // Load audio from Firebase Storage
      if (session?.files?.audioUrl) {
        try {
          const res = await fetch(session.files.audioUrl);
          if (res.ok) {
            result.audioBlob = await res.blob();
          } else {
            console.error('Failed to load audio, status:', res.status);
          }
        } catch (error) {
          console.error('Error loading audio:', error);
        }
      }

      // Load transcription from Firebase Storage or inline text
      if (session?.files?.transcriptionUrl) {
        try {
          const res = await fetch(session.files.transcriptionUrl);
          if (res.ok) {
            result.transcription = await res.text();
          } else {
            console.error('Failed to load transcription, status:', res.status);
          }
        } catch (error) {
          console.error('Error loading transcription:', error);
        }
      } else if (session?.transcriptionText !== undefined) {
        result.transcription = session.transcriptionText || '';
      }

      if (result.videoBlob || result.audioBlob || result.transcription !== undefined) {
        setRecordingData(result);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Failed to load recording from Firebase:', error);
      return false;
    }
  }, [sessionId]);

  useEffect(() => {
    loadSession();
  }, [sessionId]);

  // Set up media sources when recording data is loaded
  useEffect(() => {
    if (recordingData) {

      // Helper to safely set duration from media metadata with Firestore fallback
      const setSafeDurationFrom = (mediaEl) => {
        const d = mediaEl?.duration;
        if (Number.isFinite(d) && !Number.isNaN(d) && d > 0) {
          setDuration(Math.floor(d));
        } else if (currentSession?.duration) {
          setDuration(Math.max(0, Math.floor(currentSession.duration / 1000)));
        }
      };

      // Set up video source
      if (recordingData.videoBlob && videoRef.current) {
        const videoUrl = URL.createObjectURL(recordingData.videoBlob);
        videoRef.current.src = videoUrl;
        videoRef.current.addEventListener('loadedmetadata', () => {
          setSafeDurationFrom(videoRef.current);
        });
      }

      // Set up audio source
      if (recordingData.audioBlob && audioRef.current) {
        const audioUrl = URL.createObjectURL(recordingData.audioBlob);
        audioRef.current.src = audioUrl;
        if (!recordingData.videoBlob) {
          // If no video, use audio for duration
          audioRef.current.addEventListener('loadedmetadata', () => {
            setSafeDurationFrom(audioRef.current);
          });
        }
      }
    }

    // Cleanup function to revoke object URLs when component unmounts or recordingData changes
    return () => {
      if (videoRef.current && videoRef.current.src) {
        URL.revokeObjectURL(videoRef.current.src);
      }
      if (audioRef.current && audioRef.current.src) {
        URL.revokeObjectURL(audioRef.current.src);
      }
    };
  }, [recordingData, currentSession]);

  // Additional effect to ensure media elements are properly set up when tab changes
  useEffect(() => {
    if (recordingData && (activeTab === 'video' || activeTab === 'audio' || activeTab === 'dashboard')) {

      // Re-setup video if needed (for both video tab and dashboard)
      if (recordingData.videoBlob && videoRef.current && !videoRef.current.src) {
        const videoUrl = URL.createObjectURL(recordingData.videoBlob);
        videoRef.current.src = videoUrl;
        videoRef.current.addEventListener('loadedmetadata', () => {
          const d = videoRef.current.duration;
          if (Number.isFinite(d) && d > 0) {
            setDuration(Math.floor(d));
          } else if (currentSession?.duration) {
            setDuration(Math.max(0, Math.floor(currentSession.duration / 1000)));
          }
        });
      }

      // Re-setup audio if needed
      if (recordingData.audioBlob && audioRef.current && !audioRef.current.src) {
        const audioUrl = URL.createObjectURL(recordingData.audioBlob);
        audioRef.current.src = audioUrl;
        if (!recordingData.videoBlob) {
          audioRef.current.addEventListener('loadedmetadata', () => {
            const d = audioRef.current.duration;
            if (Number.isFinite(d) && d > 0) {
              setDuration(Math.floor(d));
            } else if (currentSession?.duration) {
              setDuration(Math.max(0, Math.floor(currentSession.duration / 1000)));
            }
          });
        }
      }
    }
  }, [activeTab, recordingData, currentSession]);

  const loadSession = useCallback(async () => {
    try {
      setLoading(true);

      // Load session from Firebase Firestore
      const sess = await getSession(sessionId);
      if (sess) {
        setCurrentSession(sess);
        // Use stored Firestore duration (ms) as initial fallback
        if (sess.duration && Number.isFinite(sess.duration)) {
          setDuration(Math.max(0, Math.floor(sess.duration / 1000)));
        }

        // Load recording data from Firebase Storage
        const success = await loadRecordingFromFirebase(sess);
        if (!success) {
          // No recording data found in Firebase Storage
        }
      } else {
        setCurrentSession({
          id: sessionId,
          title: 'Session Not Found',
          description: 'This session does not exist in Firebase',
          createdAt: new Date().toISOString(),
          status: 'not_found'
        });
      }

    } catch (error) {
      console.error('Failed to load session from Firebase:', error);
      setCurrentSession({
        id: sessionId,
        title: 'Error Loading Session',
        description: 'Failed to load session from Firebase',
        createdAt: new Date().toISOString(),
        status: 'error'
      });
    } finally {
      setLoading(false);
    }
  }, [sessionId, loadRecordingFromFirebase]);

  const handlePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
    }
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
    }
  };

  const handleProgressClick = (e) => {
    const progressBar = e.currentTarget;
    const rect = progressBar.getBoundingClientRect();
    const clickPosition = (e.clientX - rect.left) / rect.width;
    const newTime = clickPosition * duration;
    handleSeek(newTime);
  };

  const handleSeek = (time) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
    setCurrentTime(time);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Robust date formatter that handles Firestore Timestamps and strings
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
      return date.toLocaleDateString();
    } catch (e) {
      return 'Invalid Date';
    }
  };

  const renderDashboard = () => {

    return (
      <div className="replay-dashboard">
        <div className="video-section">
          {recordingData?.videoBlob ? (
            <video
              ref={videoRef}
              controls
              style={{
                width: '100%',
                maxHeight: '400px',
                backgroundColor: '#000',
                borderRadius: '8px'
              }}
              onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
              onLoadedMetadata={(e) => setDuration(e.target.duration)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />
          ) : (
            <div className="video-placeholder">
              No video recording available
              <p style={{ fontSize: '14px', marginTop: '10px', color: '#6c757d' }}>
                This session does not have a video recording
              </p>
            </div>
          )}
        </div>

        <div className="playback-controls">
          <button
            className="btn btn-primary"
            onClick={handlePlayPause}
            disabled={!recordingData?.videoBlob && !recordingData?.audioBlob}
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>

          <div
            className="progress-bar"
            onClick={handleProgressClick}
          >
            <div
              className="progress-fill"
              style={{ width: `${(currentTime / duration) * 100 || 0}%` }}
            />
          </div>

          <div style={{ minWidth: '100px', textAlign: 'right', fontSize: '14px', fontFamily: 'monospace' }}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>

        <div className="card">
          <div className="card-header">Session Transcription</div>
          <div className="card-body">
            <div style={{
              maxHeight: '200px',
              overflowY: 'auto',
              backgroundColor: '#f8f9fa',
              padding: '15px',
              borderRadius: '4px',
              fontSize: '14px',
              lineHeight: '1.6',
              color: '#333333'
            }}>
              {recordingData?.transcription || (
                <div style={{ color: '#6c757d', fontStyle: 'italic' }}>
                  No transcription available for this session.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderTranscriptionTab = () => {

    return (
      <div className="transcription-tab">
        <div className="card">
          <div className="card-header">Session Transcription</div>
          <div className="card-body">
            {/* Debug information */}
            {process.env.NODE_ENV === 'development' && (
              <div style={{
                background: '#e9ecef',
                padding: '10px',
                marginBottom: '15px',
                borderRadius: '4px',
                fontSize: '12px',
                color: '#495057'
              }}>
                <strong>Debug Info:</strong><br />
                Recording Data: {recordingData ? 'Yes' : 'No'}<br />
                Transcription Property: {recordingData?.transcription !== undefined ? 'Yes' : 'No'}<br />
                Transcription Length: {recordingData?.transcription?.length || 0}<br />
                Transcription Type: {typeof recordingData?.transcription}
              </div>
            )}
            {recordingData?.transcription ? (
              <div className="transcription-content">
                <pre style={{
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'inherit',
                  fontSize: '14px',
                  lineHeight: '1.6',
                  color: '#333333',
                  background: '#f8f9fa',
                  padding: '20px',
                  borderRadius: '8px',
                  border: '1px solid #dee2e6',
                  margin: 0
                }}>
                  {recordingData.transcription}
                </pre>
              </div>
            ) : recordingData?.transcription === '' ? (
              <div className="empty-transcription">
                <p style={{ color: '#6c757d' }}>Transcription was recorded but is empty.</p>
                <p style={{ fontSize: '14px', color: '#6c757d' }}>
                  This session was recorded but no transcription text was captured.
                </p>
              </div>
            ) : (
              <div className="empty-transcription">
                <p style={{ color: '#6c757d' }}>No transcription available for this session.</p>
                <p style={{ fontSize: '14px', color: '#6c757d' }}>
                  Transcription is only available for sessions recorded with the live transcription feature.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderVideoTab = () => (
    <div className="video-tab">
      <div className="card">
        <div className="card-header">Video Playback</div>
        <div className="card-body">
          {recordingData?.videoBlob ? (
            <div className="video-player">
              <video
                ref={videoRef}
                controls
                style={{
                  width: '100%',
                  maxHeight: '500px',
                  backgroundColor: '#000',
                  borderRadius: '8px'
                }}
                onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
                onLoadedMetadata={(e) => setDuration(e.target.duration)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
            </div>
          ) : (
            <div className="no-video-placeholder">
              No video recording available
              <p style={{ fontSize: '14px', marginTop: '10px', color: 'var(--text-secondary)' }}>
                This session does not have a video recording
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: '20px' }}>
        <div className="card-header">Video Information</div>
        <div className="card-body">
          <div style={{ fontSize: '14px' }}>
            <div><strong>Duration:</strong> {formatTime(duration)}</div>
            <div><strong>Size:</strong> {recordingData?.videoBlob ? `${(recordingData.videoBlob.size / 1024 / 1024).toFixed(2)} MB` : 'N/A'}</div>
            <div><strong>Type:</strong> {recordingData?.videoBlob?.type || 'N/A'}</div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAudioTab = () => (
    <div className="audio-tab">
      <div className="card">
        <div className="card-header">Audio Playback</div>
        <div className="card-body">
          {recordingData?.audioBlob ? (
            <div>
              <audio
                ref={audioRef}
                controls
                style={{ width: '100%', marginBottom: '20px' }}
                onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
                onLoadedMetadata={(e) => setDuration(e.target.duration)}
              />

              <div style={{
                backgroundColor: '#f8f9fa',
                padding: '20px',
                borderRadius: '8px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '16px', fontWeight: '600' }}>Audio Recording</div>
                <div style={{ fontSize: '14px', color: '#6c757d' }}>
                  {formatTime(duration)} • {(recordingData.audioBlob.size / 1024 / 1024).toFixed(2)} MB
                </div>
              </div>
            </div>
          ) : (
            <div style={{
              padding: '60px',
              textAlign: 'center',
              backgroundColor: '#f8f9fa',
              border: '2px dashed #dee2e6',
              borderRadius: '8px',
              color: '#6c757d'
            }}>
              No audio recording available
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderTextTab = () => {
    // Get transcription from multiple possible sources
    const transcription = recordingData?.transcription ||
      currentSession?.transcriptionText ||
      currentSession?.transcription ||
      currentSession?.nlpAnalysis?.transcription || '';

    const nlp = currentSession?.nlpAnalysis;
    const wordCount = transcription ? transcription.trim().split(/\s+/).filter(w => w).length : 0;

    return (
      <div className="text-tab">
        {/* Full Transcription */}
        <div className="card" style={{ marginBottom: '20px' }}>
          <div className="card-header">Full Transcription</div>
          <div className="card-body">
            {transcription ? (
              <div style={{
                backgroundColor: 'var(--bg-secondary)',
                padding: '20px',
                borderRadius: '8px',
                fontSize: '14px',
                lineHeight: '1.8',
                whiteSpace: 'pre-wrap'
              }}>
                {transcription}
              </div>
            ) : (
              <div style={{
                padding: '60px',
                textAlign: 'center',
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: '8px',
                color: 'var(--text-secondary)'
              }}>
                <div style={{ fontSize: '16px', marginBottom: '8px', fontWeight: '500' }}>No Transcription</div>
                <div>No transcription available for this session.</div>
              </div>
            )}
          </div>
        </div>

        {transcription && (
          <>
            {/* Quick Stats */}
            <div className="row" style={{ marginBottom: '20px' }}>
              <div className="col-md-4">
                <div className="card">
                  <div className="card-body" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '32px', fontWeight: '600' }}>{wordCount}</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Words</div>
                  </div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="card">
                  <div className="card-body" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '32px', fontWeight: '600' }}>{transcription.length}</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Characters</div>
                  </div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="card">
                  <div className="card-body" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '32px', fontWeight: '600' }}>{Math.ceil(wordCount / 150)}</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Est. Minutes</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Sentiment Quick View */}
            {nlp?.sentiment && (
              <div className="card" style={{ marginBottom: '20px' }}>
                <div className="card-header">Quick Analysis</div>
                <div className="card-body">
                  <div style={{ display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{
                      padding: '12px 16px',
                      backgroundColor: nlp.sentiment.label === 'POSITIVE' ? 'rgba(40, 167, 69, 0.1)' : nlp.sentiment.label === 'NEGATIVE' ? 'rgba(220, 53, 69, 0.1)' : 'var(--bg-secondary)',
                      borderRadius: '8px',
                      borderLeft: `4px solid ${nlp.sentiment.label === 'POSITIVE' ? 'var(--success-color)' : nlp.sentiment.label === 'NEGATIVE' ? 'var(--danger-color)' : 'var(--text-secondary)'}`
                    }}>
                      <div style={{ fontWeight: '600', color: nlp.sentiment.label === 'POSITIVE' ? 'var(--success-color)' : nlp.sentiment.label === 'NEGATIVE' ? 'var(--danger-color)' : 'var(--text-secondary)' }}>
                        {nlp.sentiment.label}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {(nlp.sentiment.score * 100).toFixed(1)}% confidence
                      </div>
                    </div>

                    {nlp.topics?.primary && (
                      <div style={{
                        padding: '12px 16px',
                        backgroundColor: 'var(--bg-secondary)',
                        borderRadius: '8px',
                        borderLeft: '4px solid var(--primary-color)'
                      }}>
                        <div style={{ fontWeight: '600', textTransform: 'capitalize' }}>{nlp.topics.primary}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Primary Topic</div>
                      </div>
                    )}

                    {nlp.entities && nlp.entities.length > 0 && (
                      <div style={{
                        padding: '12px 16px',
                        backgroundColor: 'var(--bg-secondary)',
                        borderRadius: '8px',
                        borderLeft: '4px solid var(--text-secondary)'
                      }}>
                        <div style={{ fontWeight: '600' }}>{nlp.entities.length}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Named Entities</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Questions if available */}
            {currentSession?.questions && currentSession.questions.length > 0 && (
              <div className="card">
                <div className="card-header">Session Questions</div>
                <div className="card-body">
                  {currentSession.questions.map((q, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '12px 16px',
                        backgroundColor: idx % 2 === 0 ? 'var(--bg-secondary)' : 'transparent',
                        borderRadius: '4px',
                        marginBottom: '4px'
                      }}
                    >
                      <span style={{ fontWeight: '600', marginRight: '8px' }}>{idx + 1}.</span>
                      {typeof q === 'string' ? q : q.text || JSON.stringify(q)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const renderStatisticsTab = () => {
    const nlp = currentSession?.nlpAnalysis;
    const hasNLP = nlp && nlp.success;

    // POS tag descriptions for display
    const posDescriptions = {
      'NN': 'Noun (singular)',
      'NNS': 'Noun (plural)',
      'NNP': 'Proper Noun (singular)',
      'NNPS': 'Proper Noun (plural)',
      'VB': 'Verb (base)',
      'VBD': 'Verb (past)',
      'VBG': 'Verb (gerund)',
      'VBN': 'Verb (past participle)',
      'VBP': 'Verb (present)',
      'VBZ': 'Verb (3rd person)',
      'JJ': 'Adjective',
      'JJR': 'Adjective (comparative)',
      'JJS': 'Adjective (superlative)',
      'RB': 'Adverb',
      'RBR': 'Adverb (comparative)',
      'RBS': 'Adverb (superlative)',
      'PRP': 'Personal Pronoun',
      'PRP$': 'Possessive Pronoun',
      'DT': 'Determiner',
      'IN': 'Preposition',
      'CC': 'Coordinating Conjunction',
      'MD': 'Modal',
      'TO': 'To',
      'UH': 'Interjection',
      '.': 'Punctuation',
      ',': 'Comma',
      'NFP': 'Non-standard Punctuation'
    };

    return (
      <div className="statistics-tab">
        {/* Session Overview */}
        <div className="row" style={{ marginBottom: '20px' }}>
          <div className="col-md-6">
            <div className="card">
              <div className="card-header">Session Details</div>
              <div className="card-body">
                <div style={{ fontSize: '14px' }}>
                  <div style={{ marginBottom: '10px' }}><strong>Title:</strong> {currentSession?.title}</div>
                  <div style={{ marginBottom: '10px' }}><strong>Agent:</strong> {currentSession?.agentName || 'N/A'}</div>
                  <div style={{ marginBottom: '10px' }}><strong>Interviewee:</strong> {currentSession?.intervieweeName || 'N/A'}</div>
                  <div style={{ marginBottom: '10px' }}><strong>Duration:</strong> {currentSession?.duration ? `${Math.floor(currentSession.duration / 1000)} seconds` : 'N/A'}</div>
                  <div style={{ marginBottom: '10px' }}><strong>Created:</strong> {formatDate(currentSession?.createdAt)}</div>
                  <div style={{ marginBottom: '10px' }}>
                    <strong>Status:</strong>
                    <span className={`badge badge-${currentSession?.status === 'completed' ? 'success' : 'secondary'}`} style={{ marginLeft: '8px' }}>
                      {currentSession?.status}
                    </span>
                  </div>
                  <div style={{ marginBottom: '10px' }}>
                    <strong>NLP Status:</strong>
                    <span className={`badge badge-${currentSession?.nlpStatus === 'completed' ? 'success' : currentSession?.nlpStatus === 'pending' ? 'warning' : 'secondary'}`} style={{ marginLeft: '8px' }}>
                      {currentSession?.nlpStatus || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="col-md-6">
            <div className="card">
              <div className="card-header">Recording Files</div>
              <div className="card-body">
                <div style={{ fontSize: '14px' }}>
                  <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: recordingData?.videoBlob ? 'var(--success-color)' : 'var(--text-secondary)',
                      marginRight: '10px'
                    }} />
                    <strong>Video:</strong>
                    <span style={{ marginLeft: '8px' }}>{recordingData?.videoBlob ? formatFileSize(recordingData.videoBlob.size) : 'Not Available'}</span>
                  </div>
                  <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: recordingData?.audioBlob ? 'var(--success-color)' : 'var(--text-secondary)',
                      marginRight: '10px'
                    }} />
                    <strong>Audio:</strong>
                    <span style={{ marginLeft: '8px' }}>{recordingData?.audioBlob ? formatFileSize(recordingData.audioBlob.size) : 'Not Available'}</span>
                  </div>
                  <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: recordingData?.transcription ? 'var(--success-color)' : 'var(--text-secondary)',
                      marginRight: '10px'
                    }} />
                    <strong>Transcription:</strong>
                    <span style={{ marginLeft: '8px' }}>{recordingData?.transcription ? `${recordingData.transcription.length} characters` : 'Not Available'}</span>
                  </div>
                  <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                    <strong>Total Size:</strong> {formatFileSize((recordingData?.videoBlob?.size || 0) + (recordingData?.audioBlob?.size || 0))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* NLP Analysis Results */}
        {hasNLP ? (
          <>
            {/* Sentiment & Topic Row */}
            <div className="row" style={{ marginBottom: '20px' }}>
              <div className="col-md-6">
                <div className="card">
                  <div className="card-header">Sentiment Analysis</div>
                  <div className="card-body" style={{ textAlign: 'center' }}>
                    <div style={{
                      width: '80px',
                      height: '80px',
                      borderRadius: '50%',
                      backgroundColor: nlp.sentiment?.label === 'POSITIVE' ? 'rgba(40, 167, 69, 0.15)' : nlp.sentiment?.label === 'NEGATIVE' ? 'rgba(220, 53, 69, 0.15)' : 'var(--bg-secondary)',
                      border: `3px solid ${nlp.sentiment?.label === 'POSITIVE' ? 'var(--success-color)' : nlp.sentiment?.label === 'NEGATIVE' ? 'var(--danger-color)' : 'var(--text-secondary)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 16px'
                    }}>
                      <span style={{
                        fontSize: '24px',
                        fontWeight: '700',
                        color: nlp.sentiment?.label === 'POSITIVE' ? 'var(--success-color)' : nlp.sentiment?.label === 'NEGATIVE' ? 'var(--danger-color)' : 'var(--text-secondary)'
                      }}>
                        {nlp.sentiment?.score ? `${Math.round(nlp.sentiment.score * 100)}` : '?'}
                      </span>
                    </div>
                    <div style={{
                      fontSize: '20px',
                      fontWeight: '600',
                      color: nlp.sentiment?.label === 'POSITIVE' ? 'var(--success-color)' : nlp.sentiment?.label === 'NEGATIVE' ? 'var(--danger-color)' : 'var(--text-secondary)'
                    }}>
                      {nlp.sentiment?.label || 'N/A'}
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                      Confidence Score
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-md-6">
                <div className="card">
                  <div className="card-header">Topic Classification</div>
                  <div className="card-body">
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Primary Topic</div>
                      <div style={{ fontSize: '24px', fontWeight: '600', textTransform: 'capitalize' }}>
                        {nlp.topics?.primary || 'N/A'}
                      </div>
                    </div>
                    {nlp.topics?.scores && (
                      <div>
                        <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>All Topics</div>
                        {Object.entries(nlp.topics.scores)
                          .sort(([, a], [, b]) => b - a)
                          .map(([topic, score]) => (
                            <div key={topic} style={{ marginBottom: '8px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                                <span style={{ textTransform: 'capitalize' }}>{topic}</span>
                                <span>{(score * 100).toFixed(1)}%</span>
                              </div>
                              <div style={{
                                height: '6px',
                                backgroundColor: 'var(--bg-tertiary)',
                                borderRadius: '3px',
                                overflow: 'hidden'
                              }}>
                                <div style={{
                                  width: `${score * 100}%`,
                                  height: '100%',
                                  backgroundColor: topic === nlp.topics.primary ? 'var(--primary-color)' : 'var(--text-secondary)',
                                  borderRadius: '3px'
                                }} />
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Text Statistics & Topic Pie Chart Row */}
            <div className="row" style={{ marginBottom: '20px' }}>
              <div className="col-md-6">
                <div className="card">
                  <div className="card-header">Text Statistics</div>
                  <div className="card-body">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', textAlign: 'center', marginBottom: '20px' }}>
                      <div>
                        <div style={{ fontSize: '28px', fontWeight: '600' }}>{nlp.stats?.words || currentSession?.statistics?.wordCount || 0}</div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Words</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '28px', fontWeight: '600' }}>{nlp.stats?.sentences || 0}</div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Sentences</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '28px', fontWeight: '600' }}>{nlp.stats?.chars || recordingData?.transcription?.length || 0}</div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Characters</div>
                      </div>
                    </div>

                    {/* Topic Distribution Pie Chart */}
                    {nlp.topics?.scores && Object.keys(nlp.topics.scores).length > 0 && (
                      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                        <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '12px' }}>Topic Distribution</div>
                        <PieChart
                          data={Object.entries(nlp.topics.scores).map(([label, value]) => ({ label, value }))}
                          size={160}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="col-md-6">
                <div className="card">
                  <div className="card-header">Named Entities</div>
                  <div className="card-body">
                    {nlp.entities && nlp.entities.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {nlp.entities.map((entity, idx) => (
                          <span
                            key={idx}
                            className="badge badge-secondary"
                            style={{ fontSize: '13px', padding: '6px 12px' }}
                          >
                            {typeof entity === 'string' ? entity : entity.text || entity.word || JSON.stringify(entity)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                        No named entities detected
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Part of Speech Analysis */}
            <div className="card" style={{ marginBottom: '20px' }}>
              <div className="card-header">Part of Speech Analysis</div>
              <div className="card-body">
                {nlp.pos_counts && Object.keys(nlp.pos_counts).length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                    {Object.entries(nlp.pos_counts)
                      .sort(([, a], [, b]) => b - a)
                      .map(([tag, count]) => (
                        <div
                          key={tag}
                          style={{
                            padding: '12px',
                            backgroundColor: 'var(--bg-secondary)',
                            borderRadius: '6px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: '600', fontSize: '14px' }}>{tag}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                              {posDescriptions[tag] || 'Other'}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: '600' }}>{count}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                              {nlp.pos_percentages?.[tag] || ''}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                    No part of speech data available
                  </div>
                )}
              </div>
            </div>

            {/* Flagged Words */}
            {nlp.flagged_words && nlp.flagged_words.length > 0 && (
              <div className="card" style={{ marginBottom: '20px' }}>
                <div className="card-header">Flagged Words</div>
                <div className="card-body">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {nlp.flagged_words.map((word, idx) => (
                      <span
                        key={idx}
                        className="badge"
                        style={{
                          backgroundColor: 'var(--danger-color)',
                          color: '#fff',
                          fontSize: '13px',
                          padding: '6px 12px'
                        }}
                      >
                        {word}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Questions */}
            {currentSession?.questions && currentSession.questions.length > 0 && (
              <div className="card" style={{ marginBottom: '20px' }}>
                <div className="card-header">Session Questions</div>
                <div className="card-body">
                  <ol style={{ paddingLeft: '20px', margin: 0 }}>
                    {currentSession.questions.map((q, idx) => (
                      <li key={idx} style={{ marginBottom: '8px', fontSize: '14px' }}>
                        {typeof q === 'string' ? q : q.text || JSON.stringify(q)}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="card">
            <div className="card-header">NLP Analysis</div>
            <div className="card-body" style={{ textAlign: 'center', padding: '40px' }}>
              <div style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                backgroundColor: 'var(--bg-secondary)',
                border: '2px dashed var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px'
              }}>
                <span style={{ fontSize: '24px', color: 'var(--text-secondary)' }}>?</span>
              </div>
              <div style={{ fontSize: '16px', marginBottom: '8px' }}>No NLP Analysis Available</div>
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                {currentSession?.nlpStatus === 'pending'
                  ? 'Click "Analyze" on the Sessions page to run NLP analysis on this session.'
                  : currentSession?.nlpStatus === 'failed'
                    ? 'NLP analysis failed. Please try again from the Sessions page.'
                    : 'This session has not been analyzed yet.'}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return <LoadingSpinner text="Loading session..." />;
  }

  if (!currentSession) {
    return (
      <div className="container">
        <div className="error-container">
          <h3>Session Not Found</h3>
          <p>The requested session could not be found.</p>
          <button className="btn btn-primary" onClick={() => navigate('/sessions')}>
            Back to Sessions
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      {/* Page Header */}
      <div className="page-header">
        <h1 className="page-title">Session Replay: {currentSession.title}</h1>
        <p className="page-subtitle">
          Recorded: {formatDate(currentSession.endTime || currentSession.createdAt)}
        </p>
      </div>

      {/* Navigation Tabs */}
      <div className="nav-tabs">
        <button
          className={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('dashboard');
          }}
        >
          Dashboard
        </button>
        <button
          className={`nav-tab ${activeTab === 'video' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('video');
          }}
        >
          Video
        </button>
        <button
          className={`nav-tab ${activeTab === 'audio' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('audio');
          }}
        >
          Audio
        </button>
        <button
          className={`nav-tab ${activeTab === 'text' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('text');
          }}
        >
          Text
        </button>
        <button
          className={`nav-tab ${activeTab === 'statistics' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('statistics');
          }}
        >
          Statistics
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {(() => {
          switch (activeTab) {
            case 'dashboard':
              return renderDashboard();
            case 'video':
              return renderVideoTab();
            case 'audio':
              return renderAudioTab();
            case 'text':
              return renderTextTab();
            case 'statistics':
              return renderStatisticsTab();
            default:
              return renderDashboard();
          }
        })()}
      </div>

      {/* Back Button */}
      <div style={{ marginTop: '30px', textAlign: 'center' }}>
        <button
          className="btn btn-secondary"
          onClick={() => navigate('/sessions')}
        >
          ← Back to Sessions
        </button>
      </div>
    </div>
  );
};

export default Replay; 