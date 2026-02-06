const { ipcRenderer } = require('electron');

const container = document.getElementById('container');
const scriptWrapper = document.getElementById('scriptWrapper');
const scriptText = document.getElementById('scriptText');
const statusIndicator = document.getElementById('statusIndicator');
const countdownOverlay = document.getElementById('countdownOverlay');
const countdownNumber = document.getElementById('countdownNumber');

let isPlaying = false;
let isCountingDown = false;  // Guard: true while countdown overlay is visible
let scrollSpeed = 30;
let currentPosition = 0;
let scrollAnimationId = null;
let totalScrollHeight = 0;
let countdownInterval = null;
let lastFrameTime = 0;

// Calculate total scroll distance
function calculateScrollHeight() {
  const containerHeight = container.clientHeight;
  const textHeight = scriptWrapper.scrollHeight;
  totalScrollHeight = textHeight + containerHeight;
  return totalScrollHeight;
}

// Get current reading position as a percentage (0-100)
function getCurrentPercentFromPosition() {
  const containerHeight = container.clientHeight;
  const startY = containerHeight * 0.5;
  const endY = -scriptWrapper.scrollHeight + (containerHeight * 0.5);
  const range = startY - endY;
  if (range <= 0) return 0;
  return Math.min(100, Math.max(0, ((startY - currentPosition) / range) * 100));
}

// Apply a percentage position (0-100) — converts to pixels and updates transform
function applyPercentPosition(percent) {
  calculateScrollHeight();
  const containerHeight = container.clientHeight;
  const startY = containerHeight * 0.5;
  const endY = -scriptWrapper.scrollHeight + (containerHeight * 0.5);
  const range = startY - endY;

  currentPosition = startY - (range * (percent / 100));
  scriptWrapper.style.transform = `translate3d(0, ${currentPosition}px, 0)`;
}

// Update scroll position (alias used by playback-update handler)
function updatePosition(percent) {
  calculateScrollHeight();
  applyPercentPosition(percent);
}

// Start scrolling using requestAnimationFrame for smooth, display-synced animation
function startScrolling() {
  // IMPORTANT: Stop voice follow mode first to prevent conflicts
  stopFollowMode();

  // Cancel any existing animation
  if (scrollAnimationId) {
    cancelAnimationFrame(scrollAnimationId);
    scrollAnimationId = null;
  }

  calculateScrollHeight();
  let frameCount = 0;
  lastFrameTime = performance.now();

  function scrollFrame(currentTime) {
    if (!isPlaying) {
      scrollAnimationId = null;
      return;
    }

    // Calculate delta time for consistent speed regardless of frame rate
    const deltaTime = currentTime - lastFrameTime;
    lastFrameTime = currentTime;

    // Skip if delta is too large (e.g., tab was inactive)
    if (deltaTime > 100) {
      scrollAnimationId = requestAnimationFrame(scrollFrame);
      return;
    }

    const containerHeight = container.clientHeight;
    const startY = containerHeight * 0.5;
    const endY = -scriptWrapper.scrollHeight + (containerHeight * 0.5);

    // Calculate pixels per millisecond based on speed (normalized to ~60fps baseline)
    // At speed 50: ~2.5 pixels per frame at 60fps = ~0.15 px/ms
    const pixelsPerMs = ((scrollSpeed / 100) * 4 + 0.5) / 16.67;
    const pixelsThisFrame = pixelsPerMs * deltaTime;

    currentPosition -= pixelsThisFrame;

    if (currentPosition < endY) {
      currentPosition = endY;
      isPlaying = false;
      showStatus('END');
      scrollAnimationId = null;
      return;
    }

    scriptWrapper.style.transform = `translate3d(0, ${currentPosition}px, 0)`;

    // Send position update to operator every 2 frames (~30 times per second)
    frameCount++;
    if (frameCount % 2 === 0) {
      const range = startY - endY;
      const percent = ((startY - currentPosition) / range) * 100;
      ipcRenderer.send('position-update', {
        percent: Math.min(100, Math.max(0, percent)),
        transform: currentPosition,
        containerHeight: containerHeight,
        scrollHeight: scriptWrapper.scrollHeight
      });
    }

    // Continue the animation loop
    scrollAnimationId = requestAnimationFrame(scrollFrame);
  }

  // Start the animation loop
  scrollAnimationId = requestAnimationFrame(scrollFrame);
}

// Show status briefly
function showStatus(text) {
  statusIndicator.textContent = text;
  statusIndicator.className = 'status-indicator visible ' +
    (text === 'PLAYING' ? 'playing' : 'paused');

  setTimeout(() => {
    statusIndicator.classList.remove('visible');
  }, 1500);
}

// Run countdown
function runCountdown(seconds, callback) {
  isCountingDown = true;
  let count = seconds;
  countdownNumber.textContent = count;
  countdownNumber.className = 'countdown-number';
  countdownOverlay.querySelector('.countdown-text').textContent = 'Starting in...';
  countdownOverlay.classList.add('visible');

  countdownInterval = setInterval(() => {
    count--;
    if (count > 0) {
      countdownNumber.textContent = count;
    } else if (count === 0) {
      countdownNumber.textContent = 'GO';
      countdownNumber.className = 'countdown-go';
      countdownOverlay.querySelector('.countdown-text').textContent = '';
    } else {
      clearInterval(countdownInterval);
      countdownInterval = null;
      countdownOverlay.classList.remove('visible');
      isCountingDown = false;
      if (callback) callback();
    }
  }, 1000);
}

// Cancel countdown
function cancelCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  isCountingDown = false;
  countdownOverlay.classList.remove('visible');
}

// Receive script from operator
let hasLoadedScript = false;
ipcRenderer.on('update-script', (event, data) => {
  // Capture current reading position as percentage before text changes
  const currentPercent = getCurrentPercentFromPosition();

  // Update script text with word wrapping for highlight support
  const text = data.text || 'No script loaded';
  scriptText.innerHTML = wrapTextForHighlighting(text);

  // Reapply highlight if set
  if (highlightStart !== null && highlightEnd !== null) {
    applyHighlight();
  }

  // Recalculate with new content
  calculateScrollHeight();

  // Use initial position if provided (when opening display), otherwise preserve or reset
  if (data.initialPosition !== undefined) {
    applyPercentPosition(data.initialPosition);
    hasLoadedScript = true;
  } else if (!hasLoadedScript) {
    // First load without position - start at beginning
    applyPercentPosition(0);
    hasLoadedScript = true;
  } else {
    // Script edit - preserve same percentage position
    applyPercentPosition(currentPercent);
  }
});

// Receive countdown command
ipcRenderer.on('start-countdown', (event, seconds) => {
  cancelCountdown();
  runCountdown(seconds, () => {
    isPlaying = true;
    showStatus('PLAYING');
    startScrolling();
    // Notify operator that we started
    ipcRenderer.send('countdown-complete');
  });
});

// Receive playback commands
ipcRenderer.on('playback-update', (event, state) => {
  if (state.reset) {
    cancelCountdown();
    // Cancel any running animation
    if (scrollAnimationId) {
      cancelAnimationFrame(scrollAnimationId);
      scrollAnimationId = null;
    }
    applyPercentPosition(0);
    isPlaying = false;
    showStatus('RESET');
    return;
  }

  scrollSpeed = state.speed;

  if (state.position !== undefined) {
    // Skip micro-jumps caused by float drift — only jump if position changed meaningfully
    const currentPercent = getCurrentPercentFromPosition();
    if (Math.abs(state.position - currentPercent) > 0.5) {
      updatePosition(state.position);
    }
  }

  // During countdown, accept speed/position updates but do NOT change play state.
  // The countdown callback handles starting playback when it completes.
  if (isCountingDown) return;

  if (state.isPlaying !== isPlaying) {
    isPlaying = state.isPlaying;

    if (!isPlaying) {
      cancelCountdown();
      // Cancel animation when pausing
      if (scrollAnimationId) {
        cancelAnimationFrame(scrollAnimationId);
        scrollAnimationId = null;
      }
    }

    showStatus(isPlaying ? 'PLAYING' : 'PAUSED');

    if (isPlaying) {
      startScrolling();
    }
  }
});

// Receive speed-only updates (doesn't affect playback state - safe during countdown)
ipcRenderer.on('speed-only-update', (event, data) => {
  scrollSpeed = data.speed;
});

// Receive settings from operator
ipcRenderer.on('settings-update', (event, settings) => {
  // Capture current reading position as percentage BEFORE layout changes
  const currentPercent = getCurrentPercentFromPosition();

  scriptText.style.fontSize = settings.fontSize + 'px';
  scriptText.style.color = settings.textColor;

  if (settings.fontFamily) {
    scriptText.style.fontFamily = settings.fontFamily;
  }

  document.body.style.background = settings.bgColor;

  let transform = '';
  if (settings.mirror && settings.flip) {
    transform = 'scale(-1, -1)';
  } else if (settings.mirror) {
    transform = 'scaleX(-1)';
  } else if (settings.flip) {
    transform = 'scaleY(-1)';
  }
  container.style.transform = transform;

  // Restore reading position — font/layout changes alter scrollHeight,
  // so the same pixel position maps to a different percentage. Recalculate
  // pixel position from the saved percentage to keep the same text in view.
  applyPercentPosition(currentPercent);

  // After settings change (especially font size), recalculate follow position
  if (followActive) {
    followCurrentPercent = currentPercent;
  }
});

// Continuous follow system for voice follow - smooth like a camera following a character
let followTargetPercent = 0;
let followCurrentPercent = 0;
let followActive = false;
let followAnimationFrame = null;

// How quickly to approach target (higher = faster response)
// 0.15 means move 15% of the remaining distance each frame
// At 60fps: reaches 95% of target in ~0.3sec - very responsive for instructors
const FOLLOW_SMOOTHING = 0.15;

function runFollowLoop() {
  if (!followActive) {
    followAnimationFrame = null;
    return;
  }

  const diff = followTargetPercent - followCurrentPercent;

  // If very close to target, just track it
  if (Math.abs(diff) < 0.02) {
    followCurrentPercent = followTargetPercent;
  } else {
    // Smoothly ease toward target - creates natural "following" motion
    followCurrentPercent += diff * FOLLOW_SMOOTHING;
  }

  applyPercentPosition(followCurrentPercent);

  // Keep the loop running while follow mode is active
  followAnimationFrame = requestAnimationFrame(runFollowLoop);
}

function setFollowTarget(percent) {
  followTargetPercent = percent;

  // Start follow loop if not already running
  if (!followActive) {
    // IMPORTANT: Stop traditional scroll first to prevent conflicts
    isPlaying = false;
    if (scrollAnimationId) {
      cancelAnimationFrame(scrollAnimationId);
      scrollAnimationId = null;
    }

    followActive = true;
    followCurrentPercent = getCurrentPercentFromPosition();
    runFollowLoop();
  }
}

function stopFollowMode() {
  followActive = false;
  if (followAnimationFrame) {
    cancelAnimationFrame(followAnimationFrame);
    followAnimationFrame = null;
  }
}

// Jump to specific position (for cue markers - instant jump)
ipcRenderer.on('jump-to-position', (event, percent) => {
  // Stop any voice follow animation
  stopFollowMode();
  // Direct position update for cue markers
  updatePosition(percent);
});

// Voice follow - smooth continuous position tracking from speech recognition
ipcRenderer.on('voice-follow-position', (event, percent) => {
  setFollowTarget(percent);
});

// Stop voice follow mode
ipcRenderer.on('voice-follow-stop', () => {
  stopFollowMode();
});

// Track highlight range
let highlightStart = null;
let highlightEnd = null;

// Receive highlight update from operator
ipcRenderer.on('update-highlight', (event, data) => {
  console.log('Teleprompter received highlight:', data);
  highlightStart = data.start;
  highlightEnd = data.end;

  // Ensure text is wrapped in spans (may not be if script loaded before highlight feature)
  const existingWords = scriptText.querySelectorAll('.teleprompter-word');
  console.log('Existing word spans:', existingWords.length);
  if (existingWords.length === 0 && scriptText.textContent.trim()) {
    console.log('Wrapping text for highlighting...');
    scriptText.innerHTML = wrapTextForHighlighting(scriptText.textContent);
  }

  applyHighlight();
});

// Apply highlight to teleprompter text
function applyHighlight() {
  console.log('applyHighlight called:', highlightStart, highlightEnd);
  if (highlightStart === null || highlightEnd === null) {
    // Clear highlights
    const wrapper = scriptText.querySelector('.emphasis-highlight-wrapper');
    if (wrapper) {
      while (wrapper.firstChild) {
        wrapper.parentNode.insertBefore(wrapper.firstChild, wrapper);
      }
      wrapper.remove();
    }
    scriptText.querySelectorAll('.emphasis-highlight').forEach(el => {
      el.classList.remove('emphasis-highlight');
    });
    return;
  }

  // Find words in range and highlight
  const words = scriptText.querySelectorAll('.teleprompter-word[data-char-index]');
  let firstHighlighted = null;
  let lastHighlighted = null;

  words.forEach(word => {
    word.classList.remove('emphasis-highlight');
    const charIndex = parseInt(word.dataset.charIndex);
    const wordLength = word.textContent.length;
    const wordEnd = charIndex + wordLength;

    if (charIndex < highlightEnd && wordEnd > highlightStart) {
      word.classList.add('emphasis-highlight');
      if (!firstHighlighted) firstHighlighted = word;
      lastHighlighted = word;
    }
  });

  // Wrap continuous highlight
  if (firstHighlighted && lastHighlighted && firstHighlighted !== lastHighlighted) {
    // Remove old wrapper first
    const oldWrapper = scriptText.querySelector('.emphasis-highlight-wrapper');
    if (oldWrapper) {
      while (oldWrapper.firstChild) {
        oldWrapper.parentNode.insertBefore(oldWrapper.firstChild, oldWrapper);
      }
      oldWrapper.remove();
    }

    const range = document.createRange();
    range.setStartBefore(firstHighlighted);
    range.setEndAfter(lastHighlighted);

    const wrapper = document.createElement('span');
    wrapper.className = 'emphasis-highlight-wrapper';

    try {
      range.surroundContents(wrapper);
      wrapper.querySelectorAll('.emphasis-highlight').forEach(el => {
        el.classList.remove('emphasis-highlight');
      });
    } catch (e) {
      // Fall back to individual highlights
    }
  }
}

// Wrap text in spans for highlighting (called when script updates)
function wrapTextForHighlighting(text) {
  const tokens = text.split(/(\s+)/);
  let charIndex = 0;
  let html = '';

  for (const token of tokens) {
    if (token.match(/^\s+$/)) {
      html += token;
      charIndex += token.length;
    } else if (token.trim()) {
      const escapedWord = token.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      html += `<span class="teleprompter-word" data-char-index="${charIndex}">${escapedWord}</span>`;
      charIndex += token.length;
    }
  }

  return html;
}

// Initialize — preserve reading position across resize (e.g., fullscreen transition)
window.addEventListener('resize', () => {
  const currentPercent = getCurrentPercentFromPosition();
  calculateScrollHeight();
  applyPercentPosition(currentPercent);
});

// Set initial position at top of text (0%)
// Use requestAnimationFrame to ensure layout is complete after fullscreen transition
requestAnimationFrame(() => {
  applyPercentPosition(0);
});

document.addEventListener('contextmenu', e => e.preventDefault());

// Escape key closes the display
document.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    ipcRenderer.invoke('close-teleprompter');
  }
});
