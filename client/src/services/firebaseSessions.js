/**
 * @file firebaseSessions.js
 * @description Firebase service for session CRUD operations and file storage management.
 * 
 * @module services/firebaseSessions
 * @requires firebase/firestore - Firestore database operations
 * @requires firebase/storage - Firebase Storage for media files
 * @requires ../firebase - Firebase app instances
 * 
 * @connections
 * - Used by: Dashboard, Sessions, Recording, Replay, Upload pages
 * - Uses: firebase.js for db, storage, and auth instances
 * 
 * @summary
 * Core session management service providing:
 * - createSession: Create new session document
 * - listSessions: Query sessions with optional user filtering
 * - getSession: Retrieve single session by ID
 * - deleteSessionDoc: Permanently delete session and associated files
 * - startSession/stopSession: Update session recording status
 * - uploadSessionFile: Upload video/audio/transcription to Storage
 * - uploadTranscriptionText: Store transcription in both Storage and Firestore
 * 
 * All operations use Firebase Auth for user context.
 */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, listAll, ref, uploadBytesResumable } from 'firebase/storage';
import { auth, db, storage } from '../firebase';

// Reference to sessions collection
const sessionsCol = collection(db, 'sessions');

export async function createSession(session) {
  const user = auth.currentUser;
  const payload = {
    ...session,
    agentId: user?.uid || session.agentId || null,
    createdAt: serverTimestamp(),
    status: 'created',
    files: {
      videoUrl: null,
      audioUrl: null,
      transcriptionUrl: null,
    },
  };
  const docRef = await addDoc(sessionsCol, payload);
  const snapshot = await getDoc(docRef);
  return { id: docRef.id, ...snapshot.data() };
}

export async function listSessions({ ownOnly = true } = {}) {
  const user = auth.currentUser;

  let q = query(sessionsCol, orderBy('createdAt', 'desc'));

  if (ownOnly && user?.uid) {
    q = query(sessionsCol, where('agentId', '==', user.uid), orderBy('createdAt', 'desc'));
  } else if (ownOnly) {
  } else {
  }

  const snap = await getDocs(q);

  // Filter out any sessions that have been soft-deleted
  const sessions = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter(session => !session.deletedAt);

  return sessions;
}

export async function getSession(sessionId) {
  const snapshot = await getDoc(doc(db, 'sessions', sessionId));
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() };
}

export async function deleteSessionDoc(sessionId) {
  try {

    // First, get the session data to find file URLs
    const sessionDoc = await getDoc(doc(db, 'sessions', sessionId));
    if (!sessionDoc.exists()) {
      throw new Error('Session not found');
    }

    const sessionData = sessionDoc.data();

    // Delete all files from Firebase Storage
    const filesToDelete = [];

    // Add video file
    if (sessionData.files?.videoUrl) {
      filesToDelete.push('video.webm');
      filesToDelete.push('video.mp4');
    }

    // Add audio file
    if (sessionData.files?.audioUrl) {
      filesToDelete.push('audio.webm');
      filesToDelete.push('audio.wav');
    }

    // Add transcription file
    if (sessionData.files?.transcriptionUrl) {
      filesToDelete.push('transcription.txt');
    }

    // Delete all files from storage
    const sessionStorageRef = ref(storage, `sessions/${sessionId}`);
    try {
      const fileList = await listAll(sessionStorageRef);
      const deletePromises = fileList.items.map(fileRef => deleteObject(fileRef));
      await Promise.all(deletePromises);
    } catch (storageError) {
    }

    // Permanently delete the Firestore document
    await deleteDoc(doc(db, 'sessions', sessionId));

    return true;
  } catch (error) {
    console.error('Error during permanent session deletion:', error);
    throw error;
  }
}

export async function startSession(sessionId) {
  await updateDoc(doc(db, 'sessions', sessionId), {
    status: 'recording',
    startTime: serverTimestamp(),
  });
}

export async function stopSession(sessionId, durationMs = 0) {
  await updateDoc(doc(db, 'sessions', sessionId), {
    status: 'completed',
    endTime: serverTimestamp(),
    duration: durationMs,
  });
}

export async function uploadSessionFile(sessionId, kind, blobOrFile, onProgress) {
  // kind: 'video' | 'audio' | 'transcription'
  // Use the actual file extension based on the blob type
  let ext;
  if (kind === 'video') {
    ext = 'webm';
  } else if (kind === 'audio') {
    // Check if the blob is actually a WebM file
    if (blobOrFile.type.includes('webm')) {
      ext = 'webm';
    } else {
      ext = 'wav';
    }
  } else {
    ext = 'txt';
  }
  const storageRef = ref(storage, `sessions/${sessionId}/${kind}.${ext}`);
  const task = uploadBytesResumable(storageRef, blobOrFile);
  return new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      (snapshot) => {
        if (onProgress) {
          const pct = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          onProgress(Math.round(pct));
        }
      },
      reject,
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        const field = kind === 'video' ? 'files.videoUrl' : kind === 'audio' ? 'files.audioUrl' : 'files.transcriptionUrl';
        await updateDoc(doc(db, 'sessions', sessionId), { [field]: url });
        resolve(url);
      }
    );
  });
}

export async function uploadTranscriptionText(sessionId, text) {

  const file = new Blob([text || ''], { type: 'text/plain' });

  // Upload the file to storage
  const fileUploadPromise = uploadSessionFile(sessionId, 'transcription', file);

  // Also store the transcription text directly in Firestore for NLP analysis
  const textUpdatePromise = updateDoc(doc(db, 'sessions', sessionId), {
    transcription: text || '',
    statistics: {
      wordCount: text ? text.split(' ').length : 0,
      // Add more statistics if needed
    }
  });

  // Wait for both operations to complete
  await Promise.all([fileUploadPromise, textUpdatePromise]);

  return fileUploadPromise;
}

