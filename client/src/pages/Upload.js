/**
 * @file Upload.js
 * @description File upload page for importing pre-recorded sessions with single media file.
 * 
 * @module pages/Upload
 * @requires react-router-dom - Navigation
 * @requires firebase - Cloud Functions, Storage, Firestore
 * @requires services/nlpService - NLP analysis via Cloud Functions
 * 
 * @connections
 * - Route: /upload (defined in App.js)
 * - Calls: Firebase Cloud Functions (createSession, uploadSessionFiles)
 * - Calls: nlpService.analyzeTranscription for NLP processing
 * - Writes to: Firestore sessions collection, Firebase Storage
 * 
 * @summary
 * Four-step upload wizard:
 * 1. Session Info: Agent name, interviewee name, session title
 * 2. Questions: Add custom questions for segmentation (optional)
 * 3. File Selection: Upload ONE file type (video, audio, OR text)
 * 4. Upload & Process: Upload file, transcribe if needed, set nlpStatus to pending
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, orderBy, where, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAuth } from '../context/AuthContext';
import { db, storage } from '../firebase';

// Step Progress Indicator Component
const StepProgressIndicator = ({ currentStep }) => {
  const steps = [
    { number: 1, label: 'Session Info' },
    { number: 2, label: 'Questions' },
    { number: 3, label: 'File Selection' },
    { number: 4, label: 'Upload' }
  ];

  return (
    <div className="card" style={{ marginBottom: '30px' }}>
      <div className="card-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {steps.map((step, index) => (
            <React.Fragment key={step.number}>
              <div 
                className={`badge ${currentStep >= step.number ? 'badge-success' : 'badge-secondary'}`}
                style={{ whiteSpace: 'nowrap' }}
              >
                {step.number}. {step.label}
              </div>
              {index < steps.length - 1 && (
                <div style={{ 
                  flex: 1, 
                  height: '2px', 
                  backgroundColor: currentStep > step.number ? 'var(--success-color)' : 'var(--border-color)' 
                }} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};

// Session Info Step Component (matches Recording.js)
const SessionInfoStep = React.memo(({ formData, onFormChange, onNext }) => {
  const handleChange = (field, value) => {
    onFormChange({ ...formData, [field]: value });
  };

  const canProceed = formData.agentName?.trim() && formData.intervieweeName?.trim();

  return (
    <div className="card">
      <div className="card-header">Session Information</div>
      <div className="card-body">
        <div className="form-group">
          <label className="form-label">Agent Name *</label>
          <input
            type="text"
            className="form-control"
            placeholder="Enter your name"
            value={formData.agentName || ''}
            onChange={(e) => handleChange('agentName', e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Interviewee Name *</label>
          <input
            type="text"
            className="form-control"
            placeholder="Enter interviewee name"
            value={formData.intervieweeName || ''}
            onChange={(e) => handleChange('intervieweeName', e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Session Title (optional)</label>
          <input
            type="text"
            className="form-control"
            placeholder="Enter session title"
            value={formData.sessionTitle || ''}
            onChange={(e) => handleChange('sessionTitle', e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button
            className="btn btn-primary"
            onClick={onNext}
            disabled={!canProceed}
          >
            Next: Questions
          </button>
        </div>
      </div>
    </div>
  );
});

// Questions Step Component (matches Recording.js)
const QuestionsStep = React.memo(({ 
  questions, 
  currentQuestion, 
  onQuestionsChange, 
  onCurrentQuestionChange, 
  previousSessions,
  onImportQuestions,
  onBack, 
  onNext 
}) => {
  const addQuestion = () => {
    if (currentQuestion.trim()) {
      onQuestionsChange([...questions, { id: Date.now(), text: currentQuestion.trim() }]);
      onCurrentQuestionChange('');
    }
  };

  const removeQuestion = (id) => {
    onQuestionsChange(questions.filter(q => q.id !== id));
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addQuestion();
    }
  };

  // Get unique questions from previous sessions
  const availableQuestions = useMemo(() => {
    const questionSet = new Set();
    previousSessions.forEach(session => {
      if (session.customQuestions) {
        session.customQuestions.forEach(q => questionSet.add(q));
      }
      if (session.questions) {
        session.questions.forEach(q => {
          const text = typeof q === 'string' ? q : q.text;
          if (text) questionSet.add(text);
        });
      }
    });
    return Array.from(questionSet);
  }, [previousSessions]);

  return (
    <div className="card">
      <div className="card-header">Questions for Segmentation (Optional)</div>
      <div className="card-body">
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Add questions to segment the transcription. This helps organize and analyze responses by topic.
        </p>

        {/* Import from previous sessions */}
        {availableQuestions.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <label className="form-label">Import from Previous Sessions</label>
            <select
              className="form-control"
              onChange={(e) => {
                if (e.target.value) {
                  const existingTexts = questions.map(q => q.text);
                  if (!existingTexts.includes(e.target.value)) {
                    onQuestionsChange([...questions, { id: Date.now(), text: e.target.value }]);
                  }
                  e.target.value = '';
                }
              }}
              defaultValue=""
            >
              <option value="">Select a question to import...</option>
              {availableQuestions.map((q, idx) => (
                <option key={idx} value={q}>{q}</option>
              ))}
            </select>
          </div>
        )}

        {/* Add new question */}
        <div className="form-group">
          <label className="form-label">Add Question</label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="text"
              className="form-control"
              placeholder="Enter a question..."
              value={currentQuestion}
              onChange={(e) => onCurrentQuestionChange(e.target.value)}
              onKeyPress={handleKeyPress}
              style={{ flex: 1 }}
            />
            <button
              className="btn btn-secondary"
              onClick={addQuestion}
              disabled={!currentQuestion.trim()}
            >
              Add
            </button>
          </div>
        </div>

        {/* Question list */}
        {questions.length > 0 && (
          <div style={{ marginTop: '20px' }}>
            <label className="form-label">Added Questions ({questions.length})</label>
            <div style={{ 
              border: '1px solid var(--border-color)', 
              borderRadius: '8px', 
              overflow: 'hidden' 
            }}>
              {questions.map((q, idx) => (
                <div 
                  key={q.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '12px 16px',
                    borderBottom: idx < questions.length - 1 ? '1px solid var(--border-color)' : 'none',
                    backgroundColor: idx % 2 === 0 ? 'var(--bg-secondary)' : 'transparent'
                  }}
                >
                  <span style={{ 
                    color: 'var(--text-secondary)', 
                    marginRight: '12px',
                    fontWeight: '600'
                  }}>
                    {idx + 1}.
                  </span>
                  <span style={{ flex: 1 }}>{q.text}</span>
                  <button
                    className="btn btn-sm"
                    onClick={() => removeQuestion(q.id)}
                    style={{ 
                      background: 'none', 
                      border: 'none', 
                      color: 'var(--danger-color)',
                      cursor: 'pointer',
                      padding: '4px 8px'
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
          <button className="btn btn-secondary" onClick={onBack}>
            Back
          </button>
          <button className="btn btn-primary" onClick={onNext}>
            Next: Select File
          </button>
        </div>
      </div>
    </div>
  );
});

// File Selection Step Component
const FileSelectionStep = React.memo(({ 
  selectedFile, 
  fileType, 
  onFileSelect, 
  onRemoveFile, 
  onBack, 
  onNext 
}) => {
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Auto-detect file type
      let detectedType = null;
      if (file.type.startsWith('video/')) {
        detectedType = 'video';
      } else if (file.type.startsWith('audio/')) {
        detectedType = 'audio';
      } else if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
        detectedType = 'text';
      }
      
      if (detectedType) {
        onFileSelect(file, detectedType);
      } else {
        alert('Please select a valid video, audio, or text file.');
      }
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileTypeLabel = (type) => {
    switch (type) {
      case 'video': return 'Video File';
      case 'audio': return 'Audio File';
      case 'text': return 'Text Transcription';
      default: return 'Unknown File';
    }
  };

  const getFileTypeIcon = (type) => {
    switch (type) {
      case 'video': return '🎬';
      case 'audio': return '🎵';
      case 'text': return '📄';
      default: return '📁';
    }
  };

  return (
    <div className="card">
      <div className="card-header">Select File to Upload</div>
      <div className="card-body">
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Upload ONE file: video, audio, or text transcription. 
          Video and audio files will be transcribed automatically.
        </p>

        {selectedFile ? (
          <div style={{ 
            padding: '24px', 
            border: '2px solid var(--success-color)', 
            borderRadius: '12px',
            backgroundColor: 'var(--bg-secondary)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>
              {getFileTypeIcon(fileType)}
            </div>
            <div style={{ 
              fontWeight: '600', 
              fontSize: '18px',
              color: 'var(--success-color)', 
              marginBottom: '8px' 
            }}>
              {selectedFile.name}
            </div>
            <div style={{ 
              fontSize: '14px', 
              color: 'var(--text-secondary)', 
              marginBottom: '8px' 
            }}>
              {getFileTypeLabel(fileType)} • {formatFileSize(selectedFile.size)}
            </div>
            {(fileType === 'video' || fileType === 'audio') && (
              <div style={{ 
                fontSize: '12px', 
                color: 'var(--primary-color)',
                marginBottom: '16px'
              }}>
                This file will be transcribed using AI after upload
              </div>
            )}
            <button
              className="btn btn-danger btn-sm"
              onClick={onRemoveFile}
            >
              Remove File
            </button>
          </div>
        ) : (
          <div style={{ 
            padding: '48px 24px', 
            border: '2px dashed var(--border-color)', 
            borderRadius: '12px',
            textAlign: 'center',
            backgroundColor: 'var(--bg-secondary)'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>
              📁
            </div>
            <div style={{ 
              fontSize: '16px', 
              marginBottom: '8px',
              color: 'var(--text-primary)'
            }}>
              Drag & drop a file here, or click to browse
            </div>
            <div style={{ 
              fontSize: '13px', 
              color: 'var(--text-secondary)',
              marginBottom: '20px'
            }}>
              Supported: MP4, WebM, WAV, MP3, TXT
            </div>
            <input
              type="file"
              accept="video/*,audio/*,text/plain,.txt"
              onChange={handleFileChange}
              style={{ display: 'none' }}
              id="file-upload"
            />
            <label htmlFor="file-upload" className="btn btn-primary">
              Select File
            </label>
          </div>
        )}

        <div className="card" style={{ marginTop: '24px' }}>
          <div className="card-header">Supported File Types</div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              <div>
                <div style={{ fontWeight: '600', marginBottom: '8px' }}>🎬 Video</div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  MP4, WebM formats. Will be transcribed using AI.
                </div>
              </div>
              <div>
                <div style={{ fontWeight: '600', marginBottom: '8px' }}>🎵 Audio</div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  WAV, MP3 formats. Will be transcribed using AI.
                </div>
              </div>
              <div>
                <div style={{ fontWeight: '600', marginBottom: '8px' }}>📄 Text</div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Plain text (.txt) files. Used directly as transcription.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
          <button className="btn btn-secondary" onClick={onBack}>
            Back
          </button>
          <button
            className="btn btn-primary"
            onClick={onNext}
            disabled={!selectedFile}
          >
            Upload & Process
          </button>
        </div>
      </div>
    </div>
  );
});

// Main Upload Component
const Upload = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Step state
  const [uploadStep, setUploadStep] = useState(1);

  // Session info state (matches Recording.js)
  const [sessionFormData, setSessionFormData] = useState({
    agentName: '',
    intervieweeName: '',
    sessionTitle: ''
  });

  // Questions state
  const [questions, setQuestions] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [previousSessions, setPreviousSessions] = useState([]);

  // File state - single file only
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileType, setFileType] = useState(null); // 'video' | 'audio' | 'text'

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState(''); // 'uploading' | 'transcribing' | 'complete'
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Load previous sessions for question import
  useEffect(() => {
    const loadPreviousSessions = async () => {
      if (!user?.uid) return;
      
      try {
        const sessionsCol = collection(db, 'sessions');
        const q = query(
          sessionsCol, 
          where('agentId', '==', user.uid), 
          orderBy('createdAt', 'desc')
        );
        const snap = await getDocs(q);
        const sessionsData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setPreviousSessions(sessionsData);
      } catch (err) {
        // Silently fail - this is just for convenience
      }
    };

    loadPreviousSessions();
  }, [user]);

  // File selection handlers
  const handleFileSelect = (file, type) => {
    setSelectedFile(file);
    setFileType(type);
    setError(null);
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setFileType(null);
  };

  // Upload and process
  const handleUpload = async () => {
    if (!selectedFile || !user) return;

    try {
      setUploading(true);
      setUploadProgress(0);
      setProcessingStatus('uploading');
      setError(null);

      // Generate session ID
      const sessionId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const sessionTitle = sessionFormData.sessionTitle || 
        `${sessionFormData.agentName} - ${sessionFormData.intervieweeName} - ${new Date().toLocaleDateString()}`;

      setUploadProgress(10);

      // Read text file content if text type
      let transcriptionText = '';
      if (fileType === 'text') {
        transcriptionText = await readTextFile(selectedFile);
        setUploadProgress(30);
      }

      // Upload media file to Firebase Storage (for video/audio)
      let fileUrl = null;
      if (fileType === 'video' || fileType === 'audio') {
        setProcessingStatus('uploading');
        const storagePath = `sessions/${sessionId}/${fileType}/${selectedFile.name}`;
        const storageRef = ref(storage, storagePath);
        
        await uploadBytes(storageRef, selectedFile);
        fileUrl = await getDownloadURL(storageRef);
        setUploadProgress(50);
        
        // For video/audio, transcription will be done by NLP Cloud Function
        setProcessingStatus('transcribing');
      }

      setUploadProgress(70);

      // Create session document in Firestore
      const sessionData = {
        id: sessionId,
        title: sessionTitle,
        agentId: user.uid,
        agentName: sessionFormData.agentName,
        intervieweeName: sessionFormData.intervieweeName,
        status: 'completed',
        nlpStatus: 'pending', // Will be analyzed manually from Sessions page
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        duration: 0,
        source: 'upload',
        fileType: fileType,
        questions: questions.map(q => q.text),
        files: {
          videoUrl: fileType === 'video' ? fileUrl : null,
          audioUrl: fileType === 'audio' ? fileUrl : null,
          transcriptionUrl: null
        },
        transcriptionText: transcriptionText || '',
        customQuestions: questions.map(q => q.text)
      };

              const sessionRef = doc(db, 'sessions', sessionId);
      await setDoc(sessionRef, sessionData);

      setUploadProgress(100);
      setProcessingStatus('complete');

      setSuccess({
            sessionId,
        message: 'File uploaded successfully! You can analyze the session from the Sessions page.',
        fileType: fileType,
        hasTranscription: fileType === 'text'
      });

    } catch (err) {
      console.error('Upload failed:', err);
      setError(err.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  // Helper to read text file
  const readTextFile = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });
  };

  // Reset form
  const resetForm = () => {
    setUploadStep(1);
    setSessionFormData({ agentName: '', intervieweeName: '', sessionTitle: '' });
    setQuestions([]);
    setCurrentQuestion('');
    setSelectedFile(null);
    setFileType(null);
    setUploadProgress(0);
    setProcessingStatus('');
    setSuccess(null);
    setError(null);
  };

  // Success screen
  if (success) {
    return (
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">Upload Complete</h1>
          <p className="page-subtitle">Your file has been uploaded successfully</p>
        </div>

        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '48px' }}>
            <div style={{ fontSize: '64px', marginBottom: '24px' }}>✓</div>
            <div style={{ fontSize: '24px', fontWeight: '600', marginBottom: '16px', color: 'var(--success-color)' }}>
            Upload Successful!
          </div>
            <div style={{ marginBottom: '24px', color: 'var(--text-secondary)' }}>
            {success.message}
          </div>

            {success.fileType !== 'text' && (
              <div style={{ 
                padding: '16px', 
                backgroundColor: 'var(--bg-secondary)', 
                borderRadius: '8px',
                marginBottom: '24px'
              }}>
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  Your {success.fileType} file will be transcribed when you click "Analyze" on the Sessions page.
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
            <button
              className="btn btn-primary"
              onClick={() => navigate(`/replay/${success.sessionId}`)}
            >
              View Session
            </button>
            <button
              className="btn btn-secondary"
                onClick={() => navigate('/sessions')}
              >
                Go to Sessions
              </button>
              <button
                className="btn btn-secondary"
                onClick={resetForm}
              >
                Upload Another
            </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      {/* Page Header */}
      <div className="page-header">
        <h1 className="page-title">Upload Session</h1>
        <p className="page-subtitle">
          Import a video, audio, or text file to create a new session
        </p>
      </div>

      {/* Progress Indicator */}
      <StepProgressIndicator currentStep={uploadStep} />

      {/* Error Display */}
      {error && (
        <div className="error-container" style={{ marginBottom: '20px' }}>
          <div className="error-title">Upload Error</div>
          <div className="error-message">{error}</div>
        </div>
      )}

      {/* Step 1: Session Information */}
      {uploadStep === 1 && (
        <SessionInfoStep
          formData={sessionFormData}
          onFormChange={setSessionFormData}
          onNext={() => setUploadStep(2)}
        />
      )}

      {/* Step 2: Questions */}
      {uploadStep === 2 && (
        <QuestionsStep
          questions={questions}
          currentQuestion={currentQuestion}
          onQuestionsChange={setQuestions}
          onCurrentQuestionChange={setCurrentQuestion}
          previousSessions={previousSessions}
          onBack={() => setUploadStep(1)}
          onNext={() => setUploadStep(3)}
        />
      )}

      {/* Step 3: File Selection */}
      {uploadStep === 3 && (
        <FileSelectionStep
          selectedFile={selectedFile}
          fileType={fileType}
          onFileSelect={handleFileSelect}
          onRemoveFile={handleRemoveFile}
          onBack={() => setUploadStep(2)}
          onNext={() => { setUploadStep(4); handleUpload(); }}
        />
      )}

      {/* Step 4: Upload Progress */}
      {uploadStep === 4 && (
        <div className="card">
          <div className="card-header">Processing Upload</div>
          <div className="card-body">
            {uploading ? (
              <div>
                <div style={{ marginBottom: '24px', textAlign: 'center' }}>
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>
                    {processingStatus === 'uploading' && '📤'}
                    {processingStatus === 'transcribing' && '🎙️'}
                    {processingStatus === 'complete' && '✓'}
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>
                    {processingStatus === 'uploading' && 'Uploading file...'}
                    {processingStatus === 'transcribing' && 'Processing...'}
                    {processingStatus === 'complete' && 'Complete!'}
                  </div>
                  <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                    {uploadProgress}% complete
                  </div>
                </div>
                
                  <div style={{
                    width: '100%',
                  height: '12px',
                    backgroundColor: 'var(--bg-tertiary)',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  marginBottom: '24px'
                  }}>
                    <div style={{
                      width: `${uploadProgress}%`,
                      height: '100%',
                      backgroundColor: 'var(--success-color)',
                      transition: 'width 0.3s ease'
                    }} />
                </div>

                <div style={{ 
                  fontSize: '13px', 
                  color: 'var(--text-secondary)',
                  textAlign: 'center'
                }}>
                  Please do not close this page while processing...
                </div>
              </div>
            ) : (
              <LoadingSpinner text="Preparing upload..." />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Upload; 
