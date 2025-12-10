/**
 * Umbrellaprompter - Operator Window JavaScript
 * Sections: State, Monitor, Script, Playback, Settings, Cue Markers, Mobile, Updates, Voice Follow
 */

    const { ipcRenderer } = require('electron');

    // Elements
    const scriptText = document.getElementById('scriptText');
    const fileName = document.getElementById('fileName');
    const charCount = document.getElementById('charCount');
    const displaySelect = document.getElementById('displaySelect');
    const speedSlider = document.getElementById('speedSlider');
    const speedValue = document.getElementById('speedValue');
    const positionSlider = document.getElementById('positionSlider');
    const fontFamilySelect = document.getElementById('fontFamilySelect');
    const fontSizeInput = document.getElementById('fontSizeInput');
    const textColorInput = document.getElementById('textColorInput');
    const bgColorInput = document.getElementById('bgColorInput');
    const mirrorCheckbox = document.getElementById('mirrorCheckbox');
    const flipCheckbox = document.getElementById('flipCheckbox');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const playIcon = document.getElementById('playIcon');
    const playTextEl = document.getElementById('playText');
    const countdownCheckbox = document.getElementById('countdownCheckbox');
    const countdownSeconds = document.getElementById('countdownSeconds');
    const cueList = document.getElementById('cueList');

    // Monitor elements
    const monitorContainer = document.getElementById('monitorContainer');
    const monitorPreview = document.getElementById('monitorPreview');
    const monitorFlipContainer = document.getElementById('monitorFlipContainer');
    const monitorScriptWrapper = document.getElementById('monitorScriptWrapper');
    const monitorScriptText = document.getElementById('monitorScriptText');
    const monitorProgressBar = document.getElementById('monitorProgressBar');
    const monitorStatusDot = document.getElementById('monitorStatusDot');
    const monitorStatusText = document.getElementById('monitorStatusText');
    const monitorPercent = document.getElementById('monitorPercent');
    const editorView = document.getElementById('editorView');
    const monitorView = document.getElementById('monitorView');
    const viewEditorBtn = document.getElementById('viewEditorBtn');
    const viewMonitorBtn = document.getElementById('viewMonitorBtn');
    const monitorCountdownOverlay = document.getElementById('monitorCountdownOverlay');
    const monitorCountdownNumber = document.getElementById('monitorCountdownNumber');

    let isPlaying = false;
    let currentDisplayId = null;
    let cueMarkers = [];
    let currentProjectPath = null;
    let monitorPosition = 0;
    let teleprompterDimensions = { width: 1920, height: 1080 }; // Updated when teleprompter opens
    let monitorCountdownInterval = null;

    // Run countdown in monitor preview
    function runMonitorCountdown(seconds) {
      let count = seconds;
      monitorCountdownNumber.textContent = count;
      monitorCountdownNumber.className = 'monitor-countdown-number';
      monitorCountdownOverlay.querySelector('.monitor-countdown-text').textContent = 'Starting in...';
      monitorCountdownOverlay.classList.add('visible');

      monitorCountdownInterval = setInterval(() => {
        count--;
        if (count > 0) {
          monitorCountdownNumber.textContent = count;
        } else if (count === 0) {
          monitorCountdownNumber.textContent = 'GO';
          monitorCountdownNumber.className = 'monitor-countdown-go';
          monitorCountdownOverlay.querySelector('.monitor-countdown-text').textContent = '';
        } else {
          clearInterval(monitorCountdownInterval);
          monitorCountdownOverlay.classList.remove('visible');
        }
      }, 1000);
    }

    // Cancel monitor countdown
    function cancelMonitorCountdown() {
      if (monitorCountdownInterval) {
        clearInterval(monitorCountdownInterval);
        monitorCountdownInterval = null;
      }
      monitorCountdownOverlay.classList.remove('visible');
    }

    // View switching
    viewEditorBtn.addEventListener('click', () => {
      viewEditorBtn.classList.add('active');
      viewMonitorBtn.classList.remove('active');
      editorView.classList.add('active');
      monitorView.classList.remove('active');
    });

    viewMonitorBtn.addEventListener('click', () => {
      viewMonitorBtn.classList.add('active');
      viewEditorBtn.classList.remove('active');
      monitorView.classList.add('active');
      editorView.classList.remove('active');
      // Initialize monitor scaling
      updateMonitorScale();
    });

    // Scale the monitor preview to fit the container
    // NOTE: Monitor preview always shows readable text (no mirror/flip)
    // Mirror/flip only affects the teleprompter display output
    function updateMonitorScale() {
      const containerWidth = monitorContainer.clientWidth;
      const containerHeight = monitorContainer.clientHeight;

      // Set monitor preview to match teleprompter dimensions
      monitorPreview.style.width = teleprompterDimensions.width + 'px';
      monitorPreview.style.height = teleprompterDimensions.height + 'px';

      // Scale to fit the container
      const scaleX = containerWidth / teleprompterDimensions.width;
      const scaleY = containerHeight / teleprompterDimensions.height;
      const scale = Math.min(scaleX, scaleY);
      monitorPreview.style.transform = `scale(${scale})`;

      // Sync text and visual settings (but NOT mirror/flip - monitor always readable)
      updateMonitorText();
      monitorScriptText.style.fontSize = fontSizeInput.value + 'px';
      monitorScriptText.style.color = textColorInput.value;
      monitorScriptText.style.fontFamily = fontFamilySelect.value;
      monitorPreview.style.background = bgColorInput.value;
    }

    // Update monitor text content with span-wrapped words for highlighting
    function updateMonitorText() {
      const text = scriptText.value;
      if (!text) {
        monitorScriptText.textContent = 'Waiting for script...';
        return;
      }

      // Split text into tokens (words and whitespace/newlines)
      // This preserves the exact layout while wrapping words in spans
      const tokens = text.split(/(\s+)/);
      let wordIndex = 0;
      let html = '';

      for (const token of tokens) {
        if (token.match(/^\s+$/)) {
          // Whitespace - preserve exactly (including newlines)
          html += token;
        } else if (token.trim()) {
          // Word - wrap in span with data attribute
          const escapedWord = token.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          html += `<span class="monitor-word" data-word-index="${wordIndex}">${escapedWord}</span>`;
          wordIndex++;
        }
      }

      monitorScriptText.innerHTML = html;
    }

    // Highlight a word in the monitor view by index
    function highlightWordInMonitor(wordIndex) {
      // Remove previous highlight
      const previousHighlight = monitorScriptText.querySelector('.monitor-word.highlighted');
      if (previousHighlight) {
        previousHighlight.classList.remove('highlighted');
      }

      // Add highlight to current word
      const wordSpan = monitorScriptText.querySelector(`.monitor-word[data-word-index="${wordIndex}"]`);
      if (wordSpan) {
        wordSpan.classList.add('highlighted');
      }
    }

    // Clear highlight from monitor
    function clearMonitorHighlight() {
      const highlighted = monitorScriptText.querySelector('.monitor-word.highlighted');
      if (highlighted) {
        highlighted.classList.remove('highlighted');
      }
    }

    // Calculate and apply position based on percentage (normalized)
    function applyMonitorPosition(percent) {
      // Calculate position the same way teleprompter does
      // using the actual teleprompter height for accurate sync
      const containerHeight = teleprompterDimensions.height;
      const textHeight = monitorScriptWrapper.scrollHeight;
      const startY = containerHeight * 0.5;
      const endY = -textHeight + (containerHeight * 0.5);
      const range = startY - endY;
      const position = startY - (range * (percent / 100));
      monitorScriptWrapper.style.transform = `translateY(${position}px)`;
    }

    // Update monitor position display (progress bar and percentage)
    function updateMonitorPosition(positionData) {
      const percent = positionData.percent || 0;
      monitorPosition = percent;
      monitorProgressBar.style.width = `${percent}%`;
      monitorPercent.textContent = `${Math.round(percent)}%`;

      // Calculate position using the same formula as teleprompter
      // This ensures sync regardless of teleprompter display resolution
      applyMonitorPosition(percent);
    }

    // Receive position updates from teleprompter
    ipcRenderer.on('monitor-position', (event, positionData) => {
      updateMonitorPosition(positionData);
      positionSlider.value = positionData.percent || 0;
      if (document.getElementById('positionValue')) {
        document.getElementById('positionValue').textContent = Math.round(positionData.percent || 0) + '%';
      }
    });

    // Initialize monitor when teleprompter opens
    ipcRenderer.on('teleprompter-opened', (event, dimensions) => {
      // Store teleprompter display dimensions for accurate scaling
      if (dimensions) {
        teleprompterDimensions = dimensions;
      }
      updateMonitorText();
      updateMonitorScale();
      // Initialize position at start
      applyMonitorPosition(0);
    });

    // Handle window resize
    window.addEventListener('resize', () => {
      if (monitorView.classList.contains('active')) {
        updateMonitorScale();
      }
    });

    // Update monitor status when playing state changes
    function updateMonitorStatus() {
      if (isPlaying) {
        monitorStatusDot.classList.add('playing');
        monitorStatusText.textContent = 'Playing';
      } else {
        monitorStatusDot.classList.remove('playing');
        monitorStatusText.textContent = 'Paused';
      }
    }

    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
      });
    });

    // Load available displays
    async function loadDisplays() {
      const displays = await ipcRenderer.invoke('get-displays');
      displaySelect.innerHTML = '<option value="">Select display...</option>';
      displays.forEach(d => {
        const option = document.createElement('option');
        option.value = d.id;
        option.textContent = `${d.isPrimary ? 'Primary - ' : ''}${d.width} × ${d.height}`;
        displaySelect.appendChild(option);
      });
    }

    loadDisplays();

    // Refresh displays button
    document.getElementById('refreshDisplaysBtn').addEventListener('click', () => {
      loadDisplays();
    });

    // Character count
    function updateCharCount() {
      const count = scriptText.value.length;
      charCount.textContent = `${count.toLocaleString()} characters`;
    }

    scriptText.addEventListener('input', updateCharCount);

    // Clean up script - remove extra blank lines and bracketed text
    document.getElementById('cleanUpBtn').addEventListener('click', () => {
      let cleaned = scriptText.value
        .replace(/\[.*?\]\s*/g, '') // Remove text in square brackets [like this] and trailing space
        .split('\n')
        .map(line => line.trimEnd()) // Remove trailing spaces from each line
        .join('\n')
        .replace(/\n{2,}/g, '\n') // Reduce 2+ newlines to 1
        .trim(); // Trim start and end

      scriptText.value = cleaned;
      updateCharCount();
      sendScript();
    });

    // Open file
    document.getElementById('openFileBtn').addEventListener('click', async () => {
      const filePath = await ipcRenderer.invoke('open-file-dialog');
      if (filePath) {
        const result = await ipcRenderer.invoke('read-file', filePath);
        if (result.success) {
          scriptText.value = result.content;
          fileName.textContent = result.fileName;
          updateCharCount();
          cueMarkers = [];
          renderCueList();
          sendScript();
          updateMonitorText();
          updateMonitorPosition(0);
        } else {
          alert('Error reading file: ' + result.error);
        }
      }
    });

    // New script
    document.getElementById('newScriptBtn').addEventListener('click', () => {
      scriptText.value = '';
      fileName.textContent = 'Untitled';
      cueMarkers = [];
      currentProjectPath = null;
      renderCueList();
      updateCharCount();
    });

    // Save project
    document.getElementById('saveProjectBtn').addEventListener('click', async () => {
      const projectData = {
        name: fileName.textContent,
        script: scriptText.value,
        cueMarkers: cueMarkers,
        settings: {
          fontSize: parseInt(fontSizeInput.value),
          fontFamily: fontFamilySelect.value,
          textColor: textColorInput.value,
          bgColor: bgColorInput.value,
          mirror: mirrorCheckbox.checked,
          flip: flipCheckbox.checked,
          speed: parseInt(speedSlider.value),
          countdownEnabled: countdownCheckbox.checked,
          countdownSeconds: parseInt(countdownSeconds.value)
        }
      };

      const result = await ipcRenderer.invoke('save-project', projectData);
      if (result.success) {
        fileName.textContent = result.fileName;
        currentProjectPath = result.filePath;
      }
    });

    // Export to Word document
    document.getElementById('exportDocxBtn').addEventListener('click', async () => {
      const suggestedName = fileName.textContent.replace(/\.[^/.]+$/, '') + '.docx';
      const result = await ipcRenderer.invoke('export-docx', scriptText.value, suggestedName);
      if (!result.success && result.error) {
        alert('Error exporting: ' + result.error);
      }
    });

    // Load project
    document.getElementById('loadProjectBtn').addEventListener('click', async () => {
      const result = await ipcRenderer.invoke('load-project');
      if (result.success) {
        const data = result.data;
        scriptText.value = data.script || '';
        fileName.textContent = result.fileName;
        cueMarkers = data.cueMarkers || [];

        if (data.settings) {
          fontSizeInput.value = data.settings.fontSize || 72;
          fontFamilySelect.value = data.settings.fontFamily || 'Arial';
          textColorInput.value = data.settings.textColor || '#ffffff';
          bgColorInput.value = data.settings.bgColor || '#000000';
          mirrorCheckbox.checked = data.settings.mirror || false;
          flipCheckbox.checked = data.settings.flip || false;
          speedSlider.value = data.settings.speed || 30;
          speedValue.textContent = speedSlider.value;
          countdownCheckbox.checked = data.settings.countdownEnabled !== false;
          countdownSeconds.value = data.settings.countdownSeconds || 3;
        }

        updateCharCount();
        renderCueList();
        sendScript();
        sendSettings();
      }
    });

    // Send script to teleprompter
    function sendScript() {
      ipcRenderer.send('send-script', {
        text: scriptText.value,
        cueMarkers: cueMarkers
      });
    }

    // Open teleprompter display
    document.getElementById('openDisplayBtn').addEventListener('click', async () => {
      const displayId = displaySelect.value ? parseInt(displaySelect.value) : null;
      currentDisplayId = await ipcRenderer.invoke('open-teleprompter', displayId);
      setTimeout(() => {
        sendScript();
        sendSettings();
      }, 500);
    });

    // Close teleprompter display
    document.getElementById('closeDisplayBtn').addEventListener('click', () => {
      ipcRenderer.invoke('close-teleprompter');
    });

    // Playback controls
    function updatePlayButton() {
      // Voice Follow mode: show special state
      if (voiceFollowActive) {
        playIcon.innerHTML = '<path d="M12 15c1.66 0 2.99-1.34 2.99-3L15 6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 15 6.7 12H5c0 3.42 2.72 6.23 6 6.72V22h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>';
        playTextEl.textContent = 'Voice Mode';
        playPauseBtn.classList.remove('primary', 'success');
        playPauseBtn.style.opacity = '0.6';
        playPauseBtn.style.cursor = 'not-allowed';
      } else if (isPlaying) {
        playIcon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
        playTextEl.textContent = 'Pause';
        playPauseBtn.classList.remove('primary');
        playPauseBtn.classList.add('success');
        playPauseBtn.style.opacity = '1';
        playPauseBtn.style.cursor = 'pointer';
      } else {
        playIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
        playTextEl.textContent = 'Play';
        playPauseBtn.classList.remove('success');
        playPauseBtn.classList.add('primary');
        playPauseBtn.style.opacity = '1';
        playPauseBtn.style.cursor = 'pointer';
      }
      updateMonitorStatus();
    }

    playPauseBtn.addEventListener('click', async () => {
      // VOICE FOLLOW MODE: Block play/pause - voice controls everything
      if (voiceFollowActive) {
        return;
      }

      // When starting playback, auto-switch to monitor view and open display
      if (!isPlaying) {
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
          sendScript();
          sendSettings();
        }
      }

      if (!isPlaying && countdownCheckbox.checked) {
        // Start countdown on both teleprompter and monitor preview
        const seconds = parseInt(countdownSeconds.value);
        ipcRenderer.send('start-countdown', seconds);
        runMonitorCountdown(seconds);
        isPlaying = true;
        updatePlayButton();
      } else {
        isPlaying = !isPlaying;
        if (!isPlaying) {
          cancelMonitorCountdown();
        }
        updatePlayButton();
        sendPlaybackState();
      }
    });

    // Listen for countdown complete
    ipcRenderer.on('countdown-complete', () => {
      isPlaying = true;
      updatePlayButton();
    });

    // Listen for state updates from remote
    ipcRenderer.on('state-update', (event, state) => {
      if (state.isPlaying !== undefined && state.isPlaying !== isPlaying) {
        isPlaying = state.isPlaying;
        updatePlayButton();
      }
      if (state.speed !== undefined) {
        speedSlider.value = state.speed;
        speedValue.textContent = state.speed;
      }
    });

    document.getElementById('stopBtn').addEventListener('click', () => {
      isPlaying = false;
      cancelMonitorCountdown();
      updatePlayButton();
      positionSlider.value = 0;
      // Also reset monitor preview
      applyMonitorPosition(0);
      monitorProgressBar.style.width = '0%';
      monitorPercent.textContent = '0%';
      positionValue.textContent = '0%';
      ipcRenderer.send('playback-control', {
        isPlaying: false,
        speed: parseInt(speedSlider.value),
        position: 0,
        reset: true
      });
    });

    function sendPlaybackState(includePosition = false) {
      const state = {
        isPlaying: isPlaying,
        speed: parseInt(speedSlider.value)
      };
      if (includePosition) {
        state.position = parseInt(positionSlider.value);
        // Also update monitor preview immediately
        applyMonitorPosition(state.position);
        monitorProgressBar.style.width = state.position + '%';
        monitorPercent.textContent = Math.round(state.position) + '%';
      }
      ipcRenderer.send('playback-control', state);
    }

    // Speed control - don't include position to avoid jumping
    speedSlider.addEventListener('input', () => {
      speedValue.textContent = speedSlider.value;
      sendPlaybackState(false);
    });

    // Position control - include position
    positionSlider.addEventListener('input', () => sendPlaybackState(true));

    const positionValue = document.getElementById('positionValue');
    const findTextInput = document.getElementById('findTextInput');

    // Update position display
    positionSlider.addEventListener('input', () => {
      positionValue.textContent = positionSlider.value + '%';
    });

    document.getElementById('jumpStartBtn').addEventListener('click', () => {
      positionSlider.value = 0;
      positionValue.textContent = '0%';
      sendPlaybackState(true);
    });

    document.getElementById('jumpEndBtn').addEventListener('click', () => {
      positionSlider.value = 100;
      positionValue.textContent = '100%';
      sendPlaybackState(true);
    });

    // Jump to cursor position in editor
    document.getElementById('jumpCursorBtn').addEventListener('click', () => {
      const cursorPos = scriptText.selectionStart;
      const totalChars = scriptText.value.length;
      if (totalChars > 0) {
        const percent = Math.round((cursorPos / totalChars) * 100);
        positionSlider.value = percent;
        positionValue.textContent = percent + '%';
        sendPlaybackState(true);
      }
    });

    // Find text and jump to position
    document.getElementById('findTextBtn').addEventListener('click', findAndJump);
    findTextInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') findAndJump();
    });

    let lastFindIndex = 0;
    function findAndJump() {
      const searchText = findTextInput.value.toLowerCase();
      if (!searchText) return;

      const scriptContent = scriptText.value.toLowerCase();
      let index = scriptContent.indexOf(searchText, lastFindIndex + 1);

      // Wrap around if not found after current position
      if (index === -1) {
        index = scriptContent.indexOf(searchText);
      }

      if (index !== -1) {
        lastFindIndex = index;
        const totalChars = scriptText.value.length;
        const percent = Math.round((index / totalChars) * 100);

        // Update position slider and teleprompter
        positionSlider.value = percent;
        positionValue.textContent = percent + '%';
        sendPlaybackState(true);

        // Also highlight in editor
        scriptText.focus();
        scriptText.setSelectionRange(index, index + searchText.length);

        // Switch to editor view if in monitor
        viewEditorBtn.click();
      } else {
        lastFindIndex = 0;
      }
    }

    // Style controls
    function sendSettings() {
      const settings = {
        fontSize: parseInt(fontSizeInput.value),
        fontFamily: fontFamilySelect.value,
        textColor: textColorInput.value,
        bgColor: bgColorInput.value,
        mirror: mirrorCheckbox.checked,
        flip: flipCheckbox.checked
      };
      ipcRenderer.send('update-settings', settings);
      // Also sync settings to the monitor preview
      updateMonitorSettings(settings);

      // Reset voice follow state when settings change
      // Font size changes affect scroll height, so we need fresh state
      // Note: These variables are defined later in the voice follow section
      if (typeof window.voiceFollowReset === 'function') {
        window.voiceFollowReset();
      }
    }

    // Update monitor preview settings to match teleprompter
    function updateMonitorSettings(settings) {
      // Just call updateMonitorScale which handles all settings
      updateMonitorScale();
    }

    fontFamilySelect.addEventListener('change', sendSettings);
    fontSizeInput.addEventListener('change', sendSettings);
    textColorInput.addEventListener('change', sendSettings);
    bgColorInput.addEventListener('change', sendSettings);
    mirrorCheckbox.addEventListener('change', sendSettings);
    flipCheckbox.addEventListener('change', sendSettings);


    // Script text change
    scriptText.addEventListener('input', () => {
      clearTimeout(scriptText.sendTimeout);
      scriptText.sendTimeout = setTimeout(() => {
        sendScript();
        updateMonitorText();
      }, 500);
    });

    // Cue Markers
    function renderCueList() {
      if (cueMarkers.length === 0) {
        cueList.innerHTML = '<div class="no-cues">No cue markers. Add markers to quickly jump to sections.</div>';
        return;
      }

      cueList.innerHTML = cueMarkers.map((cue, i) => `
        <div class="cue-item" data-index="${i}">
          <span class="cue-name">${cue.name}</span>
          <span class="cue-delete" data-index="${i}">✕</span>
        </div>
      `).join('');

      // Click to jump
      cueList.querySelectorAll('.cue-item').forEach(item => {
        item.addEventListener('click', (e) => {
          if (e.target.classList.contains('cue-delete')) {
            const idx = parseInt(e.target.dataset.index);
            cueMarkers.splice(idx, 1);
            renderCueList();
            sendScript();
          } else {
            const idx = parseInt(item.dataset.index);
            const cue = cueMarkers[idx];
            // Jump to position based on character position
            const totalChars = scriptText.value.length;
            const position = (cue.position / totalChars) * 100;
            positionSlider.value = Math.min(100, Math.max(0, position));
            sendPlaybackState(true);
          }
        });
      });
    }

    // Cue modal elements
    const cueModal = document.getElementById('cueModal');
    const cueNameInput = document.getElementById('cueNameInput');
    const cueSaveBtn = document.getElementById('cueSaveBtn');
    const cueCancelBtn = document.getElementById('cueCancelBtn');
    let pendingCue = null;

    function showCueModal(defaultName) {
      cueNameInput.value = defaultName;
      cueModal.classList.add('visible');
      setTimeout(() => cueNameInput.focus(), 100);
    }

    function hideCueModal() {
      cueModal.classList.remove('visible');
      pendingCue = null;
    }

    document.getElementById('addCueBtn').addEventListener('click', () => {
      const cursorPos = scriptText.selectionStart;
      const textBefore = scriptText.value.substring(Math.max(0, cursorPos - 30), cursorPos);
      const textAfter = scriptText.value.substring(cursorPos, cursorPos + 20);
      const preview = (textBefore + '|' + textAfter).replace(/\n/g, ' ').trim();

      pendingCue = { position: cursorPos, preview: preview };
      showCueModal(`Cue ${cueMarkers.length + 1}`);
    });

    cueSaveBtn.addEventListener('click', () => {
      const name = cueNameInput.value.trim();
      if (name && pendingCue) {
        cueMarkers.push({
          name: name,
          position: pendingCue.position,
          preview: pendingCue.preview
        });
        cueMarkers.sort((a, b) => a.position - b.position);
        renderCueList();
        sendScript();
      }
      hideCueModal();
    });

    cueCancelBtn.addEventListener('click', hideCueModal);

    // Add cue from monitor view - uses current position percentage
    document.getElementById('addCueFromMonitorBtn').addEventListener('click', () => {
      // Convert percentage to character position
      const totalChars = scriptText.value.length;
      const cursorPos = Math.floor((monitorPosition / 100) * totalChars);
      const textBefore = scriptText.value.substring(Math.max(0, cursorPos - 30), cursorPos);
      const textAfter = scriptText.value.substring(cursorPos, cursorPos + 20);
      const preview = (textBefore + '|' + textAfter).replace(/\n/g, ' ').trim();

      pendingCue = { position: cursorPos, preview: preview };
      showCueModal(`Cue ${cueMarkers.length + 1}`);
    });

    // Edit from monitor view
    let isMonitorEditing = false;
    const editFromMonitorBtn = document.getElementById('editFromMonitorBtn');

    editFromMonitorBtn.addEventListener('click', () => {
      isMonitorEditing = !isMonitorEditing;

      if (isMonitorEditing) {
        // Enable editing
        monitorScriptText.contentEditable = 'true';
        monitorScriptText.style.cursor = 'text';
        monitorScriptText.style.outline = '2px solid var(--accent-primary)';
        monitorScriptText.style.borderRadius = '4px';
        editFromMonitorBtn.classList.add('success');
        editFromMonitorBtn.innerHTML = '<svg viewBox="0 0 24 24" style="width: 12px; height: 12px;"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> Done';
      } else {
        // Disable editing and sync back to editor
        monitorScriptText.contentEditable = 'false';
        monitorScriptText.style.cursor = '';
        monitorScriptText.style.outline = '';
        editFromMonitorBtn.classList.remove('success');
        editFromMonitorBtn.innerHTML = '<svg viewBox="0 0 24 24" style="width: 12px; height: 12px;"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg> Edit';

        // Sync edited content back to editor (extract text from HTML)
        scriptText.value = monitorScriptText.innerText;
        updateCharCount();
        sendScript();
      }
    });

    // Selection sync: when selecting in monitor, highlight in editor
    monitorScriptText.addEventListener('mouseup', () => {
      if (isMonitorEditing) return; // Don't sync during editing

      const selection = window.getSelection();
      if (selection.rangeCount > 0 && !selection.isCollapsed) {
        const selectedText = selection.toString();
        if (selectedText.trim()) {
          // Find the selected text in the editor
          const editorText = scriptText.value;
          const startIndex = editorText.indexOf(selectedText);

          if (startIndex !== -1) {
            // Switch to editor view and select the text
            viewEditorBtn.classList.add('active');
            viewMonitorBtn.classList.remove('active');
            editorView.classList.add('active');
            monitorView.classList.remove('active');

            // Focus and select in editor
            scriptText.focus();
            scriptText.setSelectionRange(startIndex, startIndex + selectedText.length);
          }
        }
      }
    });

    cueModal.addEventListener('click', (e) => {
      if (e.target === cueModal) hideCueModal();
    });

    cueNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') cueSaveBtn.click();
      if (e.key === 'Escape') hideCueModal();
    });

    // Jump to cue from remote
    ipcRenderer.on('jump-to-cue', (event, index) => {
      if (cueMarkers[index]) {
        const cue = cueMarkers[index];
        const totalChars = scriptText.value.length;
        const position = (cue.position / totalChars) * 100;
        positionSlider.value = Math.min(100, Math.max(0, position));
        sendPlaybackState(true);
      }
    });

    // Handle position change from remote control
    ipcRenderer.on('remote-position', (event, position) => {
      positionSlider.value = position;
      positionValue.textContent = Math.round(position) + '%';
      sendPlaybackState(true);
    });

    // Remote Control
    document.getElementById('startRemoteBtn').addEventListener('click', async () => {
      const result = await ipcRenderer.invoke('start-remote-server', 8080);
      if (result.success) {
        document.getElementById('remoteStatusDot').classList.add('active');
        document.getElementById('remoteStatusText').textContent = 'Remote control active';
        document.getElementById('remoteUrlBox').style.display = 'block';
        document.getElementById('remoteUrl').textContent = result.url;
        document.getElementById('remoteQrCode').src = result.qrCode;
      }
    });

    document.getElementById('stopRemoteBtn').addEventListener('click', async () => {
      await ipcRenderer.invoke('stop-remote-server');
      document.getElementById('remoteStatusDot').classList.remove('active');
      document.getElementById('remoteStatusText').textContent = 'Remote control off';
      document.getElementById('remoteUrlBox').style.display = 'none';
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Skip shortcuts when typing in text inputs
      if (e.target === scriptText) return;
      if (e.target.isContentEditable) return; // Skip when editing in monitor

      if (e.code === 'Space') {
        e.preventDefault();
        playPauseBtn.click();
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        speedSlider.value = Math.min(100, parseInt(speedSlider.value) + 5);
        speedValue.textContent = speedSlider.value;
        sendPlaybackState();
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        speedSlider.value = Math.max(1, parseInt(speedSlider.value) - 5);
        speedValue.textContent = speedSlider.value;
        sendPlaybackState();
      } else if (e.code === 'Home') {
        e.preventDefault();
        document.getElementById('jumpStartBtn').click();
      } else if (e.code === 'End') {
        e.preventDefault();
        document.getElementById('jumpEndBtn').click();
      }
    });

    // Draggable font size input (with threshold so arrows still work)
    (function() {
      let isMouseDown = false;
      let isDragging = false;
      let startX = 0;
      let startValue = 0;
      const dragThreshold = 5; // pixels before drag starts

      fontSizeInput.addEventListener('mousedown', (e) => {
        isMouseDown = true;
        isDragging = false;
        startX = e.clientX;
        startValue = parseInt(fontSizeInput.value);
      });

      document.addEventListener('mousemove', (e) => {
        if (!isMouseDown) return;
        const delta = e.clientX - startX;

        // Only start dragging after threshold
        if (!isDragging && Math.abs(delta) > dragThreshold) {
          isDragging = true;
        }

        if (isDragging) {
          const newValue = Math.min(200, Math.max(24, startValue + Math.round(delta / 2)));
          fontSizeInput.value = newValue;
          sendSettings();
        }
      });

      document.addEventListener('mouseup', () => {
        isMouseDown = false;
        isDragging = false;
      });
    })();

    // Scroll in monitor viewport to change position
    monitorContainer.addEventListener('wheel', (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Skip if no actual scroll movement
      if (e.deltaY === 0) return;

      // Use actual deltaY for smoother scrolling, normalize for trackpad vs mouse
      // Positive deltaY = scroll down = increase position (later in script)
      // Negative deltaY = scroll up = decrease position (earlier in script)
      const sensitivity = 0.1;
      const delta = Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY) * sensitivity, 2);
      const currentPos = parseFloat(positionSlider.value) || 0;
      const newPosition = Math.min(100, Math.max(0, currentPos + delta));

      positionSlider.value = newPosition;
      positionValue.textContent = Math.round(newPosition) + '%';
      applyMonitorPosition(newPosition);
      monitorProgressBar.style.width = newPosition + '%';
      monitorPercent.textContent = Math.round(newPosition) + '%';

      // Debounce sending to teleprompter to avoid too many updates
      clearTimeout(monitorContainer.scrollTimeout);
      monitorContainer.scrollTimeout = setTimeout(() => {
        sendPlaybackState(true);
      }, 50);
    }, { passive: false });

    // Initial
    sendSettings();
    renderCueList();

    // ===== Version Display =====
    const versionBadge = document.getElementById('versionBadge');
    const checkUpdatesBtn = document.getElementById('checkUpdatesBtn');

    // Fetch and display app version on load
    (async function() {
      const version = await ipcRenderer.invoke('get-app-version');
      versionBadge.textContent = `v${version}`;
    })();

    // ===== Auto-Update Handling =====
    const updateBanner = document.getElementById('updateBanner');
    const updateText = document.getElementById('updateText');
    const updateVersion = document.getElementById('updateVersion');
    const updateActionBtn = document.getElementById('updateActionBtn');
    const updateCloseBtn = document.getElementById('updateCloseBtn');

    let updateState = 'idle'; // idle, available, downloading, downloaded

    function showUpdateBanner() {
      updateBanner.classList.add('visible');
    }

    function hideUpdateBanner() {
      updateBanner.classList.remove('visible');
    }

    // Handle update status messages from main process
    ipcRenderer.on('update-status', (event, data) => {
      switch (data.status) {
        case 'available':
          updateState = 'available';
          updateVersion.textContent = `(v${data.version})`;
          updateText.innerHTML = `Update available <span>${updateVersion.textContent}</span>`;
          updateActionBtn.textContent = 'Download';
          showUpdateBanner();
          break;

        case 'downloading':
          updateState = 'downloading';
          const percent = Math.round(data.percent);
          updateText.innerHTML = `Downloading update... <span>${percent}%</span>`;
          updateActionBtn.textContent = 'Downloading...';
          updateActionBtn.disabled = true;
          break;

        case 'downloaded':
          updateState = 'downloaded';
          updateText.innerHTML = `Update ready <span>(v${data.version})</span>`;
          updateActionBtn.textContent = 'Restart Now';
          updateActionBtn.disabled = false;
          break;

        case 'error':
          updateState = 'idle';
          hideUpdateBanner();
          break;

        case 'not-available':
          updateState = 'idle';
          // Update check button text when already up to date
          checkUpdatesBtn.textContent = 'Up to date!';
          setTimeout(() => {
            checkUpdatesBtn.textContent = 'Check for Updates';
          }, 3000);
          break;
      }
    });

    // Handle button clicks
    updateActionBtn.addEventListener('click', async () => {
      if (updateState === 'available') {
        await ipcRenderer.invoke('download-update');
      } else if (updateState === 'downloaded') {
        await ipcRenderer.invoke('install-update');
      }
    });

    updateCloseBtn.addEventListener('click', () => {
      hideUpdateBanner();
    });

    // Manual check for updates button
    checkUpdatesBtn.addEventListener('click', async () => {
      checkUpdatesBtn.classList.add('checking');
      checkUpdatesBtn.textContent = 'Checking...';

      await ipcRenderer.invoke('check-for-updates');

      // Reset button after a short delay (update-status event will handle showing banner if available)
      setTimeout(() => {
        checkUpdatesBtn.classList.remove('checking');
        checkUpdatesBtn.textContent = 'Check for Updates';
      }, 2000);
    });

    // ============================================
    // Voice Follow - Speech Recognition Auto-Scroll
    // Uses Whisper (Local/Free) via Transformers.js
    // ============================================

    const voiceFollowCheckbox = document.getElementById('voiceFollowCheckbox');
    const voiceStatus = document.getElementById('voiceStatus');
    const voiceStatusText = document.getElementById('voiceStatusText');
    const voiceTranscript = document.getElementById('voiceTranscript');
    const audioInputSelect = document.getElementById('audioInputSelect');
    const voicePauseBtn = document.getElementById('voicePauseBtn');
    const voiceDebug = document.getElementById('voiceDebug');
    const debugMatchedWord = document.getElementById('debugMatchedWord');
    const debugWordIndex = document.getElementById('debugWordIndex');
    const debugTotalWords = document.getElementById('debugTotalWords');
    const whisperModelStatus = document.getElementById('whisperModelStatus');
    const whisperModelStatusText = document.getElementById('whisperModelStatusText');
    const whisperModelProgressBar = document.getElementById('whisperModelProgressBar');
    const whisperModelSpinner = document.getElementById('whisperModelSpinner');

    let voiceFollowActive = false;
    let voiceFollowPaused = false;
    let scriptWords = [];
    let currentWordIndex = 0;
    let lastMatchedIndex = -1;
    let audioStream = null;
    let audioContext = null;

    // Whisper state
    let whisperTranscriber = null;
    let whisperModelLoaded = false;
    let whisperAudioBuffer = [];
    let whisperProcessInterval = null;
    let scriptProcessor = null;
    const WHISPER_SAMPLE_RATE = 16000;
    const WHISPER_CHUNK_SECONDS = 1.0; // Process every second for smooth, stable scrolling

    // Populate audio input devices
    async function populateAudioInputs() {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(d => d.kind === 'audioinput');

        audioInputSelect.innerHTML = '<option value="">Default Microphone</option>';
        audioInputs.forEach(device => {
          const option = document.createElement('option');
          option.value = device.deviceId;
          option.textContent = device.label || `Microphone ${audioInputSelect.options.length}`;
          audioInputSelect.appendChild(option);
        });
      } catch (err) {
        // Audio device enumeration failed silently
      }
    }

    populateAudioInputs();
    audioInputSelect.addEventListener('focus', populateAudioInputs);

    // Normalize text for matching
    function normalizeWord(word) {
      return word.toLowerCase().replace(/[^\w\s]/g, '').trim();
    }

    // Prepare script for voice matching
    function prepareScriptForVoice() {
      const text = scriptText.value;
      scriptWords = [];
      let charIndex = 0;

      const words = text.split(/\s+/);
      for (const word of words) {
        if (word.trim()) {
          const normalized = normalizeWord(word);
          if (normalized) {
            const foundIndex = text.indexOf(word, charIndex);
            const position = foundIndex >= 0 ? foundIndex : charIndex;
            scriptWords.push({
              original: word,
              word: word, // Alias for easier access
              normalized: normalized,
              charIndex: position,
              position: position, // Alias for easier access
              wordIndex: scriptWords.length
            });
            charIndex = foundIndex >= 0 ? foundIndex + word.length : charIndex + word.length + 1;
          }
        }
      }

      currentWordIndex = 0;
      lastMatchedIndex = -1;

      // Update debug display
      debugTotalWords.textContent = scriptWords.length;
      debugWordIndex.textContent = '0';
      debugMatchedWord.textContent = '-';
    }

    // ============ PHRASE-BASED VOICE MATCHING ============
    // More robust approach: accumulate spoken words into a phrase and find best match
    // Allows recovery when lost, tolerates some misses, and uses confidence scoring

    // Accumulated spoken phrase (rolling buffer of recent words)
    let spokenPhrase = [];
    const PHRASE_BUFFER_SIZE = 4;   // Keep last 4 spoken words (smaller = faster response)

    // Track time since last successful match (for recovery mode)
    let lastMatchTime = Date.now();
    const RECOVERY_TIMEOUT = 5000;  // Enter recovery mode after 5 seconds without match

    // Matching parameters
    const MIN_MATCH_WORDS = 2;      // Need at least 2 matching words (faster response)
    const MATCH_THRESHOLD = 0.4;    // At least 40% of phrase should match (more lenient)
    const NORMAL_SEARCH_AHEAD = 25; // Normal: search 25 words ahead
    const NORMAL_SEARCH_BEHIND = 3; // Normal: allow 3 words behind (for small corrections)
    const RECOVERY_SEARCH_RANGE = 100; // Recovery: search 100 words in each direction
    const MAX_FORWARD_JUMP = 15;    // Never jump more than 15 words forward at once

    // Expose reset function for use by sendSettings()
    window.voiceFollowReset = function() {
      currentWordIndex = -1;
      lastMatchedIndex = -1;
      spokenPhrase = [];
      lastMatchTime = Date.now();
    };

    // Add words to the phrase buffer
    function addToSpokenPhrase(words) {
      for (const word of words) {
        const normalized = normalizeWord(word);
        if (normalized && normalized.length >= 2) {
          spokenPhrase.push(normalized);
          // Keep buffer at max size
          if (spokenPhrase.length > PHRASE_BUFFER_SIZE) {
            spokenPhrase.shift();
          }
        }
      }
    }

    // Find best matching position using phrase matching with scoring
    function findMatchingWordIndex(spokenWords) {
      if (scriptWords.length === 0) {
        return -1;
      }

      // Add new words to phrase buffer
      addToSpokenPhrase(spokenWords);

      if (spokenPhrase.length < MIN_MATCH_WORDS) {
        return -1;
      }

      // Determine search range based on whether we're in recovery mode
      const timeSinceMatch = Date.now() - lastMatchTime;
      const inRecoveryMode = timeSinceMatch > RECOVERY_TIMEOUT;

      let searchStart, searchEnd;
      const currentPos = Math.max(0, currentWordIndex);

      if (inRecoveryMode) {
        // Recovery mode: search a much wider range
        searchStart = Math.max(0, currentPos - RECOVERY_SEARCH_RANGE);
        searchEnd = Math.min(scriptWords.length, currentPos + RECOVERY_SEARCH_RANGE);
      } else {
        // Normal mode: search ahead with small backward allowance
        searchStart = Math.max(0, currentPos - NORMAL_SEARCH_BEHIND);
        searchEnd = Math.min(scriptWords.length, currentPos + NORMAL_SEARCH_AHEAD);
      }

      let bestMatch = -1;
      let bestScore = 0;
      let bestMatchCount = 0;

      // Slide through script looking for best match
      for (let scriptPos = searchStart; scriptPos < searchEnd; scriptPos++) {
        let matchCount = 0;
        let matchedPositions = [];

        // Try to match phrase words against script starting at scriptPos
        // Allow gaps (skipped words) in both phrase and script
        let scriptIdx = scriptPos;
        const maxScriptLookahead = Math.min(scriptWords.length, scriptPos + spokenPhrase.length + 10);

        for (let phraseIdx = 0; phraseIdx < spokenPhrase.length && scriptIdx < maxScriptLookahead; phraseIdx++) {
          const phraseWord = spokenPhrase[phraseIdx];

          // Look for this phrase word in the next few script words
          let found = false;
          for (let lookAhead = 0; lookAhead < 4 && scriptIdx + lookAhead < maxScriptLookahead; lookAhead++) {
            const scriptWord = scriptWords[scriptIdx + lookAhead].normalized;

            if (scriptWord === phraseWord) {
              matchCount++;
              matchedPositions.push(scriptIdx + lookAhead);
              scriptIdx = scriptIdx + lookAhead + 1;
              found = true;
              break;
            }
          }

          if (!found) {
            // Word not found, continue with next phrase word
            scriptIdx++;
          }
        }

        // Calculate match quality
        const matchPercent = matchCount / spokenPhrase.length;

        if (matchCount >= MIN_MATCH_WORDS && matchPercent >= MATCH_THRESHOLD) {
          // Calculate the actual position we'd jump to
          const targetPos = matchedPositions.length > 0 ? matchedPositions[matchedPositions.length - 1] : scriptPos;
          const jumpDistance = targetPos - currentPos;

          // In normal mode, enforce maximum forward jump limit
          if (!inRecoveryMode && jumpDistance > MAX_FORWARD_JUMP) {
            continue;
          }

          // Score based on: match percentage + proximity bonus
          const distanceFromCurrent = scriptPos - currentPos;
          let proximityBonus = 0;

          // Prefer positions slightly ahead of current (natural reading flow)
          if (distanceFromCurrent >= 0 && distanceFromCurrent <= 10) {
            proximityBonus = 0.3;  // Strong bonus for close forward matches
          } else if (distanceFromCurrent > 10) {
            // Penalize larger forward jumps
            proximityBonus = -0.2 * (distanceFromCurrent - 10) / 15;
          } else if (distanceFromCurrent < 0) {
            // Penalize backward movement more
            proximityBonus = -0.4;
          }

          const score = matchPercent + proximityBonus;

          if (score > bestScore || (score === bestScore && matchCount > bestMatchCount)) {
            bestScore = score;
            bestMatchCount = matchCount;
            // Position at the last matched word
            bestMatch = targetPos;
          }
        }
      }

      if (bestMatch === -1) {
      } else {
        // Update last match time on successful match
        lastMatchTime = Date.now();
      }

      return bestMatch;
    }

    // Calculate scroll position from word index
    // Using word index / total words is more stable than character position
    // because words are more evenly distributed visually regardless of font size
    function getPositionFromWordIndex(wordIndex) {
      if (wordIndex < 0 || scriptWords.length === 0) return null;
      if (wordIndex >= scriptWords.length) wordIndex = scriptWords.length - 1;

      // Use word position as percentage through the document
      // This is more stable than character-based position when font size changes
      const percent = (wordIndex / scriptWords.length) * 100;
      return Math.min(100, Math.max(0, percent));
    }

    // Update teleprompter position
    // Look-ahead: position a few words ahead of where speech was matched
    // This compensates for speech recognition latency and keeps text at reading line
    const VOICE_LOOKAHEAD_WORDS = 5;

    // Minimum movement to trigger an update (prevents jitter)
    const MIN_MOVEMENT_PERCENT = 0.3;

    // Maximum backward movement allowed (for small corrections)
    const MAX_BACKWARD_PERCENT = 2.0;

    function updatePositionFromVoice(wordIndex) {
      // Apply look-ahead: position ahead of where we matched
      // This keeps the text you're about to read at the center line
      const lookaheadIndex = Math.min(wordIndex + VOICE_LOOKAHEAD_WORDS, scriptWords.length - 1);
      const percent = getPositionFromWordIndex(lookaheadIndex);
      if (percent === null) {
        return;
      }

      const currentPercent = parseFloat(positionSlider.value);
      const diff = percent - currentPercent;

      // Allow small backward corrections, but not large ones
      if (diff < -MAX_BACKWARD_PERCENT) {
        return;
      }

      // Require minimum movement to prevent jitter
      if (Math.abs(diff) < MIN_MOVEMENT_PERCENT) {
        return;
      }

      lastMatchedIndex = wordIndex;
      currentWordIndex = wordIndex;

      positionSlider.value = percent;
      positionValue.textContent = Math.round(percent) + '%';

      // Use voice-follow-position for smooth continuous following
      // This triggers the "camera follow" animation instead of discrete jumps
      ipcRenderer.send('voice-follow-position', percent);

      applyMonitorPosition(percent);
      monitorPosition = percent;
    }

    // Process transcription result
    function processTranscription(transcript) {
      if (!transcript || voiceFollowPaused) return;

      // Safety check: ensure script words are prepared
      if (scriptWords.length === 0) {
        prepareScriptForVoice();
        if (scriptWords.length === 0) {
          return;
        }
      }

      voiceTranscript.textContent = transcript.slice(-100);

      // Match words with at least 2 characters (reduced from 3)
      const wordsToMatch = transcript.split(/\s+/).filter(w => w.trim().length >= 2);

      if (wordsToMatch.length > 0) {
        const matchIndex = findMatchingWordIndex(wordsToMatch);

        if (matchIndex >= 0) {
          updatePositionFromVoice(matchIndex);

          // Update debug display
          const matchedWord = scriptWords[matchIndex];
          if (matchedWord) {
            debugMatchedWord.textContent = matchedWord.word;
            debugWordIndex.textContent = matchIndex;

            // Highlight word in editor and monitor
            highlightWordInEditor(matchedWord.position, matchedWord.word.length);
            highlightWordInMonitor(matchIndex);
          }
        }
      }
    }

    // Highlight the current word in the script editor
    function highlightWordInEditor(charPosition, wordLength) {
      if (!editorView.classList.contains('active')) return;

      // Set selection to highlight the word
      scriptText.focus();
      scriptText.setSelectionRange(charPosition, charPosition + wordLength);

      // Scroll the selection into view
      const lineHeight = parseInt(window.getComputedStyle(scriptText).lineHeight) || 20;
      const charsPerLine = Math.floor(scriptText.clientWidth / 8); // Approximate chars per line
      const lineNumber = Math.floor(charPosition / charsPerLine);
      const scrollTop = lineNumber * lineHeight - scriptText.clientHeight / 2;
      scriptText.scrollTop = Math.max(0, scrollTop);
    }

    // ========== WHISPER IMPLEMENTATION ==========

    // Load Whisper model
    async function loadWhisperModel() {
      if (whisperModelLoaded && whisperTranscriber) {
        return whisperTranscriber;
      }

      whisperModelStatus.style.display = 'block';
      whisperModelStatusText.textContent = 'Loading Whisper model...';
      whisperModelProgressBar.style.width = '0%';
      whisperModelSpinner.style.display = 'block';

      try {
        const path = require('path');
        const os = require('os');
        const fs = require('fs');
        const Module = require('module');

        // Configure cache directory for Electron
        const cacheDir = path.join(os.homedir(), '.cache', 'umbrellaprompter', 'models');

        // Ensure cache directory exists
        if (!fs.existsSync(cacheDir)) {
          fs.mkdirSync(cacheDir, { recursive: true });
        }

        // Mock the sharp module to prevent errors in packaged app
        // We only use audio (Whisper), so sharp (image processing) is not needed
        const originalRequire = Module.prototype.require;
        Module.prototype.require = function(id) {
          if (id === 'sharp') {
            // Return a comprehensive mock that won't crash when methods are called
            const sharpMock = function() {
              const chainable = {
                resize: () => chainable,
                rotate: () => chainable,
                flip: () => chainable,
                flop: () => chainable,
                sharpen: () => chainable,
                median: () => chainable,
                blur: () => chainable,
                flatten: () => chainable,
                gamma: () => chainable,
                negate: () => chainable,
                normalise: () => chainable,
                normalize: () => chainable,
                clahe: () => chainable,
                convolve: () => chainable,
                threshold: () => chainable,
                linear: () => chainable,
                recomb: () => chainable,
                modulate: () => chainable,
                tint: () => chainable,
                greyscale: () => chainable,
                grayscale: () => chainable,
                pipelineColourspace: () => chainable,
                pipelineColorspace: () => chainable,
                toColourspace: () => chainable,
                toColorspace: () => chainable,
                removeAlpha: () => chainable,
                ensureAlpha: () => chainable,
                extractChannel: () => chainable,
                joinChannel: () => chainable,
                bandbool: () => chainable,
                extract: () => chainable,
                trim: () => chainable,
                extend: () => chainable,
                composite: () => chainable,
                png: () => chainable,
                jpeg: () => chainable,
                webp: () => chainable,
                gif: () => chainable,
                jp2: () => chainable,
                tiff: () => chainable,
                avif: () => chainable,
                heif: () => chainable,
                jxl: () => chainable,
                raw: () => chainable,
                tile: () => chainable,
                timeout: () => chainable,
                toBuffer: () => Promise.resolve(Buffer.alloc(0)),
                toFile: () => Promise.resolve({}),
                metadata: () => Promise.resolve({ width: 0, height: 0, format: 'unknown' }),
                stats: () => Promise.resolve({}),
                clone: () => chainable,
              };
              return chainable;
            };
            // Add static methods
            sharpMock.cache = () => {};
            sharpMock.concurrency = () => {};
            sharpMock.counters = () => ({});
            sharpMock.simd = () => false;
            sharpMock.format = {};
            sharpMock.versions = {};
            return sharpMock;
          }
          return originalRequire.apply(this, arguments);
        };

        // Use require for Electron compatibility
        const { pipeline, env } = require('@huggingface/transformers');

        // Restore original require
        Module.prototype.require = originalRequire;

        // Configure transformers.js for Electron environment
        // IMPORTANT: Must set these BEFORE calling pipeline
        env.useBrowserCache = false;  // Force Node.js file system caching
        env.useFS = true;             // Enable file system access
        env.localModelPath = cacheDir;
        env.cacheDir = cacheDir;
        env.allowLocalModels = true;
        env.allowRemoteModels = true;

        // Check if model is already cached (look for the ONNX files)
        const modelName = 'whisper-base.en';
        const modelCachePath = path.join(cacheDir, 'Xenova', modelName);
        const modelConfigPath = path.join(modelCachePath, 'config.json');
        const onnxDir = path.join(modelCachePath, 'onnx');
        const encoderPath = path.join(onnxDir, 'encoder_model.onnx');
        const decoderPath = path.join(onnxDir, 'decoder_model_merged.onnx');

        const configExists = fs.existsSync(modelConfigPath);
        const encoderExists = fs.existsSync(encoderPath);
        const decoderExists = fs.existsSync(decoderPath);
        const isModelCached = configExists && encoderExists && decoderExists;

        if (isModelCached) {
          whisperModelStatusText.textContent = 'Loading cached model...';
          whisperModelProgressBar.style.width = '50%';

          // Load directly from local path when cached
          whisperTranscriber = await pipeline(
            'automatic-speech-recognition',
            modelCachePath,  // Use local path directly
            {
              local_files_only: true,
              progress_callback: (progress) => {
                if (progress.status === 'loading' || progress.status === 'initiate') {
                  whisperModelStatusText.textContent = 'Loading model...';
                  whisperModelProgressBar.style.width = '75%';
                } else if (progress.status === 'ready' || progress.status === 'done') {
                  whisperModelStatusText.textContent = 'Model ready!';
                  whisperModelProgressBar.style.width = '100%';
                  whisperModelSpinner.style.display = 'none';
                }
              }
            }
          );
        } else {
          whisperModelStatusText.textContent = 'Downloading model (~280MB)...';

          // Download from Hugging Face Hub
          whisperTranscriber = await pipeline(
            'automatic-speech-recognition',
            'Xenova/' + modelName,
            {
              cache_dir: cacheDir,
              local_files_only: false,
              progress_callback: (progress) => {
                if (progress.status === 'downloading') {
                  const percent = progress.progress || 0;
                  whisperModelProgressBar.style.width = percent + '%';
                  whisperModelStatusText.textContent = `Downloading... ${Math.round(percent)}%`;
                } else if (progress.status === 'loading' || progress.status === 'initiate') {
                  whisperModelStatusText.textContent = 'Loading model...';
                  whisperModelProgressBar.style.width = '75%';
                } else if (progress.status === 'ready' || progress.status === 'done') {
                  whisperModelStatusText.textContent = 'Model ready!';
                  whisperModelProgressBar.style.width = '100%';
                  whisperModelSpinner.style.display = 'none';
                }
              }
            }
          );
        }

        whisperModelLoaded = true;
        whisperModelStatus.style.display = 'none';
        return whisperTranscriber;

      } catch (error) {
        console.error('Whisper: Failed to load model:', error);
        whisperModelStatusText.textContent = 'Failed to load model: ' + error.message;
        whisperModelProgressBar.style.width = '0%';
        whisperModelSpinner.style.display = 'none';
        throw error;
      }
    }

    // Start voice follow with Whisper (local, free)
    async function startWhisperVoiceFollow() {
      // IMPORTANT: Clean up any existing audio resources first
      // This prevents conflicts when rapidly toggling voice follow
      if (whisperProcessInterval) {
        clearInterval(whisperProcessInterval);
        whisperProcessInterval = null;
      }
      if (scriptProcessor) {
        try { scriptProcessor.disconnect(); } catch (e) {}
        scriptProcessor = null;
      }
      if (audioContext) {
        try { audioContext.close(); } catch (e) {}
        audioContext = null;
      }
      if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
      }

      voiceStatusText.textContent = 'Loading model...';

      try {
        // Load model first
        await loadWhisperModel();
      } catch (error) {
        voiceStatusText.textContent = 'Model load failed';
        voiceFollowCheckbox.checked = false;
        return;
      }

      voiceStatusText.textContent = 'Starting...';

      // Prepare script words for matching
      prepareScriptForVoice();

      // Reset position tracking
      currentWordIndex = -1;
      lastMatchedIndex = -1;
      spokenPhrase = [];
      lastMatchTime = Date.now();
      whisperAudioBuffer = [];

      // Stop auto-scroll when Voice Follow is active
      if (isPlaying) {
        isPlaying = false;
        ipcRenderer.send('playback-control', {
          isPlaying: false,
          speed: parseInt(speedSlider.value)
        });
        playPauseBtn.textContent = '▶ Play';
      }

      const deviceId = audioInputSelect.value;
      const constraints = {
        audio: deviceId ? { deviceId: { exact: deviceId } } : true
      };

      try {
        audioStream = await navigator.mediaDevices.getUserMedia(constraints);

        audioContext = new AudioContext({ sampleRate: WHISPER_SAMPLE_RATE });
        const source = audioContext.createMediaStreamSource(audioStream);

        // Create script processor to collect audio samples
        scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);

        scriptProcessor.onaudioprocess = (event) => {
          if (voiceFollowPaused) return;

          const inputData = event.inputBuffer.getChannelData(0);
          // Copy the data as it gets reused
          whisperAudioBuffer.push(new Float32Array(inputData));
        };

        source.connect(scriptProcessor);
        scriptProcessor.connect(audioContext.destination);

        // Process audio chunks every few seconds
        whisperProcessInterval = setInterval(async () => {
          if (voiceFollowPaused || whisperAudioBuffer.length === 0) return;

          // Collect all buffered audio
          const totalLength = whisperAudioBuffer.reduce((sum, arr) => sum + arr.length, 0);
          const combinedAudio = new Float32Array(totalLength);
          let offset = 0;
          for (const chunk of whisperAudioBuffer) {
            combinedAudio.set(chunk, offset);
            offset += chunk.length;
          }

          // Clear buffer for next chunk
          whisperAudioBuffer = [];

          // Skip if too short (less than 0.5 seconds)
          if (combinedAudio.length < WHISPER_SAMPLE_RATE * 0.5) {
            return;
          }

          try {
            // Run transcription (no language/task needed for English-only model)
            const result = await whisperTranscriber(combinedAudio);

            if (result && result.text) {
              const transcript = result.text.trim().toLowerCase();
              if (transcript) {
                voiceTranscript.textContent = transcript;

                // Process the transcript through the word matching system
                processTranscription(transcript);
              }
            }
          } catch (err) {
            console.error('Whisper transcription error:', err);
          }

        }, WHISPER_CHUNK_SECONDS * 1000);

        voiceFollowActive = true;
        updatePlayButton(); // Update UI to show Voice Mode
        voiceStatusText.textContent = 'Listening...';
        voiceStatus.classList.add('listening');
        voicePauseBtn.style.display = 'inline-block';

      } catch (error) {
        console.error('Whisper: Microphone error:', error);
        voiceStatusText.textContent = 'Mic error: ' + error.message;
        voiceFollowCheckbox.checked = false;
        voiceFollowActive = false;
      }
    }

    // Stop Whisper voice follow
    function stopWhisperVoiceFollow() {
      voiceFollowActive = false;
      updatePlayButton(); // Restore normal play button UI
      clearMonitorHighlight(); // Clear word highlight when voice follow stops

      if (whisperProcessInterval) {
        clearInterval(whisperProcessInterval);
        whisperProcessInterval = null;
      }
      whisperAudioBuffer = [];

      if (scriptProcessor) {
        scriptProcessor.disconnect();
        scriptProcessor = null;
      }

      if (audioContext) {
        audioContext.close();
        audioContext = null;
      }

      if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
      }

      voiceStatus.classList.remove('listening');
      voiceStatusText.textContent = 'Disabled';
      voicePauseBtn.style.display = 'none';
      voiceTranscript.textContent = '';

      // Tell teleprompter to stop following
      ipcRenderer.send('voice-follow-stop');
    }

    // ========== END WHISPER IMPLEMENTATION ==========

    // Toggle handler - Whisper only
    voiceFollowCheckbox.addEventListener('change', () => {
      if (voiceFollowCheckbox.checked) {
        startWhisperVoiceFollow();
      } else {
        stopWhisperVoiceFollow();
      }
    });

    // Pause button handler - stops sending audio to save API cost
    voicePauseBtn.addEventListener('click', () => {
      voiceFollowPaused = !voiceFollowPaused;
      if (voiceFollowPaused) {
        voicePauseBtn.textContent = 'Resume';
        voiceStatusText.textContent = 'Paused';
        voiceStatus.classList.remove('listening');
      } else {
        voicePauseBtn.textContent = 'Pause';
        voiceStatusText.textContent = 'Listening...';
        voiceStatus.classList.add('listening');
      }
    });

    // Re-prepare script when text changes
    scriptText.addEventListener('input', () => {
      if (voiceFollowActive) {
        prepareScriptForVoice();
      }
    });

    // Re-initialize when audio device changes
    audioInputSelect.addEventListener('change', () => {
      if (voiceFollowActive && voiceFollowCheckbox.checked) {
        stopWhisperVoiceFollow();
        setTimeout(() => startWhisperVoiceFollow(), 100);
      }
    });
