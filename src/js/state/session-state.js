/**
 * Session State Management
 * Manages multi-script session state including scripts, current script, and session ID
 */

// Multi-script session state
let scripts = [];
let currentScriptId = 'main';
let sessionId = Date.now().toString();
let nextScriptId = 1;

// View position memory - remember cursor/scroll positions when switching views
let lastMonitorClickPosition = null; // Character index clicked in monitor
let lastEditorCursorPosition = 0;    // Cursor position in editor
let lastEditorScrollTop = 0;         // Scroll position in editor

// Persistent highlight range for instructor emphasis
let persistentHighlightStart = null;
let persistentHighlightEnd = null;

/**
 * Initialize session with default script
 */
function initializeSession() {
  scripts = [{
    id: 'main',
    name: 'Untitled',
    content: '',
    cueMarkers: [],
    markers: [],
    completed: false
  }];
  currentScriptId = 'main';
  sessionId = Date.now().toString();
  nextScriptId = 1;
}

/**
 * Get current script object
 * @returns {Object|undefined} Current script or undefined if not found
 */
function getCurrentScript() {
  return scripts.find(s => s.id === currentScriptId);
}

/**
 * Get script by ID
 * @param {string} scriptId - Script ID to find
 * @returns {Object|undefined} Script or undefined if not found
 */
function getScriptById(scriptId) {
  return scripts.find(s => s.id === scriptId);
}

/**
 * Add a new script to the session
 * @param {string} name - Script name
 * @param {string} content - Script content
 * @returns {Object} The newly created script
 */
function addScript(name = 'Untitled', content = '') {
  const newScript = {
    id: `script-${nextScriptId++}`,
    name,
    content,
    cueMarkers: [],
    markers: [],
    completed: false
  };
  scripts.push(newScript);
  return newScript;
}

/**
 * Remove a script from the session
 * @param {string} scriptId - Script ID to remove
 * @returns {boolean} True if removed, false if not found
 */
function removeScript(scriptId) {
  const index = scripts.findIndex(s => s.id === scriptId);
  if (index !== -1) {
    scripts.splice(index, 1);
    return true;
  }
  return false;
}

/**
 * Update current script content
 * @param {string} content - New content
 */
function updateCurrentScriptContent(content) {
  const script = getCurrentScript();
  if (script) {
    script.content = content;
  }
}

// Getters and setters
function getScripts() { return scripts; }
function setScripts(value) { scripts = value; }

function getCurrentScriptId() { return currentScriptId; }
function setCurrentScriptId(value) { currentScriptId = value; }

function getSessionId() { return sessionId; }
function setSessionId(value) { sessionId = value; }

function getNextScriptId() { return nextScriptId; }
function setNextScriptId(value) { nextScriptId = value; }

function getLastMonitorClickPosition() { return lastMonitorClickPosition; }
function setLastMonitorClickPosition(value) { lastMonitorClickPosition = value; }

function getLastEditorCursorPosition() { return lastEditorCursorPosition; }
function setLastEditorCursorPosition(value) { lastEditorCursorPosition = value; }

function getLastEditorScrollTop() { return lastEditorScrollTop; }
function setLastEditorScrollTop(value) { lastEditorScrollTop = value; }

function getPersistentHighlightStart() { return persistentHighlightStart; }
function setPersistentHighlightStart(value) { persistentHighlightStart = value; }

function getPersistentHighlightEnd() { return persistentHighlightEnd; }
function setPersistentHighlightEnd(value) { persistentHighlightEnd = value; }

module.exports = {
  // Initialization
  initializeSession,

  // Script operations
  getCurrentScript,
  getScriptById,
  addScript,
  removeScript,
  updateCurrentScriptContent,

  // State getters/setters
  getScripts,
  setScripts,
  getCurrentScriptId,
  setCurrentScriptId,
  getSessionId,
  setSessionId,
  getNextScriptId,
  setNextScriptId,

  // View memory
  getLastMonitorClickPosition,
  setLastMonitorClickPosition,
  getLastEditorCursorPosition,
  setLastEditorCursorPosition,
  getLastEditorScrollTop,
  setLastEditorScrollTop,

  // Highlight state
  getPersistentHighlightStart,
  setPersistentHighlightStart,
  getPersistentHighlightEnd,
  setPersistentHighlightEnd
};
