/**
 * Application Constants
 * Centralized configuration values used throughout the application
 */

// ============================================
// ANIMATION CONSTANTS
// ============================================

/**
 * Easing factor for smooth position transitions
 * Lower value = smoother/slower, higher value = snappier/faster
 * Range: 0.0 - 1.0
 */
const EASE_FACTOR = 0.35;

/**
 * Position snap threshold as a percentage
 * When position difference is below this, snap to target immediately
 * Prevents endless micro-adjustments
 */
const SNAP_THRESHOLD = 0.005; // 0.5%

// ============================================
// AUTO-SAVE CONFIGURATION
// ============================================

/**
 * Auto-save interval in milliseconds
 * How often to automatically save session state
 */
const AUTOSAVE_INTERVAL = 30000; // 30 seconds

/**
 * Maximum number of auto-save files to keep
 * Older saves are deleted when this limit is exceeded
 */
const MAX_AUTOSAVES = 5;

module.exports = {
  EASE_FACTOR,
  SNAP_THRESHOLD,
  AUTOSAVE_INTERVAL,
  MAX_AUTOSAVES
};
