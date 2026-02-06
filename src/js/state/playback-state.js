/**
 * Playback State Management
 * Manages teleprompter playback state including position, animation, and authority
 */

const { EASE_FACTOR, SNAP_THRESHOLD } = require('../utils/constants');

// Playback state
let isPlaying = false;
let currentDisplayId = null;

// Position state (unified for smooth animations)
let targetPosition = 0;          // Where we want to be (0-100%)
let displayPosition = 0;         // Where we currently show (eased toward target)
let animFrameId = null;          // Single rAF id for the unified loop
let operatorAuthorityUntil = 0;  // timestamp — operator controls position until this time
let positionDirty = false;       // true when user explicitly changed position — cleared after send

// UI update callback - set by consumer
let positionUIUpdateCallback = null;

/**
 * Unified animation loop - handles both playback interpolation and wheel scroll easing
 */
function animationTick() {
  const diff = targetPosition - displayPosition;
  if (Math.abs(diff) < SNAP_THRESHOLD) {
    displayPosition = targetPosition;
    animFrameId = null;           // Stop — will restart on next position change
  } else {
    displayPosition += diff * EASE_FACTOR;
    animFrameId = requestAnimationFrame(animationTick);
  }

  if (positionUIUpdateCallback) {
    positionUIUpdateCallback(displayPosition);
  }
}

/**
 * Ensure animation loop is running
 */
function ensureAnimationRunning() {
  if (!animFrameId) {
    animFrameId = requestAnimationFrame(animationTick);
  }
}

/**
 * Stop animation loop
 */
function stopAnimation() {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
}

/**
 * Claim operator authority over position for a duration
 * @param {number} durationMs - Duration in milliseconds
 */
function claimOperatorAuthority(durationMs = 300) {
  operatorAuthorityUntil = Date.now() + durationMs;
}

/**
 * Check if operator has authority over position
 * @returns {boolean}
 */
function isOperatorAuthority() {
  return Date.now() < operatorAuthorityUntil;
}

/**
 * Set the UI update callback
 * @param {Function} callback - Function to call when position updates
 */
function setPositionUIUpdateCallback(callback) {
  positionUIUpdateCallback = callback;
}

// Getters and setters
function getIsPlaying() { return isPlaying; }
function setIsPlaying(value) { isPlaying = value; }

function getCurrentDisplayId() { return currentDisplayId; }
function setCurrentDisplayId(value) { currentDisplayId = value; }

function getTargetPosition() { return targetPosition; }
function setTargetPosition(value) {
  targetPosition = value;
  ensureAnimationRunning();
}

function getDisplayPosition() { return displayPosition; }
function setDisplayPosition(value) { displayPosition = value; }

function getPositionDirty() { return positionDirty; }
function setPositionDirty(value) { positionDirty = value; }

module.exports = {
  // State getters/setters
  getIsPlaying,
  setIsPlaying,
  getCurrentDisplayId,
  setCurrentDisplayId,
  getTargetPosition,
  setTargetPosition,
  getDisplayPosition,
  setDisplayPosition,
  getPositionDirty,
  setPositionDirty,

  // Animation functions
  animationTick,
  ensureAnimationRunning,
  stopAnimation,

  // Authority functions
  claimOperatorAuthority,
  isOperatorAuthority,

  // UI callback
  setPositionUIUpdateCallback
};
