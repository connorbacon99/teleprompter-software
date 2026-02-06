/**
 * Recording State Management
 * Manages recording session state including timers, markers, and auto-save
 */

// Recording state
let isRecording = false;
let sessionStartTime = null;
let scriptStartTime = null;
let timerInterval = null;
let recordingCountdownInterval = null;

// Problem markers
let problemMarkers = [];

// Auto-save state
let autoSaveInterval = null;
let autoSaveQueue = [];

/**
 * Start a recording session
 */
function startRecording() {
  isRecording = true;
  if (!sessionStartTime) {
    sessionStartTime = Date.now();
  }
  scriptStartTime = Date.now();
}

/**
 * Stop the recording session
 */
function stopRecording() {
  isRecording = false;
  scriptStartTime = null;
}

/**
 * Reset the entire session
 */
function resetSession() {
  isRecording = false;
  sessionStartTime = null;
  scriptStartTime = null;
  problemMarkers = [];
}

/**
 * Add a problem marker
 * @param {string} type - Marker type ('retake', 'stumble', 'note')
 * @param {string} text - Marker text/note
 * @param {number} sessionTime - Time since session start
 * @param {string} scriptId - Associated script ID
 * @returns {Object} The created marker
 */
function addProblemMarker(type, text, sessionTime, scriptId) {
  const marker = {
    id: Date.now().toString() + Math.random(),
    type,
    text,
    sessionTime,
    scriptId,
    timestamp: Date.now()
  };
  problemMarkers.push(marker);
  return marker;
}

/**
 * Remove a problem marker by ID
 * @param {string} markerId - Marker ID to remove
 * @returns {boolean} True if removed, false if not found
 */
function removeProblemMarker(markerId) {
  const index = problemMarkers.findIndex(m => m.id === markerId);
  if (index !== -1) {
    problemMarkers.splice(index, 1);
    return true;
  }
  return false;
}

/**
 * Get markers sorted by session time
 * @returns {Array} Sorted markers
 */
function getSortedMarkers() {
  return [...problemMarkers].sort((a, b) => a.sessionTime - b.sessionTime);
}

/**
 * Clear all problem markers
 */
function clearProblemMarkers() {
  problemMarkers = [];
}

/**
 * Get elapsed session time
 * @returns {number} Milliseconds since session start, or 0 if not started
 */
function getElapsedSessionTime() {
  return sessionStartTime ? Date.now() - sessionStartTime : 0;
}

/**
 * Get elapsed script time
 * @returns {number} Milliseconds since script start, or 0 if not started
 */
function getElapsedScriptTime() {
  return scriptStartTime ? Date.now() - scriptStartTime : 0;
}

// Getters and setters
function getIsRecording() { return isRecording; }
function setIsRecording(value) { isRecording = value; }

function getSessionStartTime() { return sessionStartTime; }
function setSessionStartTime(value) { sessionStartTime = value; }

function getScriptStartTime() { return scriptStartTime; }
function setScriptStartTime(value) { scriptStartTime = value; }

function getTimerInterval() { return timerInterval; }
function setTimerInterval(value) { timerInterval = value; }

function getRecordingCountdownInterval() { return recordingCountdownInterval; }
function setRecordingCountdownInterval(value) { recordingCountdownInterval = value; }

function getProblemMarkers() { return problemMarkers; }
function setProblemMarkers(value) { problemMarkers = value; }

function getAutoSaveInterval() { return autoSaveInterval; }
function setAutoSaveInterval(value) { autoSaveInterval = value; }

function getAutoSaveQueue() { return autoSaveQueue; }
function setAutoSaveQueue(value) { autoSaveQueue = value; }

module.exports = {
  // Recording control
  startRecording,
  stopRecording,
  resetSession,

  // Marker management
  addProblemMarker,
  removeProblemMarker,
  getSortedMarkers,
  clearProblemMarkers,

  // Time calculations
  getElapsedSessionTime,
  getElapsedScriptTime,

  // State getters/setters
  getIsRecording,
  setIsRecording,
  getSessionStartTime,
  setSessionStartTime,
  getScriptStartTime,
  setScriptStartTime,
  getTimerInterval,
  setTimerInterval,
  getRecordingCountdownInterval,
  setRecordingCountdownInterval,
  getProblemMarkers,
  setProblemMarkers,
  getAutoSaveInterval,
  setAutoSaveInterval,
  getAutoSaveQueue,
  setAutoSaveQueue
};
