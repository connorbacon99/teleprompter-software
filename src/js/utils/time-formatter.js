/**
 * Time Formatting Utilities
 * Formats milliseconds to human-readable time strings
 */

/**
 * Format milliseconds to HH:MM:SS format
 * @param {number} ms - Milliseconds to format
 * @returns {string} Formatted time string (e.g., "01:23:45")
 */
function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format milliseconds to MM:SS format (short form)
 * @param {number} ms - Milliseconds to format
 * @returns {string} Formatted time string (e.g., "23:45")
 */
function formatTimeShort(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

module.exports = {
  formatTime,
  formatTimeShort
};
