/**
 * @file Recording.js
 * @description Live recording interface with three-step wizard setup, real-time transcription, and NLP analysis.
 * 
 * @module pages/Recording
 * @requires firebase/firestore - Session document updates
 * @requires recordrtc - Audio/video recording library
 * @requires ../context/AuthContext - User authentication
 * @requires ../context/SocketContext - Real-time updates
 * @requires ../services/firebaseSessions - Session management
 * @requires ../services/nlpService - NLP analysis
 * 
 * @connections
 * - Used by: App.js (route)
 * - Uses: AuthContext for user data
 * - Uses: SocketContext for real-time transcription updates
 * - Uses: firebaseSessions for session CRUD
 * - Uses: nlpService for automatic NLP analysis
 * 
 * @summary
 * Core recording functionality with:
 * - Three-step wizard: Session Info -> Questions -> Media Setup
 * - Live audio/video recording using RecordRTC
 * - Real-time speech-to-text transcription
 * - Question-based segmentation
 * - Automatic NLP analysis on session completion
 * - Media preview and device selection
 * - Firebase Storage upload for recordings
 */

import { doc, updateDoc } from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import RecordRTC from 'recordrtc';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { db } from '../firebase';
import { analyzeTranscription } from '../services/nlpService';

import {
  createSession as fbCreateSession,
  listSessions as fbListSessions,
  startSession as fbStartSession,
  stopSession as fbStopSession,
  uploadSessionFile,
  uploadTranscriptionText,
} from '../services/firebaseSessions';

// ============================================
/**
 * Step Components - Defined outside Recording component to prevent focus loss during re-renders
 * Memoized components prevent unnecessary re-mounting when parent state changes
 */
// ============================================

/**
 * SessionInfoStep - Step 1: Basic session information input
 * Memoized to prevent re-renders that cause input focus loss
 */
const SessionInfoStep = React.memo(({
  sessionFormData,
  setSessionFormData,
  setRecordingStep
}) => {
  const handleNext = () => {
    if (!sessionFormData.intervieweeName.trim()) {
      alert('Please enter the interviewee name');
      return;
    }
    setRecordingStep(2);
  };

  return (
    <div className="card">
      <div className="card-header">Session Information</div>
      <div className="card-body">
        <div className="form-group" style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Agent Name *</label>
          <input
            type="text"
            className="form-control"
            value={sessionFormData.agentName}
            onChange={(e) => setSessionFormData(prev => ({ ...prev, agentName: e.target.value }))}
            placeholder="Enter your name"
            required
            style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
          />
        </div>

        <div className="form-group" style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Interviewee Name *</label>
          <input
            type="text"
            className="form-control"
            value={sessionFormData.intervieweeName}
            onChange={(e) => setSessionFormData(prev => ({ ...prev, intervieweeName: e.target.value }))}
            placeholder="Enter interviewee's full name"
            required
            style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
          />
        </div>

        <div className="form-group" style={{ marginBottom: '30px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Session Title (Optional)</label>
          <input
            type="text"
            className="form-control"
            value={sessionFormData.sessionTitle}
            onChange={(e) => setSessionFormData(prev => ({ ...prev, sessionTitle: e.target.value }))}
            placeholder="Custom session title (auto-generated if empty)"
            style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button
            className="btn btn-primary"
            onClick={handleNext}
            style={{ padding: '12px 24px', fontSize: '16px' }}
          >
            Next: Questions →
          </button>
        </div>
      </div>
    </div>
  );
});

/**
 * QuestionsStep - Step 2: Optional question configuration for segmentation
 * Memoized to prevent re-renders that cause input focus loss
 */
const QuestionsStep = React.memo(({
  sessionFormData,
  setSessionFormData,
  setRecordingStep,
  addQuestion,
  removeQuestion,
  previousSessions,
  loadingPrevSessions,
  selectedSessionId,
  setSelectedSessionId,
  applyQuestionsFromPrevious
}) => (
  <div className="card">
    <div className="card-header">Questions for Segmentation</div>
    <div className="card-body">
      <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
        Add questions to automatically segment the recording into Q&A pairs. This step is optional.
      </p>

      {/* Add Question Input */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
        <input
          type="text"
          className="form-control"
          value={sessionFormData.currentQuestion}
          onChange={(e) => setSessionFormData(prev => ({ ...prev, currentQuestion: e.target.value }))}
          placeholder="Enter a question (e.g., How is your day?)"
          onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addQuestion())}
          style={{ flex: 1, padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
        />
        <button
          type="button"
          onClick={addQuestion}
          className="btn btn-secondary"
          disabled={!sessionFormData.currentQuestion.trim()}
          style={{ padding: '12px 20px' }}
        >
          Add
        </button>
      </div>

      {/* Questions List */}
      {sessionFormData.questions.length > 0 && (
        <div style={{
          maxHeight: '200px',
          overflowY: 'auto',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          padding: '12px',
          marginBottom: '20px',
          backgroundColor: 'var(--bg-tertiary)'
        }}>
          <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '10px', color: 'var(--text-secondary)' }}>
            Questions ({sessionFormData.questions.length}):
          </div>
          {sessionFormData.questions.map((question, index) => (
            <div key={question.id} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 12px',
              marginBottom: '8px',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: '6px',
              fontSize: '14px',
              color: 'var(--text-primary)'
            }}>
              <span style={{ flex: 1 }}>{index + 1}. {question.text}</span>
              <button
                type="button"
                onClick={() => removeQuestion(index)}
                className="btn btn-sm"
                style={{
                  fontSize: '14px',
                  padding: '4px 10px',
                  backgroundColor: 'var(--danger-color, #dc3545)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Import from Previous Session */}
      <div style={{
        padding: '16px',
        backgroundColor: 'var(--bg-tertiary)',
        borderRadius: '8px',
        marginBottom: '30px'
      }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
          Import Questions from Past Session
        </label>
        <div style={{ display: 'flex', gap: '12px' }}>
          <select
            className="form-control"
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)'
            }}
            value={selectedSessionId}
            onChange={(e) => setSelectedSessionId(e.target.value)}
          >
            <option value="">-- Select a past session --</option>
            {loadingPrevSessions ? (
              <option disabled>Loading sessions...</option>
            ) : previousSessions.length === 0 ? (
              <option disabled>No previous sessions with questions</option>
            ) : (
              previousSessions.map(s => (
                <option key={s.id} value={s.id}>
                  {s.intervieweeName} — {s.createdAt?.seconds ? new Date(s.createdAt.seconds * 1000).toLocaleDateString() : new Date(s.createdAt).toLocaleDateString()}
                </option>
              ))
            )}
          </select>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!selectedSessionId}
            onClick={applyQuestionsFromPrevious}
            style={{ padding: '12px 20px' }}
          >
            Load
          </button>
        </div>
      </div>

      {/* Navigation Buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
        <button
          className="btn btn-secondary"
          onClick={() => setRecordingStep(1)}
          style={{ padding: '12px 24px', fontSize: '16px' }}
        >
          ← Back
        </button>
        <button
          className="btn btn-primary"
          onClick={() => setRecordingStep(3)}
          style={{ padding: '12px 24px', fontSize: '16px' }}
        >
          Next: Media Setup →
        </button>
      </div>
    </div>
  </div>
));

// ============================================
/**
 * Recording - Main recording page component with three-step wizard
 * Handles live recording, transcription, and session management
 */
// ============================================

const Recording = () => {
  const { user } = useAuth();
  const { sendRecordingStatus, sendTranscriptionUpdate } = useSocket();

  // Session configuration state
  const [currentSession, setCurrentSession] = useState(null);

  // Multi-step wizard navigation state
  const [recordingStep, setRecordingStep] = useState(1); // 1: Session Info, 2: Questions, 3: Media Setup
  const [sessionFormData, setSessionFormData] = useState({
    agentName: '',
    intervieweeName: '',
    sessionTitle: '',
    questions: [],
    currentQuestion: ''
  });

  // Previous session data for question import feature
  const [previousSessions, setPreviousSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [loadingPrevSessions, setLoadingPrevSessions] = useState(false);

  // Live recording session state
  const [recordingStatus, setRecordingStatus] = useState('stopped');
  const [recordingTime, setRecordingTime] = useState(0);
  const [transcriptionText, setTranscriptionText] = useState('');
  const [sessionQuestions, setSessionQuestions] = useState([]);

  // Real-time transcription status and error handling
  const [transcriptionStatus, setTranscriptionStatus] = useState('idle'); // 'idle' | 'listening' | 'error'
  const [transcriptionErrorMsg, setTranscriptionErrorMsg] = useState('');


  // Automatic NLP analysis when session ends
  const runAutomaticNLPAnalysis = async (sessionId, transcription, audioUrl = null) => {
    try {

      // If we have neither text nor audio, we can't do anything
      if ((!transcription || !transcription.trim()) && !audioUrl) {
        return;
      }

      // Set status to processing
      const sessionRef = doc(db, 'sessions', sessionId);
      await updateDoc(sessionRef, {
        nlpStatus: 'processing'
      });

      // Run NLP analysis (GCF with Audio Fallback)
      const nlpResults = await analyzeTranscription(transcription, audioUrl);

      if (!nlpResults.success) {
        console.error('NLP analysis failed:', nlpResults.error);
        await updateDoc(sessionRef, {
          nlpStatus: 'failed'
        });
        return;
      }

      // If we got a better transcription from the server, save it!
      if (nlpResults.transcription && nlpResults.transcription !== transcription) {
        await updateDoc(sessionRef, {
          transcription: nlpResults.transcription
        });
        // Update local state for segmentation if needed
        transcription = nlpResults.transcription;
      }

      // Update the session with NLP results in Firestore
      await updateDoc(sessionRef, {
        nlpAnalysis: nlpResults,
        nlpStatus: 'completed',
        nlpProcessedAt: new Date()
      });


    } catch (error) {

      console.error('Error during automatic NLP analysis:', error);
      try {
        const sessionRef = doc(db, 'sessions', sessionId);
        await updateDoc(sessionRef, {
          nlpStatus: 'failed'
        });
      } catch (statusError) {
        console.error('Failed to update NLP status:', statusError);
      }
      // Don't throw - we don't want to break the recording stop flow
    }
  };

  // Question-based segmentation logic - SIMPLIFIED APPROACH
  const segmentTranscriptionByQuestions = async (fullTranscription, questions, sessionId) => {
    try {

      if (!questions || questions.length === 0) {
        return [];
      }

      // Clean and prepare the transcription
      const cleanTranscription = fullTranscription.trim();
      if (!cleanTranscription) {
        return [];
      }

      // Simple approach: divide transcription equally among questions
      // This assumes questions are asked in order and responses follow sequentially
      const segments = [];
      const words = cleanTranscription.split(/\s+/);
      const totalWords = words.length;
      const wordsPerQuestion = Math.ceil(totalWords / questions.length);


      let currentWordIndex = 0;

      for (let i = 0; i < questions.length; i++) {
        const question = questions[i];
        const startWordIndex = currentWordIndex;
        const endWordIndex = Math.min(currentWordIndex + wordsPerQuestion, totalWords);

        // Extract the response text for this question
        const responseWords = words.slice(startWordIndex, endWordIndex);
        const responseText = responseWords.join(' ');

        if (responseText.trim()) {
          // Estimate timing (rough approximation)
          const estimatedDuration = totalWords * 0.5; // Assume ~0.5 seconds per word
          const startTime = (startWordIndex / totalWords) * estimatedDuration;
          const endTime = (endWordIndex / totalWords) * estimatedDuration;

          segments.push({
            questionId: question.id,
            questionText: question.text,
            startTime: Math.floor(startTime),
            endTime: Math.floor(endTime),
            transcription: responseText,
            sentences: [{ text: responseText, timestamp: Math.floor(startTime) }],
            status: 'completed'
          });

        }

        currentWordIndex = endWordIndex;
      }

      return segments;

    } catch (error) {
      console.error('Error in question segmentation:', error);
      return [];
    }
  };


  const segmentByContinuousText = (fullTranscription, questions) => {
    const segments = [];
    const cleanText = fullTranscription.toLowerCase();


    // If transcription starts with response text (no initial question), handle it
    let transcriptionToProcess = cleanText;
    let initialResponseSegment = null;

    // Check if transcription starts directly with a response (no question at beginning)
    const firstWords = cleanText.split(/\s+/).slice(0, 15).join(' '); // First 15 words
    const startsWithResponse = !questions.some(q =>
      firstWords.toLowerCase().includes(q.text.toLowerCase().substring(0, 8)) // Check if any question starts the text
    );

    if (startsWithResponse && questions.length > 0) {
      // Assume the first question was asked but not captured, create segment for it
      initialResponseSegment = {
        questionId: questions[0].id,
        questionText: questions[0].text,
        startTime: 0,
        endTime: 0,
        transcription: '',
        sentences: [{ text: '', timestamp: 0 }],
        status: 'processing'
      };
    }

    // Split text into words for better analysis
    const words = transcriptionToProcess.split(/\s+/);

    // Find all question patterns in the text using fuzzy matching
    const questionMatches = [];
    let wordIndex = 0;

    // Helper function to check if two words are similar
    const areWordsSimilar = (word1, word2) => {
      if (word1 === word2) return true;

      // Simple synonym matching for common variations
      const synonyms = {
        'is': ['was', 'are', 'were', 'be'],
        'was': ['is', 'were', 'are', 'be'],
        'are': ['is', 'was', 'were', 'be'],
        'were': ['was', 'is', 'are', 'be'],
        'your': ['you', 'yours'],
        'you': ['your', 'yours'],
        'what': ['which', 'who', 'how'],
        'how': ['what', 'which', 'who'],
        'the': ['a', 'an'],
        'doing': ['do', 'did', 'done'],
        'name': ['names']
      };

      if (synonyms[word1]?.includes(word2) || synonyms[word2]?.includes(word1)) {
        return true;
      }

      return false;
    };

    while (wordIndex < words.length) {
      for (const question of questions) {
        const questionWords = question.text.toLowerCase().split(/\s+/).filter(w => w.length > 0);
        const questionLength = questionWords.length;

        // Look for matches within a sliding window (question length + some tolerance)
        const maxWindowSize = Math.min(questionLength + 2, words.length - wordIndex);

        for (let windowSize = questionLength; windowSize <= maxWindowSize; windowSize++) {
          if (wordIndex + windowSize > words.length) break;

          const windowWords = words.slice(wordIndex, wordIndex + windowSize);
          const windowText = windowWords.join(' ');

          // Check for exact phrase match first
          if (windowText === question.text.toLowerCase()) {
            questionMatches.push({
              question: question,
              startIndex: wordIndex,
              endIndex: wordIndex + windowSize,
              matchType: 'exact',
              text: windowText
            });
            wordIndex += windowSize; // Skip ahead past this match
            break;
          }

          // Check for fuzzy match with synonym support
          let matchCount = 0;
          let bestMatchScore = 0;

          for (let i = 0; i < questionWords.length; i++) {
            for (let j = 0; j < windowWords.length; j++) {
              if (areWordsSimilar(questionWords[i], windowWords[j])) {
                matchCount++;
                bestMatchScore = Math.max(bestMatchScore, matchCount / questionWords.length);
                break; // Found a match for this question word
              }
            }
          }

          // Also check for direct word matches
          const directMatches = questionWords.filter(qWord => windowWords.includes(qWord)).length;
          const totalMatchScore = Math.max(bestMatchScore, directMatches / questionWords.length);

          if (totalMatchScore >= 0.7) { // 70% match threshold
            questionMatches.push({
              question: question,
              startIndex: wordIndex,
              endIndex: wordIndex + windowSize,
              matchType: 'fuzzy',
              text: windowText,
              matchScore: totalMatchScore
            });
            wordIndex += windowSize; // Skip ahead past this match
            break;
          }
        }

        // If we found a match for this question, break to next word position
        if (questionMatches.length > 0 && questionMatches[questionMatches.length - 1].question.id === question.id) {
          break;
        }
      }
      wordIndex++;
    }

    // Sort matches by position
    questionMatches.sort((a, b) => a.startIndex - b.startIndex);

    // Remove duplicates (keep the first occurrence of each question)
    const uniqueMatches = [];
    const seenQuestions = new Set();

    for (const match of questionMatches) {
      if (!seenQuestions.has(match.question.id)) {
        uniqueMatches.push(match);
        seenQuestions.add(match.question.id);
      }
    }


    // Handle initial response segment (when transcription starts with response to first question)
    if (initialResponseSegment && uniqueMatches.length > 0) {
      const firstMatch = uniqueMatches[0];
      // Text from beginning to first found question
      const segmentEndChar = words.slice(0, firstMatch.startIndex).join(' ').length;
      const segmentText = fullTranscription.substring(0, segmentEndChar).trim();

      if (segmentText) {
        initialResponseSegment.transcription = segmentText;
        initialResponseSegment.sentences = [{ text: segmentText, timestamp: 0 }];
        segments.push(initialResponseSegment);
      }
    }

    // Create segments for found questions
    for (let i = 0; i < uniqueMatches.length; i++) {
      const match = uniqueMatches[i];
      const nextMatch = uniqueMatches[i + 1];

      // Convert word indices back to character indices
      const questionStartChar = words.slice(0, match.startIndex).join(' ').length + (match.startIndex > 0 ? 1 : 0);
      const questionEndChar = words.slice(0, match.endIndex).join(' ').length + 1;
      const segmentEndChar = nextMatch ? words.slice(0, nextMatch.startIndex).join(' ').length : cleanText.length;

      // Extract the response text (between questions)
      let segmentText = fullTranscription.substring(questionEndChar, segmentEndChar).trim();

      // Clean up the segment text
      if (segmentText) {
        // Remove any leading/trailing punctuation
        segmentText = segmentText.replace(/^[,!?.\s]+|[,!?.\s]+$/g, '');

        segments.push({
          questionId: match.question.id,
          questionText: match.question.text,
          startTime: 0, // No timestamps in continuous text
          endTime: 0,
          transcription: segmentText,
          sentences: [{ text: segmentText, timestamp: 0 }],
          status: 'processing'
        });

      }
    }

    // If no questions found, create one segment with all text
    if (segments.length === 0 && fullTranscription.trim()) {
      segments.push({
        questionId: 'general',
        questionText: 'General Discussion',
        startTime: 0,
        endTime: 0,
        transcription: fullTranscription.trim(),
        sentences: [{ text: fullTranscription.trim(), timestamp: 0 }],
        status: 'processing'
      });
    }

    return segments;
  };

  const splitTranscriptionIntoSentences = (transcription) => {
    // Split by sentence endings and preserve timestamps
    const sentences = [];
    const lines = transcription.split('\n');

    for (const line of lines) {
      if (line.trim()) {
        // Extract timestamp if present [HH:MM:SS PM]
        const timestampMatch = line.match(/\[(\d{1,2}:\d{2}:\d{2}\s*[AP]M?)\]/);
        const timestamp = timestampMatch ? parseTimestamp(timestampMatch[1]) : 0;

        // Remove timestamp from text
        const cleanText = line.replace(/\[[^\]]*\]/g, '').trim();

        if (cleanText) {
          // Split by sentence endings
          const sentenceEndings = cleanText.split(/[.!?]+/).filter(s => s.trim());
          for (const sentence of sentenceEndings) {
            if (sentence.trim()) {
              sentences.push({
                text: sentence.trim(),
                timestamp: timestamp,
                raw: line
              });
            }
          }
        }
      }
    }

    return sentences;
  };

  const parseTimestamp = (timestampStr) => {
    // Convert [2:15:38 PM] format to seconds
    try {
      const match = timestampStr.match(/(\d{1,2}):(\d{2}):(\d{2})\s*([AP]M?)?/);
      if (match) {
        let hours = parseInt(match[1]);
        const minutes = parseInt(match[2]);
        const seconds = parseInt(match[3]);
        const ampm = match[4];

        if (ampm && ampm.toUpperCase().startsWith('P') && hours !== 12) {
          hours += 12;
        } else if (ampm && ampm.toUpperCase().startsWith('A') && hours === 12) {
          hours = 0;
        }

        return hours * 3600 + minutes * 60 + seconds;
      }
    } catch (error) {
      console.error('Error parsing timestamp:', timestampStr, error);
    }
    return 0;
  };

  const findMatchingQuestion = (sentence, questions) => {
    const cleanSentence = sentence.toLowerCase().trim();


    for (const question of questions) {
      const cleanQuestion = question.text.toLowerCase().trim();

      // Direct match - check if sentence contains the question
      if (cleanSentence.includes(cleanQuestion)) {
        return question;
      }

      // Phrase match - split question into phrases and look for them
      const questionPhrases = cleanQuestion.split(/[,!?]/).map(p => p.trim()).filter(p => p.length > 0);
      for (const phrase of questionPhrases) {
        if (cleanSentence.includes(phrase)) {
          return question;
        }
      }

      // Word-based fuzzy match for key question words
      const questionWords = cleanQuestion.split(' ').filter(word => word.length > 3);
      const matchCount = questionWords.filter(word => cleanSentence.includes(word)).length;
      const matchRatio = matchCount / questionWords.length;


      if (matchRatio >= 0.6) { // Match at least 60% of key words
        return question;
      }
    }

    return null;
  };

  // Run question-based segmentation and store results
  const runQuestionSegmentation = async (sessionId, transcription, questions) => {
    try {

      // Segment the transcription
      const segments = await segmentTranscriptionByQuestions(transcription, questions, sessionId);

      if (segments.length === 0) {
        return;
      }

      // Store segments in Firestore with detailed NLP analysis
      const segmentsData = [];
      for (const segment of segments) {
        const segmentData = {
          questionId: segment.questionId,
          questionText: segment.questionText,
          startTime: segment.startTime,
          endTime: segment.endTime,
          transcription: segment.transcription,
          status: 'completed', // Mark as completed since transcription is done
          createdAt: new Date()
        };

        // Note: Individual segment NLP analysis removed - using only Cloud Functions for session-level analysis

        segmentsData.push(segmentData);
      }

      // Store all segments in Firestore
      const sessionRef = doc(db, 'sessions', sessionId);
      await updateDoc(sessionRef, {
        segments: segmentsData,
        segmentationCompletedAt: new Date()
      });


    } catch (error) {
      console.error('Error in question segmentation process:', error);
    }
  };

  const [isProcessingAudio, setIsProcessingAudio] = useState(false);

  // Audio visualization state
  const [volumeLevel, setVolumeLevel] = useState(0);

  // Media stream and recording refs
  const streamRef = useRef(null);
  const videoRef = useRef(null);
  const waveformCanvasRef = useRef(null);
  const spectrumCanvasRef = useRef(null);
  const videoRecorderRef = useRef(null);
  const audioRecorderRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const transcriptionIntervalRef = useRef(null);
  const recognitionActiveRef = useRef(false);
  const recognitionRestartBackoffRef = useRef(1000);
  const recordingTimerRef = useRef(null);

  // System status
  const [systemStatus, setSystemStatus] = useState({
    hasStream: false,
    cameraActive: false,
    microphoneActive: false,
    audioAnalysisActive: false
  });



  // Device selection state
  const [availableDevices, setAvailableDevices] = useState({
    audioInputs: [],
    videoInputs: []
  });
  const [selectedDevices, setSelectedDevices] = useState({
    audioInput: '',
    videoInput: ''
  });

  // Preloaded questions for agents
  const preloadedQuestions = [
    "Can you please state your full name and current position for the record?",
    "What is your department and how long have you been with the organization?",
    "Can you describe the incident or situation that occurred on [date]?",
    "What was your role or involvement in the events described?",
    "Were there any witnesses present during the incident?",
    "What actions did you take when you became aware of the situation?",
    "Did you follow standard protocol or procedures during this incident?",
    "Were there any security measures or protocols that were bypassed?",
    "What was the timeline of events as you understand them?",
    "Did you notice anything unusual or suspicious prior to the incident?",
    "Were any systems, documents, or equipment compromised?",
    "What immediate steps were taken to contain or address the situation?",
    "Who was notified about the incident and when?",
    "Are there any additional details or observations you'd like to add?",
    "Is there anything else that might be relevant to this investigation?"
  ];

  // Initialize form data with user name and load previous sessions
  useEffect(() => {
    if (user?.name && !sessionFormData.agentName) {
      setSessionFormData(prev => ({ ...prev, agentName: user.name }));
    }

    // Load previous sessions for question import
    const loadPreviousSessions = async () => {
      try {
        setLoadingPrevSessions(true);
        const sessions = await fbListSessions({ ownOnly: true });
        const withQuestions = sessions
          .filter(s => Array.isArray(s.customQuestions) && s.customQuestions.length > 0)
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        setPreviousSessions(withQuestions);
      } catch (err) {
        console.error('Failed to load previous sessions for questions:', err);
      } finally {
        setLoadingPrevSessions(false);
      }
    };

    loadPreviousSessions();
  }, [user?.name]);

  // ============ WIZARD STEP COMPONENTS ============

  // Step Progress Indicator Component
  const StepProgressIndicator = () => (
    <div className="card" style={{ marginBottom: '30px' }}>
      <div className="card-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div
            className={`badge ${recordingStep >= 1 ? 'badge-success' : 'badge-secondary'}`}
            style={{
              padding: '10px 16px',
              fontSize: '14px',
              backgroundColor: recordingStep >= 1 ? 'var(--success-color, #28a745)' : 'var(--border-color, #6c757d)',
              color: '#fff',
              borderRadius: '20px',
              cursor: recordingStep > 1 ? 'pointer' : 'default'
            }}
            onClick={() => recordingStep > 1 && setRecordingStep(1)}
          >
            1. Session Info
          </div>
          <div style={{
            flex: 1,
            height: '3px',
            backgroundColor: recordingStep >= 2 ? 'var(--success-color, #28a745)' : 'var(--border-color, #444)',
            borderRadius: '2px'
          }} />
          <div
            className={`badge ${recordingStep >= 2 ? 'badge-success' : 'badge-secondary'}`}
            style={{
              padding: '10px 16px',
              fontSize: '14px',
              backgroundColor: recordingStep >= 2 ? 'var(--success-color, #28a745)' : 'var(--border-color, #6c757d)',
              color: '#fff',
              borderRadius: '20px',
              cursor: recordingStep > 2 ? 'pointer' : 'default'
            }}
            onClick={() => recordingStep > 2 && setRecordingStep(2)}
          >
            2. Questions
          </div>
          <div style={{
            flex: 1,
            height: '3px',
            backgroundColor: recordingStep >= 3 ? 'var(--success-color, #28a745)' : 'var(--border-color, #444)',
            borderRadius: '2px'
          }} />
          <div
            className={`badge ${recordingStep >= 3 ? 'badge-success' : 'badge-secondary'}`}
            style={{
              padding: '10px 16px',
              fontSize: '14px',
              backgroundColor: recordingStep >= 3 ? 'var(--success-color, #28a745)' : 'var(--border-color, #6c757d)',
              color: '#fff',
              borderRadius: '20px'
            }}
          >
            3. Media Setup
          </div>
        </div>
      </div>
    </div>
  );

  // Step 1 SessionInfoStep is now defined outside Recording (see top of file)

  // Question management functions for Step 2
  const addQuestion = () => {
    if (sessionFormData.currentQuestion && sessionFormData.currentQuestion.trim()) {
      const newQuestionObj = {
        id: `q_${Date.now()}`,
        text: sessionFormData.currentQuestion.trim()
      };
      setSessionFormData(prev => ({
        ...prev,
        questions: [...prev.questions, newQuestionObj],
        currentQuestion: ''
      }));
    }
  };

  const removeQuestion = (index) => {
    setSessionFormData(prev => ({
      ...prev,
      questions: prev.questions.filter((_, i) => i !== index)
    }));
  };

  const applyQuestionsFromPrevious = () => {
    if (!selectedSessionId) return;
    const source = previousSessions.find(s => s.id === selectedSessionId);
    if (!source || !Array.isArray(source.customQuestions)) return;
    setSessionFormData(prev => {
      const merged = [...prev.questions.map(q => q.text), ...source.customQuestions];
      const seen = new Set();
      const deduped = merged.filter(q => {
        const key = String(q).trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return { ...prev, questions: deduped.map((text, index) => ({ id: `q_${Date.now()}_${index}`, text })) };
    });
  };

  // Step 2 component is now defined outside Recording (see above)

  // Step 3: Media Setup with Preview
  const MediaSetupStep = () => {
    const previewVideoRef = useRef(null);
    const previewCanvasRef = useRef(null);
    const previewStreamRef = useRef(null);
    const previewAudioContextRef = useRef(null);
    const previewAnalyserRef = useRef(null);
    const previewAnimationRef = useRef(null);
    const previewRecognitionRef = useRef(null);
    const [previewVolumeLevel, setPreviewVolumeLevel] = useState(0);
    const [previewError, setPreviewError] = useState(null);
    const [isPreviewLoading, setIsPreviewLoading] = useState(true);
    const [liveTranscript, setLiveTranscript] = useState('');
    const [transcriptStatus, setTranscriptStatus] = useState('idle'); // 'idle' | 'listening' | 'error'
    const [transcriptError, setTranscriptError] = useState('');

    // Start media preview when step 3 is shown
    useEffect(() => {
      let mounted = true;

      const startPreview = async () => {
        try {
          setIsPreviewLoading(true);
          setPreviewError(null);

          // Request camera and microphone
          const constraints = {
            video: selectedDevices.videoInput
              ? { deviceId: { exact: selectedDevices.videoInput } }
              : { facingMode: 'user' },
            audio: selectedDevices.audioInput
              ? { deviceId: { exact: selectedDevices.audioInput } }
              : true
          };

          const stream = await navigator.mediaDevices.getUserMedia(constraints);

          if (!mounted) {
            stream.getTracks().forEach(t => t.stop());
            return;
          }

          previewStreamRef.current = stream;

          // Set video preview
          if (previewVideoRef.current) {
            previewVideoRef.current.srcObject = stream;
          }

          // Setup audio visualization
          const audioContext = new (window.AudioContext || window.webkitAudioContext)();
          previewAudioContextRef.current = audioContext;

          if (audioContext.state === 'suspended') {
            await audioContext.resume();
          }

          const source = audioContext.createMediaStreamSource(stream);
          const analyser = audioContext.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.8;
          source.connect(analyser);
          previewAnalyserRef.current = analyser;

          // Start audio level monitoring
          const updateAudioLevel = () => {
            if (!previewAnalyserRef.current || !mounted) return;

            const dataArray = new Uint8Array(previewAnalyserRef.current.frequencyBinCount);
            previewAnalyserRef.current.getByteTimeDomainData(dataArray);

            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += Math.abs(dataArray[i] - 128);
            }
            const volume = Math.round((sum / dataArray.length) * 100 / 128);
            setPreviewVolumeLevel(volume);

            // Draw simple waveform on canvas
            if (previewCanvasRef.current) {
              const canvas = previewCanvasRef.current;
              const ctx = canvas.getContext('2d');
              const width = canvas.width;
              const height = canvas.height;

              ctx.fillStyle = '#1a1a1a';
              ctx.fillRect(0, 0, width, height);

              ctx.strokeStyle = '#28a745';
              ctx.lineWidth = 2;
              ctx.beginPath();

              const sliceWidth = width / dataArray.length;
              let x = 0;

              for (let i = 0; i < dataArray.length; i++) {
                const v = (dataArray[i] - 128) / 128.0;
                const y = (v * height * 0.6) / 2 + height / 2;

                if (i === 0) {
                  ctx.moveTo(x, y);
                } else {
                  ctx.lineTo(x, y);
                }
                x += sliceWidth;
              }

              ctx.stroke();
            }

            previewAnimationRef.current = requestAnimationFrame(updateAudioLevel);
          };

          updateAudioLevel();
          setIsPreviewLoading(false);

          // Start speech recognition for live preview
          const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
          if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            let networkErrorCount = 0;

            recognition.onresult = (event) => {
              networkErrorCount = 0;
              setTranscriptStatus('listening');

              let transcript = '';
              for (let i = 0; i < event.results.length; i++) {
                transcript += event.results[i][0].transcript;
              }
              setLiveTranscript(transcript);
            };

            recognition.onerror = (event) => {
              if (event.error === 'network') {
                networkErrorCount++;
                if (networkErrorCount >= 3) {
                  setTranscriptStatus('error');
                  setTranscriptError('Speech service unavailable. Live preview disabled.');
                } else {
                  setTimeout(() => {
                    if (mounted && previewRecognitionRef.current) {
                      try { recognition.start(); } catch (e) { /* ignore */ }
                    }
                  }, 1000 * networkErrorCount);
                }
              } else if (event.error === 'no-speech' || event.error === 'aborted') {
                setTimeout(() => {
                  if (mounted && previewRecognitionRef.current) {
                    try { recognition.start(); } catch (e) { /* ignore */ }
                  }
                }, 500);
              } else if (event.error === 'not-allowed') {
                setTranscriptStatus('error');
                setTranscriptError('Microphone access denied.');
              }
            };

            recognition.onend = () => {
              if (mounted && previewRecognitionRef.current && transcriptStatus !== 'error') {
                try { recognition.start(); } catch (e) { /* ignore */ }
              }
            };

            previewRecognitionRef.current = recognition;
            try {
              recognition.start();
              setTranscriptStatus('listening');
            } catch (e) {
              setTranscriptStatus('error');
              setTranscriptError('Could not start speech recognition.');
            }
          } else {
            setTranscriptStatus('error');
            setTranscriptError('Speech recognition not supported in this browser.');
          }

        } catch (error) {
          console.error('Preview error:', error);
          if (mounted) {
            setPreviewError(error.message || 'Failed to access camera/microphone');
            setIsPreviewLoading(false);
          }
        }
      };

      startPreview();

      // Cleanup
      return () => {
        mounted = false;
        if (previewAnimationRef.current) {
          cancelAnimationFrame(previewAnimationRef.current);
        }
        if (previewStreamRef.current) {
          previewStreamRef.current.getTracks().forEach(t => t.stop());
        }
        if (previewAudioContextRef.current && previewAudioContextRef.current.state !== 'closed') {
          previewAudioContextRef.current.close();
        }
        if (previewRecognitionRef.current) {
          try { previewRecognitionRef.current.stop(); } catch (e) { /* ignore */ }
          previewRecognitionRef.current = null;
        }
      };
    }, [transcriptStatus]);

    const handleCreateSession = async () => {
      // Stop preview stream before starting recording
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (previewAnimationRef.current) {
        cancelAnimationFrame(previewAnimationRef.current);
      }
      if (previewAudioContextRef.current && previewAudioContextRef.current.state !== 'closed') {
        previewAudioContextRef.current.close();
      }

      // Call the existing session setup handler
      await handleSessionSetup(sessionFormData);
    };

    return (
      <div className="card">
        <div className="card-header">Media Setup</div>
        <div className="card-body">
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
            Verify your camera and microphone are working correctly before starting the recording.
          </p>

          {previewError && (
            <div style={{
              padding: '16px',
              backgroundColor: 'var(--danger-color, #dc3545)',
              color: '#fff',
              borderRadius: '8px',
              marginBottom: '20px'
            }}>
              <strong>Error:</strong> {previewError}
              <br />
              <small>Please check your device permissions and try again.</small>
            </div>
          )}

          {/* Video Preview */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Video Preview</label>
            <div style={{
              backgroundColor: '#000',
              borderRadius: '8px',
              overflow: 'hidden',
              position: 'relative',
              aspectRatio: '16/9',
              maxHeight: '300px'
            }}>
              {isPreviewLoading && (
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  color: '#fff'
                }}>
                  Loading preview...
                </div>
              )}
              <video
                ref={previewVideoRef}
                autoPlay
                muted
                playsInline
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
          </div>

          {/* Device Selection */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            {/* Video Device */}
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Camera</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select
                  className="form-control"
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-primary)'
                  }}
                  value={selectedDevices.videoInput}
                  onChange={(e) => handleDeviceChange('videoInput', e.target.value)}
                >
                  {availableDevices.videoInputs.map(device => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Camera ${device.deviceId.slice(0, 8)}...`}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn-secondary"
                  onClick={enumerateDevices}
                  title="Refresh devices"
                  style={{ padding: '10px 14px' }}
                >
                  ↻
                </button>
              </div>
            </div>

            {/* Audio Device */}
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Microphone</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select
                  className="form-control"
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-primary)'
                  }}
                  value={selectedDevices.audioInput}
                  onChange={(e) => handleDeviceChange('audioInput', e.target.value)}
                >
                  {availableDevices.audioInputs.map(device => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Microphone ${device.deviceId.slice(0, 8)}...`}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn-secondary"
                  onClick={enumerateDevices}
                  title="Refresh devices"
                  style={{ padding: '10px 14px' }}
                >
                  ↻
                </button>
              </div>
            </div>
          </div>

          {/* Audio Level Indicator */}
          <div style={{ marginBottom: '30px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
              Audio Level: {previewVolumeLevel}%
            </label>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              backgroundColor: 'var(--bg-tertiary)',
              padding: '12px',
              borderRadius: '8px'
            }}>
              <canvas
                ref={previewCanvasRef}
                width={300}
                height={60}
                style={{ borderRadius: '4px', flex: 1 }}
              />
              <div style={{
                width: '20px',
                height: '60px',
                backgroundColor: '#333',
                borderRadius: '4px',
                overflow: 'hidden',
                position: 'relative'
              }}>
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  width: '100%',
                  height: `${Math.min(previewVolumeLevel, 100)}%`,
                  backgroundColor: previewVolumeLevel > 80 ? '#dc3545' : previewVolumeLevel > 50 ? '#ffc107' : '#28a745',
                  transition: 'height 0.1s ease-out'
                }} />
              </div>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
              Speak into your microphone to test the audio level
            </p>
          </div>

          {/* Live Transcription Preview */}
          <div style={{ marginBottom: '30px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
              Live Transcription Preview
              {transcriptStatus === 'listening' && (
                <span style={{
                  marginLeft: '8px',
                  fontSize: '12px',
                  color: 'var(--success-color)',
                  fontWeight: 'normal'
                }}>
                  ● Listening...
                </span>
              )}
              {transcriptStatus === 'error' && (
                <span style={{
                  marginLeft: '8px',
                  fontSize: '12px',
                  color: 'var(--warning-color, #ffc107)',
                  fontWeight: 'normal'
                }}>
                  ⚠ {transcriptError}
                </span>
              )}
            </label>
            <div style={{
              backgroundColor: 'var(--bg-tertiary)',
              padding: '16px',
              borderRadius: '8px',
              minHeight: '80px',
              maxHeight: '150px',
              overflowY: 'auto'
            }}>
              {liveTranscript ? (
                <p style={{ margin: 0, lineHeight: '1.6', color: 'var(--text-primary)' }}>
                  {liveTranscript}
                </p>
              ) : (
                <p style={{
                  margin: 0,
                  color: 'var(--text-secondary)',
                  fontStyle: 'italic'
                }}>
                  {transcriptStatus === 'error'
                    ? 'Live transcription unavailable. Audio will be transcribed after recording.'
                    : 'Start speaking to see live transcription...'}
                </p>
              )}
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
              This is a preview only. Full transcription will be captured during recording.
            </p>
          </div>

          {/* Navigation Buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setRecordingStep(2)}
              style={{ padding: '12px 24px', fontSize: '16px' }}
            >
              ← Back
            </button>
            <button
              className="btn btn-primary"
              onClick={handleCreateSession}
              disabled={isPreviewLoading || previewError}
              style={{
                padding: '12px 24px',
                fontSize: '16px',
                backgroundColor: 'var(--success-color, #28a745)',
                opacity: (isPreviewLoading || previewError) ? 0.6 : 1
              }}
            >
              Create Session & Start Recording
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ============ END WIZARD STEP COMPONENTS ============





  const updateSystemStatus = useCallback((updates) => {
    setSystemStatus(prev => ({ ...prev, ...updates }));
  }, []);

  // Drawing functions (must be defined before useEffect hooks that use them)
  const drawWaveform = useCallback((dataArray, volumeLevel = 0) => {
    const canvas = waveformCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Use the display size for drawing calculations
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;

    if (width === 0 || height === 0) return;

    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    // Draw volume indicator bar
    if (volumeLevel > 0) {
      const barHeight = 6;
      ctx.fillStyle = volumeLevel > 20 ? '#ffffff' : volumeLevel > 10 ? '#ffc107' : '#dc3545';
      ctx.fillRect(0, 0, (volumeLevel / 100) * width, barHeight);
      ctx.fillStyle = 'white';
      ctx.font = '10px Arial';
      ctx.fillText(`${volumeLevel}%`, 5, barHeight + 12);
    }

    // Draw activity indicator
    ctx.fillStyle = volumeLevel > 5 ? '#ffffff' : '#6c757d';
    ctx.fillRect(width - 15, 5, 10, 10);

    // Draw waveform
    ctx.strokeStyle = '#dc3545';
    ctx.lineWidth = 2;
    ctx.beginPath();

    const sliceWidth = width / dataArray.length;
    let x = 0;

    for (let i = 0; i < dataArray.length; i++) {
      const v = (dataArray[i] - 128) / 128.0;
      const y = (v * height * 0.6) / 2 + height / 2;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }

      x += sliceWidth;
    }

    ctx.stroke();
  }, []);

  const drawSpectrum = useCallback((frequencyData) => {
    const canvas = spectrumCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Use the display size for drawing calculations
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;

    if (width === 0 || height === 0) return;

    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    const barWidth = (width / frequencyData.length) * 2.5;
    let x = 0;

    for (let i = 0; i < frequencyData.length; i++) {
      const barHeight = (frequencyData[i] / 255) * height;

      const hue = (i / frequencyData.length) * 360;
      ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;

      ctx.fillRect(x, height - barHeight, barWidth, barHeight);
      x += barWidth + 1;
    }
  }, []);

  const startVisualization = useCallback(() => {
    if (!audioContextRef.current || !analyserRef.current) {
      return;
    }

    const updateVisualization = () => {
      if (!analyserRef.current || recordingStatus === 'stopped') {
        return;
      }

      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const frequencyDataArray = new Uint8Array(bufferLength);

      analyserRef.current.getByteTimeDomainData(dataArray);
      analyserRef.current.getByteFrequencyData(frequencyDataArray);

      // Calculate volume level
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += Math.abs(dataArray[i] - 128);
      }
      const volume = Math.round((sum / bufferLength) * 100 / 128);

      setVolumeLevel(Math.round(volume));

      drawWaveform(dataArray, volume);
      drawSpectrum(frequencyDataArray);

      updateSystemStatus({
        audioAnalysisActive: true,
        microphoneActive: volume > 5,
        visualizationRunning: true
      });

      animationFrameRef.current = requestAnimationFrame(updateVisualization);
    };

    updateVisualization();
  }, [recordingStatus, updateSystemStatus, drawWaveform, drawSpectrum]);

  const stopVisualization = useCallback(() => {
    updateSystemStatus({ visualizationRunning: false });
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  }, [updateSystemStatus]);

  // Enumerate available devices with cross-platform compatibility
  const enumerateDevices = useCallback(async () => {
    try {

      // First, request basic permissions to ensure device enumeration works on Windows
      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true
        });
        // Stop the temporary stream immediately
        tempStream.getTracks().forEach(track => track.stop());
      } catch (permError) {
      }

      const devices = await navigator.mediaDevices.enumerateDevices();

      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      const videoInputs = devices.filter(device => device.kind === 'videoinput');


      setAvailableDevices({
        audioInputs,
        videoInputs
      });

      // Set default selections if not already set
      if (audioInputs.length > 0 && !selectedDevices.audioInput) {
        setSelectedDevices(prev => ({
          ...prev,
          audioInput: audioInputs[0].deviceId
        }));
      }

      if (videoInputs.length > 0 && !selectedDevices.videoInput) {
        setSelectedDevices(prev => ({
          ...prev,
          videoInput: videoInputs[0].deviceId
        }));
      }
    } catch (error) {
      console.error('Error enumerating devices:', error);
      // Try to provide helpful error messages for different platforms
      if (error.name === 'NotAllowedError') {
        console.error('Permission denied. Please allow camera and microphone access.');
      } else if (error.name === 'NotFoundError') {
        console.error('No media devices found. Please check your camera and microphone.');
      } else if (error.name === 'NotSupportedError') {
        console.error('Media devices not supported in this browser.');
      }
    }
  }, [selectedDevices.audioInput, selectedDevices.videoInput]);

  // Handle device changes
  const handleDeviceChange = async (deviceType, deviceId) => {
    try {
      setSelectedDevices(prev => ({
        ...prev,
        [deviceType]: deviceId
      }));

      // If we have an active stream, restart it with new devices
      if (streamRef.current && recordingStatus === 'stopped') {
        await setupMediaRecording();
      }
    } catch (error) {
      console.error('Error changing device:', error);
    }
  };

  // Initialize devices on component mount
  useEffect(() => {
    enumerateDevices();
  }, [enumerateDevices]);

  // Cleanup function
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (transcriptionIntervalRef.current) {
        clearInterval(transcriptionIntervalRef.current);
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          track.stop();
        });
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Initialize canvases when component mounts
  useEffect(() => {
    const initializeCanvases = () => {
      // Initialize waveform canvas
      if (waveformCanvasRef.current) {
        const canvas = waveformCanvasRef.current;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;

        // Set actual size in memory (scaled to account for extra pixel density)
        canvas.width = canvas.offsetWidth * dpr;
        canvas.height = canvas.offsetHeight * dpr;

        // Scale the drawing context so everything draws at the correct size
        ctx.scale(dpr, dpr);

        // Set CSS size to maintain display size
        canvas.style.width = canvas.offsetWidth + 'px';
        canvas.style.height = canvas.offsetHeight + 'px';
      }

      // Initialize spectrum canvas
      if (spectrumCanvasRef.current) {
        const canvas = spectrumCanvasRef.current;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;

        // Set actual size in memory (scaled to account for extra pixel density)
        canvas.width = canvas.offsetWidth * dpr;
        canvas.height = canvas.offsetHeight * dpr;

        // Scale the drawing context so everything draws at the correct size
        ctx.scale(dpr, dpr);

        // Set CSS size to maintain display size
        canvas.style.width = canvas.offsetWidth + 'px';
        canvas.style.height = canvas.offsetHeight + 'px';
      }
    };

    // Initialize immediately and also on resize
    setTimeout(initializeCanvases, 100);
    window.addEventListener('resize', initializeCanvases);

    return () => {
      window.removeEventListener('resize', initializeCanvases);
    };
  }, []);

  // Monitor visualization and restart if needed
  useEffect(() => {
    if (recordingStatus === 'recording' && audioContextRef.current && analyserRef.current) {
      const interval = setInterval(() => {
        // If we're recording but animation frame is not running, restart visualization
        if (!animationFrameRef.current) {
          startVisualization();
        }
      }, 3000); // Check every 3 seconds

      return () => clearInterval(interval);
    }
  }, [recordingStatus, startVisualization]);

  // Reinitialize canvases when recording status changes
  useEffect(() => {
    if (recordingStatus === 'recording') {
      // Brief delay to ensure media setup is complete
      setTimeout(() => {
        if (audioContextRef.current && analyserRef.current && !animationFrameRef.current) {
          startVisualization();
        }
      }, 300);
    }
  }, [recordingStatus, startVisualization]);

  const setupMediaRecording = async () => {
    try {

      const constraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 44100
        }
      };

      // Add device constraints if devices are selected
      if (selectedDevices.videoInput) {
        constraints.video.deviceId = { exact: selectedDevices.videoInput };
      }
      if (selectedDevices.audioInput) {
        constraints.audio.deviceId = { exact: selectedDevices.audioInput };
      }


      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (deviceError) {

        // Fallback to default devices if specific device selection fails
        const fallbackConstraints = {
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: false,
            autoGainControl: false,
            sampleRate: 44100
          }
        };

        stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
      }

      streamRef.current = stream;

      const audioTracks = stream.getAudioTracks();
      const videoTracks = stream.getVideoTracks();

      // Create a clone of the stream for the video preview
      // This ensures the video preview stays active during recording
      const videoStream = new MediaStream();
      videoTracks.forEach(track => {
        videoStream.addTrack(track.clone());
      });

      // Set up video preview with cloned stream
      if (videoRef.current) {
        videoRef.current.srcObject = videoStream;
        await new Promise((resolve) => {
          videoRef.current.addEventListener('loadedmetadata', resolve, { once: true });
        });
      }

      updateSystemStatus({
        hasStream: true,
        audioTracksCount: audioTracks.length,
        videoTracksCount: videoTracks.length,
        cameraActive: videoTracks.length > 0 && videoTracks[0].readyState === 'live',
        microphoneActive: audioTracks.length > 0 && audioTracks[0].readyState === 'live'
      });

      // Configure RecordRTC for audio recording with original stream
      try {
        audioRecorderRef.current = new RecordRTC(stream, {
          type: 'audio',
          mimeType: 'audio/wav',
          sampleRate: 44100,
          numberOfAudioChannels: 1
        });
      } catch (error) {
        console.error('ERROR: Failed to configure audio recorder:', error);
        return false;
      }

      // Configure RecordRTC for video recording with original stream
      try {
        videoRecorderRef.current = new RecordRTC(stream, {
          type: 'video',
          mimeType: 'video/webm;codecs=vp9'
        });
      } catch (error) {
        console.error('ERROR: Failed to configure video recorder:', error);
        return false;
      }

      const audioVisualizationSuccess = await setupAudioVisualization(stream);

      return audioVisualizationSuccess;

    } catch (error) {
      console.error('ERROR: Failed to setup media recording:', error);

      // Provide specific error messages for different scenarios
      if (error.name === 'NotAllowedError') {
        console.error('Permission denied. Please allow camera and microphone access in your browser.');
        alert('Please allow camera and microphone access to use the recording feature.');
      } else if (error.name === 'NotFoundError') {
        console.error('No media devices found. Please check your camera and microphone connections.');
        alert('No camera or microphone found. Please check your device connections.');
      } else if (error.name === 'NotSupportedError') {
        console.error('Media devices not supported in this browser.');
        alert('Media devices are not supported in this browser. Please use Chrome, Firefox, or Edge.');
      } else if (error.name === 'OverconstrainedError') {
        console.error('Selected device constraints cannot be satisfied.');
        alert('The selected camera or microphone is not available. Please try selecting different devices.');
      } else {
        console.error('Unknown error:', error);
        alert('Failed to access media devices. Please check your browser settings and try again.');
      }

      updateSystemStatus({
        hasStream: false,
        cameraActive: false,
        microphoneActive: false
      });
      return false;
    }
  };

  const setupAudioVisualization = async (stream) => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;

      updateSystemStatus({ audioContextState: audioContext.state });

      if (audioContext.state === 'suspended') {
        await audioContext.resume();
        updateSystemStatus({ audioContextState: audioContext.state });
      }

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();

      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      analyser.minDecibels = -90;
      analyser.maxDecibels = -10;

      source.connect(analyser);
      analyserRef.current = analyser;

      updateSystemStatus({
        hasAnalyser: true,
        audioContextState: audioContext.state
      });

      // Wait a bit for canvases to be ready, then start visualization
      setTimeout(() => {
        startVisualization();
      }, 100);

      return true;

    } catch (error) {
      console.error('ERROR: Failed to setup audio visualization:', error);
      return false;
    }
  };

  // Real-time transcription using Web Speech API
  const startTranscription = useCallback(() => {
    // Check browser support for Web Speech API
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setTranscriptionStatus('error');
      setTranscriptionErrorMsg('Web Speech API not supported in this browser. Audio will be transcribed after recording.');
      return;
    }

    // Clear any stale text from previous sessions
    setTranscriptionText('');
    setIsProcessingAudio(true);
    setTranscriptionStatus('listening');
    setTranscriptionErrorMsg('');

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    // Track network error count to avoid infinite retries
    let networkErrorCount = 0;
    const maxNetworkErrors = 3;

    // Handle speech recognition results
    recognition.onresult = (event) => {
      networkErrorCount = 0; // Reset on successful result
      setTranscriptionStatus('listening');

      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + ' ';
        }
      }

      // Append final transcript to existing text
      if (finalTranscript) {
        setTranscriptionText(prev => prev + finalTranscript);
      }
    };

    // Handle errors with graceful fallback
    recognition.onerror = (event) => {
      if (event.error === 'no-speech') {
        // Normal - just means no speech detected, retry
        setTimeout(() => {
          if (recognitionActiveRef.current) {
            try { recognition.start(); } catch (e) { /* ignore */ }
          }
        }, 1000);
      } else if (event.error === 'aborted') {
        // User or system aborted, retry if still active
        setTimeout(() => {
          if (recognitionActiveRef.current) {
            try { recognition.start(); } catch (e) { /* ignore */ }
          }
        }, 500);
      } else if (event.error === 'network') {
        networkErrorCount++;
        if (networkErrorCount >= maxNetworkErrors) {
          // Stop trying after multiple network failures
          setTranscriptionStatus('error');
          setTranscriptionErrorMsg('Speech service unavailable. Audio will be transcribed after recording ends.');
          recognitionActiveRef.current = false;
        } else {
          // Retry with exponential backoff
          setTimeout(() => {
            if (recognitionActiveRef.current) {
              try { recognition.start(); } catch (e) { /* ignore */ }
            }
          }, Math.min(1000 * Math.pow(2, networkErrorCount), 5000));
        }
      } else if (event.error === 'not-allowed') {
        setTranscriptionStatus('error');
        setTranscriptionErrorMsg('Microphone access denied for speech recognition.');
        recognitionActiveRef.current = false;
      } else {
        // Other errors - log once and continue
        console.error('Speech recognition error:', event.error);
        setTimeout(() => {
          if (recognitionActiveRef.current) {
            try { recognition.start(); } catch (e) { /* ignore */ }
          }
        }, 2000);
      }
    };

    // Auto-restart when recognition ends (if still recording)
    recognition.onend = () => {
      if (recognitionActiveRef.current && transcriptionStatus !== 'error') {
        try {
          recognition.start();
        } catch (e) {
          // Ignore restart errors
        }
      }
    };

    // Store reference and start
    transcriptionIntervalRef.current = recognition;
    recognitionActiveRef.current = true;

    try {
      recognition.start();
    } catch (e) {
      setTranscriptionStatus('error');
      setTranscriptionErrorMsg('Failed to start speech recognition.');
    }
  }, [transcriptionStatus]);

  const stopTranscription = useCallback(() => {
    if (transcriptionIntervalRef.current) {
      try {
        transcriptionIntervalRef.current.stop();
        transcriptionIntervalRef.current = null;
      } catch (error) {
      }
    }
    recognitionActiveRef.current = false;
    recognitionRestartBackoffRef.current = 1000;
    setIsProcessingAudio(false);
  }, []);



  const handleSessionSetup = async (formData) => {
    try {
      const sessionData = {
        agentName: formData.agentName,
        intervieweeName: formData.intervieweeName,
        sessionTitle: formData.sessionTitle || `${formData.agentName} - ${formData.intervieweeName} Session`,
        customQuestions: formData.customQuestions || [],
        timestamp: Date.now()
      };

      // Create session in Firestore
      const created = await fbCreateSession({
        title: sessionData.sessionTitle,
        description: `Recording session with ${sessionData.intervieweeName}`,
        agentName: sessionData.agentName,
        intervieweeName: sessionData.intervieweeName,
        customQuestions: sessionData.customQuestions,
        questions: formData.questions, // Add segmentation questions
      });

      const newSession = {
        ...created,
        title: created.title || sessionData.sessionTitle,
        customQuestions: formData.customQuestions || [],
        questions: formData.questions || [] // Store questions for segmentation
      };

      // Set questions for segmentation
      setSessionQuestions(formData.questions || []);

      // Set the session state first
      setCurrentSession(newSession);

      // Wait for state to update, then start recording
      setTimeout(() => {
        startRecordingWithSetup(newSession);
      }, 100);
    } catch (error) {
      console.error('Session setup error:', error);
      alert('Error creating session. Please try again.');
    }
  };

  // Separate function to start recording with a known session
  const startRecordingWithSetup = async (session) => {
    try {

      // Ensure media is setup
      if (!streamRef.current) {
        const mediaSetup = await setupMediaRecording();
        if (!mediaSetup) {
          alert('Failed to setup media recording. Please check your camera and microphone permissions.');
          return;
        }
      }

      // Mark session started in Firestore
      try {
        await fbStartSession(session.id);
      } catch (sessionError) {
        console.error('Failed to mark session started in Firestore:', sessionError);
      }

      // IMPORTANT: Resume audio context with user gesture
      if (audioContextRef.current) {
        if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume();
        }
        updateSystemStatus({ audioContextState: audioContextRef.current.state });
      }

      // Start recording immediately
      if (videoRecorderRef.current) {
        videoRecorderRef.current.startRecording();
      }

      if (audioRecorderRef.current) {
        audioRecorderRef.current.startRecording();
      }

      setRecordingStatus('recording');

      // Start timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      // Start transcription if available
      startTranscription();

      updateSystemStatus({
        cameraActive: true,
        microphoneActive: true,
        visualizationRunning: true
      });

      // Send status update via socket
      try {
        sendRecordingStatus(session.id, 'recording', Date.now());
      } catch (socketError) {
        console.error('Failed to send recording status via socket:', socketError);
        // Don't stop recording for socket errors
      }

    } catch (error) {
      console.error('Recording start error:', error);
      alert('Failed to start recording. Please try again.');

      // Clean up on error
      setRecordingStatus('stopped');
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    }
  };

  const stopRecording = async () => {
    try {
      stopVisualization();
      stopTranscription();

      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }

      setRecordingStatus('stopped');

      // Stop recording and get blobs
      let videoBlob = null;
      let audioBlob = null;

      // Stop video recording and get blob
      if (videoRecorderRef.current) {
        await new Promise((resolve) => {
          videoRecorderRef.current.stopRecording(() => {
            videoBlob = videoRecorderRef.current.getBlob();
            resolve();
          });
        });
      }

      // Stop audio recording and get blob
      if (audioRecorderRef.current) {
        await new Promise((resolve) => {
          audioRecorderRef.current.stopRecording(() => {
            audioBlob = audioRecorderRef.current.getBlob();
            resolve();
          });
        });
      }

      // Upload to Firebase Storage and update Firestore
      let uploadSuccess = false;
      let uploadedAudioUrl = null; // Capture for NLP fallback

      if (currentSession) {
        try {

          // Upload files with individual error handling
          const uploadPromises = [];

          if (videoBlob) {
            uploadPromises.push(
              uploadSessionFile(currentSession.id, 'video', videoBlob).catch(err => {
                console.error('Video upload failed:', err);
                return null;
              })
            );
          }

          if (audioBlob) {
            // We specifically capture the audio upload promise to get the URL
            const audioPromise = uploadSessionFile(currentSession.id, 'audio', audioBlob)
              .then(url => {
                uploadedAudioUrl = url;
                return url;
              })
              .catch(err => {
                console.error('Audio upload failed:', err);
                return null;
              });
            uploadPromises.push(audioPromise);
          }

          if (transcriptionText && transcriptionText.trim()) {
            uploadPromises.push(
              uploadTranscriptionText(currentSession.id, transcriptionText).catch(err => {
                console.error('Transcription upload failed:', err);
                return null;
              })
            );
          } else {
          }

          // Wait for all uploads to complete (some may fail)
          await Promise.all(uploadPromises);
          uploadSuccess = true;

        } catch (error) {
          console.error('Critical error during file upload process:', error);
          // Continue with session completion even if uploads fail
        }
      }

      // Stop the camera stream completely when stopping recording
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          track.stop();
        });
        streamRef.current = null;

        // Clear video preview
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
      }

      updateSystemStatus({
        hasStream: false,
        cameraActive: false,
        microphoneActive: false,
        visualizationRunning: false
      });

      // Update session status and duration in Firestore - ALWAYS run this
      if (currentSession) {
        try {
          await fbStopSession(currentSession.id, recordingTime * 1000);
          sendRecordingStatus(currentSession.id, 'stopped', Date.now());

          // Set nlpStatus to 'pending' - analysis will be triggered manually from Sessions page
          const sessionRef = doc(db, 'sessions', currentSession.id);
          await updateDoc(sessionRef, {
            nlpStatus: 'pending',
            transcriptionText: transcriptionText || ''
          });

        } catch (error) {
          console.error('Error during session completion:', error);
          alert('Session recorded but there was an error during completion. Please check the dashboard.');
        }
      }

    } catch (error) {
      console.error('ERROR: Failed to stop recording:', error);
      alert('Error stopping recording. Please refresh the page.');
    }
  };

  const startRecording = async () => {
    // If session exists, use the existing session to start recording
    if (currentSession) {
      await startRecordingWithSetup(currentSession);
    }
  };

  const pauseRecording = () => {

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }

    if (videoRecorderRef.current && videoRecorderRef.current.getState() === 'recording') {
      videoRecorderRef.current.pauseRecording();
    }
    if (audioRecorderRef.current && audioRecorderRef.current.getState() === 'recording') {
      audioRecorderRef.current.pauseRecording();
    }

    setRecordingStatus('paused');

    if (currentSession) {
      sendRecordingStatus(currentSession.id, 'paused', Date.now());
    }
  };

  const resumeRecording = () => {
    if (videoRecorderRef.current && videoRecorderRef.current.getState() === 'paused') {
      videoRecorderRef.current.resumeRecording();
    }
    if (audioRecorderRef.current && audioRecorderRef.current.getState() === 'paused') {
      audioRecorderRef.current.resumeRecording();
    }

    setRecordingStatus('recording');

    // Resume timer
    recordingTimerRef.current = setInterval(() => {
      setRecordingTime(prev => prev + 1);
    }, 1000);

    startTranscription();

    if (currentSession) {
      sendRecordingStatus(currentSession.id, 'recording', Date.now());
    }
  };

  const insertPresetQuestion = (question) => {
    const timestamp = Date.now();
    const timestampedQuestion = `[${new Date().toLocaleTimeString()}] AGENT: ${question}`;

    setTranscriptionText(prev => {
      return prev + (prev ? '\n\n' : '') + timestampedQuestion;
    });

    if (currentSession) {
      sendTranscriptionUpdate(currentSession.id, timestampedQuestion, timestamp);
    }
  };

  const formatRecordingTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Show wizard steps if no active session
  if (!currentSession) {
    return (
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">New Recording Session</h1>
          <p className="page-subtitle">Set up your recording in 3 steps</p>
        </div>

        <StepProgressIndicator />

        {recordingStep === 1 && (
          <SessionInfoStep
            sessionFormData={sessionFormData}
            setSessionFormData={setSessionFormData}
            setRecordingStep={setRecordingStep}
          />
        )}
        {recordingStep === 2 && (
          <QuestionsStep
            sessionFormData={sessionFormData}
            setSessionFormData={setSessionFormData}
            setRecordingStep={setRecordingStep}
            addQuestion={addQuestion}
            removeQuestion={removeQuestion}
            previousSessions={previousSessions}
            loadingPrevSessions={loadingPrevSessions}
            selectedSessionId={selectedSessionId}
            setSelectedSessionId={setSelectedSessionId}
            applyQuestionsFromPrevious={applyQuestionsFromPrevious}
          />
        )}
        {recordingStep === 3 && <MediaSetupStep />}
      </div>
    );
  }

  return (
    <div className="container recording-interface">
      <div className="page-header">
        <h1 className="page-title">Recording Session</h1>
        <p className="page-subtitle">{currentSession.title}</p>
      </div>

      <div className="recording-dashboard">
        {/* Video Section */}
        <div className="video-section">
          <div className="video-container">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="video-preview"
            />
            <div className="recording-overlay">
              {recordingStatus === 'recording' && (
                <div className="recording-indicator">
                  <div className="recording-dot"></div>
                  <span>REC {formatRecordingTime(recordingTime)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Audio Visualization */}
          <div className="audio-section">
            <div className="audio-visualizer">
              <div className="visualization-row">
                <div className="waveform-container">
                  <h4>Waveform</h4>
                  <canvas
                    ref={waveformCanvasRef}
                    className="waveform-canvas"
                    style={{ width: '400px', height: '80px' }}
                  />
                </div>

                <div className="spectrum-container">
                  <h4>Frequency Spectrum</h4>
                  <canvas
                    ref={spectrumCanvasRef}
                    className="spectrum-canvas"
                    style={{ width: '400px', height: '80px' }}
                  />
                </div>
              </div>
            </div>

            <div className="audio-status">
              <span className="volume-indicator">Volume: {volumeLevel}%</span>
              {isProcessingAudio && <span className="processing-indicator">Processing Audio...</span>}
            </div>
          </div>
        </div>

        {/* Controls Section */}
        <div className="controls-section">
          <div className="recording-controls" style={{ marginBottom: '40px !important' }}>
            {recordingStatus === 'stopped' && (
              <button
                className="recording-btn record"
                onClick={startRecording}
                title="Start Recording"
              >
                Record
              </button>
            )}

            {recordingStatus === 'recording' && (
              <>
                <button
                  className="recording-btn pause"
                  onClick={pauseRecording}
                  title="Pause Recording"
                >
                  Pause
                </button>
                <button
                  className="recording-btn stop"
                  onClick={stopRecording}
                  title="Stop Recording"
                >
                  Stop
                </button>
              </>
            )}

            {recordingStatus === 'paused' && (
              <>
                <button
                  className="recording-btn resume"
                  onClick={resumeRecording}
                  title="Resume Recording"
                >
                  Resume
                </button>
                <button
                  className="recording-btn stop"
                  onClick={stopRecording}
                  title="Stop Recording"
                >
                  Stop
                </button>
              </>
            )}
          </div>

          {/* Session Info */}
          <div className="card">
            <div className="card-header">Session Information</div>
            <div className="card-body">
              <div style={{ marginBottom: '10px' }}>
                <strong>Session ID:</strong> {currentSession.id}
              </div>
              <div style={{ marginBottom: '10px' }}>
                <strong>Status:</strong> {recordingStatus}
              </div>
              <div style={{ marginBottom: '10px' }}>
                <strong>Duration:</strong> {formatRecordingTime(recordingTime)}
              </div>
              <div style={{ marginBottom: '10px' }}>
                <strong>Agent:</strong> {currentSession.agentName || user?.name}
              </div>
              {currentSession.intervieweeName && (
                <div>
                  <strong>Interviewee:</strong> {currentSession.intervieweeName}
                </div>
              )}
            </div>
          </div>

          {/* Audio and Video Status */}
          <div className="card">
            <div className="card-header">Audio Status</div>
            <div className="card-body" style={{ textAlign: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <span className={systemStatus.microphoneActive ? 'status-indicator recording' : 'status-indicator stopped'}></span>
                <span>Microphone: {systemStatus.microphoneActive ? 'Active' : 'Inactive'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className={systemStatus.visualizationRunning ? 'status-indicator recording' : 'status-indicator stopped'}></span>
                <span>Audio Analysis: {systemStatus.visualizationRunning ? 'Running' : 'Stopped'}</span>
              </div>

              {/* Audio Device Selection */}
              <div
                className="device-section"
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label className="device-label">
                    Audio Input Device:
                  </label>
                  <button
                    className="refresh-devices-btn"
                    onClick={enumerateDevices}
                    title="Refresh devices"
                  >
                    ↻
                  </button>
                </div>
                <select
                  className="device-select"
                  value={selectedDevices.audioInput}
                  onChange={(e) => handleDeviceChange('audioInput', e.target.value)}
                >
                  {availableDevices.audioInputs.map(device => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Microphone ${device.deviceId.slice(0, 8)}...`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">Video Status</div>
            <div className="card-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <span className={
                  recordingStatus === 'recording' && systemStatus.cameraActive
                    ? 'status-indicator recording'
                    : systemStatus.hasStream
                      ? 'status-indicator stopped'
                      : 'status-indicator stopped'
                }></span>
                <span>Camera: {
                  recordingStatus === 'recording' && systemStatus.cameraActive
                    ? 'Recording'
                    : systemStatus.hasStream
                      ? 'Connected'
                      : 'Inactive'
                }</span>
              </div>

              {/* Video Device Selection */}
              <div
                className="device-section"
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label className="device-label">
                    Video Input Device:
                  </label>
                  <button
                    className="refresh-devices-btn"
                    onClick={enumerateDevices}
                    title="Refresh devices"
                  >
                    ↻
                  </button>
                </div>
                <select
                  className="device-select"
                  value={selectedDevices.videoInput}
                  onChange={(e) => handleDeviceChange('videoInput', e.target.value)}
                >
                  {availableDevices.videoInputs.map(device => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Camera ${device.deviceId.slice(0, 8)}...`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Transcription Section */}
      <div className="transcription-section">
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Live Transcription</span>
            {transcriptionStatus === 'listening' && (
              <span style={{ fontSize: '12px', color: 'var(--success-color)', fontWeight: 'normal' }}>
                ● Listening
              </span>
            )}
            {transcriptionStatus === 'error' && (
              <span style={{ fontSize: '12px', color: 'var(--warning-color, #ffc107)', fontWeight: 'normal' }}>
                ⚠ {transcriptionErrorMsg || 'Speech service unavailable'}
              </span>
            )}
          </div>
          <div className="card-body">
            {transcriptionStatus === 'error' && !transcriptionText && (
              <div style={{
                padding: '12px',
                backgroundColor: 'var(--bg-tertiary)',
                borderRadius: '6px',
                marginBottom: '12px',
                fontSize: '13px',
                color: 'var(--text-secondary)'
              }}>
                <strong>Note:</strong> Real-time transcription is unavailable. Your audio is being recorded
                and will be transcribed when you click "Analyze" on the Sessions page.
              </div>
            )}
            <div className="transcription-text">
              {transcriptionText || (
                <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                  {transcriptionStatus === 'error'
                    ? 'Audio recording in progress...'
                    : 'Start speaking to see live transcription...'}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">Preset Questions</div>
          <div className="card-body">
            <div className="preset-questions">
              {/* Show custom questions if they exist, otherwise show standard questions */}
              {currentSession?.customQuestions && currentSession.customQuestions.length > 0 ? (
                <>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--primary-color)', marginBottom: '12px' }}>
                    Session Questions:
                  </div>
                  {currentSession.customQuestions.map((question, index) => (
                    <button
                      key={`custom-${index}`}
                      className="preset-question-btn custom-question"
                      onClick={() => insertPresetQuestion(question)}
                      disabled={recordingStatus !== 'recording'}
                    >
                      {question}
                    </button>
                  ))}
                </>
              ) : (
                <>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                    Standard Questions:
                  </div>
                  {preloadedQuestions.map((question, index) => (
                    <button
                      key={index}
                      className="preset-question-btn"
                      onClick={() => insertPresetQuestion(question)}
                      disabled={recordingStatus !== 'recording'}
                    >
                      {question}
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Recording; 