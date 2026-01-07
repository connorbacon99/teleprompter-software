# Recording Countdown Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a countdown before recording starts and decouple Play/Recording functions.

**Architecture:** Modify operator.js to add recording countdown overlay, update HTML with new modal and settings, and remove auto-start recording from play button while keeping marker logic when recording is active.

**Tech Stack:** Vanilla JavaScript, Electron IPC, CSS animations

---

## Task 1: Add Recording Countdown Settings to HTML

**Files:**
- Modify: `src/operator.html:289-303`

**Step 1: Rename existing countdown and add recording countdown settings**

Find this section (lines 289-303):
```html
<!-- Playback Section -->
<div class="setup-section">
  <div class="setup-section-label">Playback</div>
  <div class="setup-toggle-row">
    <span class="setup-option-label">Countdown</span>
    <label class="setup-toggle">
      <input type="checkbox" id="countdownCheckbox" checked>
      <span class="setup-toggle-track"></span>
    </label>
  </div>
  <div class="setup-option-row" id="countdownRow">
    <span class="setup-option-label">Seconds</span>
    <input type="number" class="setup-number" id="countdownSeconds" value="3" min="1" max="10">
  </div>
</div>
```

Replace with:
```html
<!-- Playback Section -->
<div class="setup-section">
  <div class="setup-section-label">Playback</div>
  <div class="setup-toggle-row">
    <span class="setup-option-label">Teleprompter Countdown</span>
    <label class="setup-toggle">
      <input type="checkbox" id="countdownCheckbox" checked>
      <span class="setup-toggle-track"></span>
    </label>
  </div>
  <div class="setup-option-row" id="countdownRow">
    <span class="setup-option-label">Seconds</span>
    <input type="number" class="setup-number" id="countdownSeconds" value="3" min="1" max="10">
  </div>
  <div class="setup-toggle-row">
    <span class="setup-option-label">Recording Countdown</span>
    <label class="setup-toggle">
      <input type="checkbox" id="recordingCountdownCheckbox" checked>
      <span class="setup-toggle-track"></span>
    </label>
  </div>
  <div class="setup-option-row" id="recordingCountdownRow">
    <span class="setup-option-label">Seconds</span>
    <input type="number" class="setup-number" id="recordingCountdownSeconds" value="5" min="1" max="30">
  </div>
</div>
```

**Step 2: Commit**

```bash
git add src/operator.html
git commit -m "feat: add recording countdown settings to playback section"
```

---

## Task 2: Add Recording Countdown Overlay to HTML

**Files:**
- Modify: `src/operator.html` (after line 506, before `<!-- Timeline Saved Toast -->`)

**Step 1: Add recording countdown overlay HTML**

Add after the autosave-indicator div (line 507):
```html
<!-- Recording Countdown Overlay -->
<div class="recording-countdown-overlay" id="recordingCountdownOverlay">
  <div class="recording-countdown-number" id="recordingCountdownNumber">5</div>
  <div class="recording-countdown-text" id="recordingCountdownText">Recording starts in...</div>
</div>
```

**Step 2: Commit**

```bash
git add src/operator.html
git commit -m "feat: add recording countdown overlay HTML"
```

---

## Task 3: Add No Recording Warning Modal to HTML

**Files:**
- Modify: `src/operator.html` (after stopRecordingModal, around line 499)

**Step 1: Add warning modal HTML**

Add after the stopRecordingModal closing div:
```html
<!-- No Recording Warning Modal -->
<div class="modal-overlay" id="noRecordingModal">
  <div class="modal">
    <h3>No Active Recording</h3>
    <p style="color: var(--text-secondary); font-size: 13px; margin: 12px 0 16px 0;">
      You're about to start the teleprompter without recording. Timestamps won't be tracked.
    </p>
    <div class="modal-buttons" style="flex-direction: column; gap: 8px;">
      <button class="btn success" id="noRecordingStartRecordingBtn" style="width: 100%;">Start Recording First</button>
      <div style="display: flex; gap: 8px; width: 100%;">
        <button class="btn" id="noRecordingCancelBtn" style="flex: 1;">Cancel</button>
        <button class="btn primary" id="noRecordingContinueBtn" style="flex: 1;">Continue Anyway</button>
      </div>
    </div>
  </div>
</div>
```

**Step 2: Commit**

```bash
git add src/operator.html
git commit -m "feat: add no-recording warning modal HTML"
```

---

## Task 4: Add Recording Countdown Overlay Styles

**Files:**
- Modify: `src/css/operator-modern.css` (add at end of file)

**Step 1: Add CSS for recording countdown overlay**

Add to end of file:
```css
/* Recording Countdown Overlay */
.recording-countdown-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease;
}

.recording-countdown-overlay.visible {
  opacity: 1;
  pointer-events: auto;
}

.recording-countdown-number {
  font-size: 220px;
  font-weight: 700;
  color: #ef4444;
  line-height: 1;
  animation: recordingCountdownPulse 1s ease-in-out infinite;
}

.recording-countdown-number.recording {
  color: #22c55e;
  animation: recordingGoAnimation 0.5s ease-out forwards;
}

.recording-countdown-text {
  font-size: 28px;
  color: #a1a1aa;
  margin-top: 24px;
  text-transform: uppercase;
  letter-spacing: 4px;
}

.recording-countdown-text.recording {
  color: #22c55e;
}

@keyframes recordingCountdownPulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.05); opacity: 0.8; }
}

@keyframes recordingGoAnimation {
  0% { transform: scale(0.5); opacity: 0; }
  50% { transform: scale(1.1); }
  100% { transform: scale(1); opacity: 1; }
}
```

**Step 2: Commit**

```bash
git add src/css/operator-modern.css
git commit -m "feat: add recording countdown overlay styles"
```

---

## Task 5: Add Recording Countdown JavaScript Variables

**Files:**
- Modify: `src/js/operator.js:22-24` (after countdownRow declaration)

**Step 1: Add element references**

Find these lines (around line 22-24):
```javascript
const countdownCheckbox = document.getElementById('countdownCheckbox');
const countdownSeconds = document.getElementById('countdownSeconds');
const countdownRow = document.getElementById('countdownRow');
```

Add after them:
```javascript
const recordingCountdownCheckbox = document.getElementById('recordingCountdownCheckbox');
const recordingCountdownSeconds = document.getElementById('recordingCountdownSeconds');
const recordingCountdownRow = document.getElementById('recordingCountdownRow');
const recordingCountdownOverlay = document.getElementById('recordingCountdownOverlay');
const recordingCountdownNumber = document.getElementById('recordingCountdownNumber');
const recordingCountdownText = document.getElementById('recordingCountdownText');
const noRecordingModal = document.getElementById('noRecordingModal');
```

**Step 2: Add state variable for countdown interval**

Find (around line 107):
```javascript
let timerInterval = null;
```

Add after:
```javascript
let recordingCountdownInterval = null;
```

**Step 3: Commit**

```bash
git add src/js/operator.js
git commit -m "feat: add recording countdown element references and state"
```

---

## Task 6: Implement Recording Countdown Function

**Files:**
- Modify: `src/js/operator.js` (after stopRecording function, around line 701)

**Step 1: Add recording countdown functions**

Add after the stopRecording function:
```javascript
// Recording countdown functions
function runRecordingCountdown(seconds, callback) {
  let count = seconds;
  recordingCountdownNumber.textContent = count;
  recordingCountdownNumber.className = 'recording-countdown-number';
  recordingCountdownText.textContent = 'Recording starts in...';
  recordingCountdownText.className = 'recording-countdown-text';
  recordingCountdownOverlay.classList.add('visible');

  recordingCountdownInterval = setInterval(() => {
    count--;
    if (count > 0) {
      recordingCountdownNumber.textContent = count;
    } else if (count === 0) {
      recordingCountdownNumber.textContent = 'REC';
      recordingCountdownNumber.className = 'recording-countdown-number recording';
      recordingCountdownText.textContent = 'RECORDING';
      recordingCountdownText.className = 'recording-countdown-text recording';
    } else {
      clearInterval(recordingCountdownInterval);
      recordingCountdownInterval = null;
      recordingCountdownOverlay.classList.remove('visible');
      if (callback) callback();
    }
  }, 1000);
}

function cancelRecordingCountdown() {
  if (recordingCountdownInterval) {
    clearInterval(recordingCountdownInterval);
    recordingCountdownInterval = null;
  }
  recordingCountdownOverlay.classList.remove('visible');
}

function startRecordingWithCountdown() {
  if (isRecording) {
    console.log('Recording already active');
    return;
  }

  if (recordingCountdownCheckbox.checked) {
    const seconds = parseInt(recordingCountdownSeconds.value);
    runRecordingCountdown(seconds, () => {
      actuallyStartRecording();
    });
  } else {
    actuallyStartRecording();
  }
}

function actuallyStartRecording() {
  console.log('🔴 Starting recording session...');
  isRecording = true;
  sessionStartTime = Date.now();
  scriptStartTime = Date.now();

  // Update button UI
  toggleRecordingBtn.innerHTML = `
    <svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12"/></svg>
    Stop Recording
  `;
  toggleRecordingBtn.classList.remove('success');
  toggleRecordingBtn.classList.add('danger');

  // Show recording pane
  headerRecordingTimer.style.display = 'flex';
  showRecordingPane();

  console.log('Recording UI elements shown');

  // Start timer
  timerInterval = setInterval(updateTimers, 1000);
  updateTimers();
  updateRecordingTimeline();
  console.log('Recording started - Session ID:', sessionId);
}
```

**Step 2: Commit**

```bash
git add src/js/operator.js
git commit -m "feat: implement recording countdown logic"
```

---

## Task 7: Update startRecording to Use Countdown

**Files:**
- Modify: `src/js/operator.js:638-668`

**Step 1: Replace startRecording function**

Find the existing startRecording function (lines 638-668):
```javascript
function startRecording() {
  if (isRecording) {
    console.log('Recording already active');
    return;
  }

  console.log('🔴 Starting recording session...');
  // ... rest of function
}
```

Replace with:
```javascript
function startRecording() {
  startRecordingWithCountdown();
}
```

**Step 2: Commit**

```bash
git add src/js/operator.js
git commit -m "refactor: startRecording now uses countdown wrapper"
```

---

## Task 8: Remove Auto-Start Recording from Play Button

**Files:**
- Modify: `src/js/operator.js:1719-1792`

**Step 1: Modify play button handler to show warning modal**

Find the headerPlayPauseBtn click handler (line 1719) and replace the entire handler with:
```javascript
headerPlayPauseBtn.addEventListener('click', async () => {
  console.log('🎮 Play button clicked. Current state:', {
    isPlaying,
    isRecording,
    countdownEnabled: countdownCheckbox.checked
  });

  // If not recording and trying to start playback, show warning
  if (!isPlaying && !isRecording) {
    noRecordingModal.classList.add('visible');
    return;
  }

  await handlePlayToggle();
});

async function handlePlayToggle() {
  // When starting playback, auto-switch to monitor view and open display
  if (!isPlaying) {
    console.log('📺 Opening monitor view and display');
    // Switch to monitor view
    viewMonitorBtn.classList.add('active');
    viewEditorBtn.classList.remove('active');
    monitorView.classList.add('active');
    editorView.classList.remove('active');
    updateMonitorScale();

    // Open display only if not already open
    const isOpen = await ipcRenderer.invoke('is-teleprompter-open');
    if (!isOpen) {
      const displayId = displaySelect.value ? parseInt(displaySelect.value) : null;
      currentDisplayId = await ipcRenderer.invoke('open-teleprompter', displayId);
      // Wait for teleprompter window to be ready before sending script with position
      setTimeout(() => {
        sendScript(true);
        sendSettings();
      }, 500);
    }
  }

  if (!isPlaying && countdownCheckbox.checked) {
    console.log('⏱️ Starting with countdown enabled');
    // Send current position to teleprompter BEFORE countdown starts
    sendPlaybackState(true);
    // Start countdown on both teleprompter and monitor preview
    const seconds = parseInt(countdownSeconds.value);
    ipcRenderer.send('start-countdown', seconds);
    runMonitorCountdown(seconds);
    isPlaying = true;
    updatePlayButton();
    // Add automatic "Playback Started" marker if recording
    if (isRecording) {
      console.log('🎬 Adding auto playback started marker (countdown starting)');
      addProblemMarker('playback-started', '▶️ Playback Started');
    }
  } else {
    console.log('🔄 Toggling play state. Was playing:', isPlaying);
    isPlaying = !isPlaying;
    console.log('🔄 Now playing:', isPlaying);
    if (!isPlaying) {
      console.log('⏸️ Paused - adding playback stopped marker');
      cancelMonitorCountdown();
      // Add automatic "Playback Stopped" marker for video editing
      if (isRecording) {
        addProblemMarker('playback-stopped', '⏸️ Playback Stopped');
      }
      // Send pause without position - teleprompter stops where it is
      sendPlaybackState(false);
    } else {
      console.log('▶️ Started playing');
      // Add automatic "Playback Started" marker if recording
      if (isRecording) {
        console.log('🎬 Adding auto playback started marker');
        addProblemMarker('playback-started', '▶️ Playback Started');
      }
      // Include position when starting so playback continues from current spot
      sendPlaybackState(true);
    }
    updatePlayButton();
  }
}
```

**Step 2: Commit**

```bash
git add src/js/operator.js
git commit -m "feat: decouple play/recording, add no-recording warning"
```

---

## Task 9: Add Modal Event Handlers

**Files:**
- Modify: `src/js/operator.js` (after the modal button handlers section, around line 870)

**Step 1: Add no-recording modal handlers**

Find the toggleRecordingBtn click handler and add after it:
```javascript
// No Recording Warning Modal handlers
document.getElementById('noRecordingCancelBtn').addEventListener('click', () => {
  noRecordingModal.classList.remove('visible');
});

document.getElementById('noRecordingContinueBtn').addEventListener('click', async () => {
  noRecordingModal.classList.remove('visible');
  await handlePlayToggle();
});

document.getElementById('noRecordingStartRecordingBtn').addEventListener('click', () => {
  noRecordingModal.classList.remove('visible');
  startRecordingWithCountdown();
});
```

**Step 2: Commit**

```bash
git add src/js/operator.js
git commit -m "feat: add no-recording modal event handlers"
```

---

## Task 10: Add Recording Countdown Settings Toggle Visibility

**Files:**
- Modify: `src/js/operator.js` (near line 2001-2006 where existing countdown toggle is)

**Step 1: Add toggle handler for recording countdown**

Find this section:
```javascript
// Toggle countdown seconds visibility based on checkbox
countdownCheckbox.addEventListener('change', () => {
  countdownRow.style.display = countdownCheckbox.checked ? 'flex' : 'none';
});
// Initialize countdown row visibility
countdownRow.style.display = countdownCheckbox.checked ? 'flex' : 'none';
```

Add after it:
```javascript
// Toggle recording countdown seconds visibility based on checkbox
recordingCountdownCheckbox.addEventListener('change', () => {
  recordingCountdownRow.style.display = recordingCountdownCheckbox.checked ? 'flex' : 'none';
});
// Initialize recording countdown row visibility
recordingCountdownRow.style.display = recordingCountdownCheckbox.checked ? 'flex' : 'none';
```

**Step 2: Commit**

```bash
git add src/js/operator.js
git commit -m "feat: add recording countdown settings toggle"
```

---

## Task 11: Update Project Save/Load for New Settings

**Files:**
- Modify: `src/js/operator.js:1617-1625` (save) and `src/js/operator.js:1656-1662` (load)

**Step 1: Update save to include recording countdown settings**

Find the save section (around line 1617):
```javascript
settings: {
  // ... existing settings
  countdownEnabled: countdownCheckbox.checked,
  countdownSeconds: parseInt(countdownSeconds.value)
}
```

Add the new settings:
```javascript
settings: {
  // ... existing settings
  countdownEnabled: countdownCheckbox.checked,
  countdownSeconds: parseInt(countdownSeconds.value),
  recordingCountdownEnabled: recordingCountdownCheckbox.checked,
  recordingCountdownSeconds: parseInt(recordingCountdownSeconds.value)
}
```

**Step 2: Update load to restore recording countdown settings**

Find the load section (around line 1656):
```javascript
countdownCheckbox.checked = data.settings.countdownEnabled !== false;
countdownSeconds.value = data.settings.countdownSeconds || 3;
```

Add after:
```javascript
recordingCountdownCheckbox.checked = data.settings.recordingCountdownEnabled !== false;
recordingCountdownSeconds.value = data.settings.recordingCountdownSeconds || 5;
recordingCountdownRow.style.display = recordingCountdownCheckbox.checked ? 'flex' : 'none';
```

**Step 3: Commit**

```bash
git add src/js/operator.js
git commit -m "feat: persist recording countdown settings in project files"
```

---

## Task 12: Update main.js Default State

**Files:**
- Modify: `src/main.js:33-37`

**Step 1: Add recording countdown to default state**

Find:
```javascript
settings: {
  mirror: false,
  flip: false,
  countdownEnabled: true,
  countdownSeconds: 3
}
```

Replace with:
```javascript
settings: {
  mirror: false,
  flip: false,
  countdownEnabled: true,
  countdownSeconds: 3,
  recordingCountdownEnabled: true,
  recordingCountdownSeconds: 5
}
```

**Step 2: Commit**

```bash
git add src/main.js
git commit -m "feat: add recording countdown to default state"
```

---

## Task 13: Manual Testing

**Step 1: Test recording countdown**
- Open app
- Click "Start Recording"
- Verify countdown overlay appears (5, 4, 3, 2, 1, REC)
- Verify overlay is large and visible
- Verify red during countdown, green on REC
- Verify timer starts after countdown

**Step 2: Test play without recording**
- Without recording active, click "Play Teleprompter"
- Verify warning modal appears
- Test "Cancel" - modal closes, nothing happens
- Test "Continue Anyway" - modal closes, teleprompter plays
- Test "Start Recording First" - modal closes, recording countdown starts

**Step 3: Test play with recording**
- Start recording first
- Click "Play Teleprompter"
- Verify no warning modal
- Verify "Playback Started" marker added
- Pause teleprompter
- Verify "Playback Stopped" marker added

**Step 4: Test settings**
- Toggle Recording Countdown off
- Click Start Recording - should start immediately
- Adjust seconds value and verify countdown uses new value
- Save project, reload, verify settings persist

**Step 5: Commit final version bump**

```bash
git add -A
git commit -m "v1.3.5: Add recording countdown and decouple play/recording

- Recording countdown with adjustable delay (default 5s)
- Large overlay visible from 10 feet (red countdown, green REC)
- Warning modal when playing without active recording
- Playback markers only added when recording is active
- Renamed settings: Teleprompter Countdown / Recording Countdown"
```

---

## Summary

Total tasks: 13
Files modified:
- `src/operator.html` - 3 changes (settings, overlay, modal)
- `src/css/operator-modern.css` - 1 change (overlay styles)
- `src/js/operator.js` - 7 changes (variables, functions, handlers)
- `src/main.js` - 1 change (default state)
