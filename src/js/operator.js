/**
 * Umbrellaprompter - Operator Window JavaScript
 * Sections: State, Monitor, Script, Playback, Settings, Mobile, Updates
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
    const fontSizeValue = document.getElementById('fontSizeValue');
    const textColorInput = document.getElementById('textColorInput');
    const bgColorInput = document.getElementById('bgColorInput');
    const mirrorCheckbox = document.getElementById('mirrorCheckbox');
    const flipCheckbox = document.getElementById('flipCheckbox');
    const countdownCheckbox = document.getElementById('countdownCheckbox');
    const countdownSeconds = document.getElementById('countdownSeconds');
    const countdownRow = document.getElementById('countdownRow');

    // Helper to set textarea value while preserving undo stack
    function setTextWithUndo(textarea, newValue) {
      textarea.focus();
      textarea.select();
      document.execCommand('insertText', false, newValue);
    }

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

    // Stub function for removed cue feature
    function renderCueList() {
      // Cue feature removed - stub to prevent errors
    }
    let monitorPosition = 0;
    let teleprompterDimensions = { width: 1920, height: 1080 }; // Updated when teleprompter opens
    let monitorCountdownInterval = null;
    // Monitor scroll animation state
    let targetPosition = 0;
    let currentDisplayPosition = 0;
    let scrollAnimationId = null;

    // ============================================
    // PHASE 1: MULTI-SCRIPT SESSION MANAGEMENT
    // ============================================

    // Phase 1 Elements
    const scriptTabs = document.getElementById('scriptTabs');
    const addScriptTab = document.getElementById('addScriptTab');
    const headerRecordingTimer = document.getElementById('headerRecordingTimer');
    const headerSessionTimer = document.getElementById('headerSessionTimer');
    // Inline recording section elements
    const recordingSection = document.getElementById('recordingSection');
    const inlineSessionTimer = document.getElementById('inlineSessionTimer');
    const inlineMarkerRetake = document.getElementById('inlineMarkerRetake');
    const inlineMarkerStumble = document.getElementById('inlineMarkerStumble');
    const inlineMarkerNote = document.getElementById('inlineMarkerNote');
    // Timeline marker buttons
    const timelineMarkerRetake = document.getElementById('timelineMarkerRetake');
    const timelineMarkerStumble = document.getElementById('timelineMarkerStumble');
    const timelineMarkerNote = document.getElementById('timelineMarkerNote');
    const autosaveIndicator = document.getElementById('autosaveIndicator');
    const autosaveText = document.getElementById('autosaveText');
    const autosaveSpinner = document.getElementById('autosaveSpinner');
    const autosaveCheckmark = document.getElementById('autosaveCheckmark');
    const markerTimeline = document.getElementById('markerTimeline');
    const markerTimelineContent = document.getElementById('markerTimelineContent');
    const markerCount = document.getElementById('markerCount');
    const markerDuration = document.getElementById('markerDuration');
    const controlPanel = document.querySelector('.control-panel');
    const controlPanelHeader = document.getElementById('controlPanelHeader');
    const showTimelineBtn = document.getElementById('showTimelineBtn');
    const showControlsBtn = document.getElementById('showControlsBtn');

    // Multi-script session state
    let scripts = [];
    let currentScriptId = 'main';
    let sessionId = Date.now().toString();
    let nextScriptId = 1;

    // Recording state
    let isRecording = false;
    let sessionStartTime = null;
    let scriptStartTime = null;
    let timerInterval = null;

    // Problem markers
    let problemMarkers = [];

    // Auto-save state
    let autoSaveInterval = null;
    let autoSaveQueue = [];
    const MAX_AUTOSAVES = 5;
    const AUTOSAVE_INTERVAL = 30000; // 30 seconds

    // Initialize with default script
    scripts.push({
      id: 'main',
      name: 'Untitled',
      content: '',
      cueMarkers: [],
      markers: [],
      completed: false
    });

    // Session Management Functions
    function switchToScript(scriptId) {
      // Save current script state (includes markers)
      saveCurrentScriptState();

      // Auto-save timeline to disk if there are markers
      const currentScript = scripts.find(s => s.id === currentScriptId);
      console.log('🔍 Checking auto-save:', {
        hasScript: !!currentScript,
        hasMarkers: currentScript?.markers?.length > 0,
        markerCount: currentScript?.markers?.length || 0,
        scriptName: currentScript?.name
      });

      if (currentScript && currentScript.markers && currentScript.markers.length > 0) {
        console.log('✅ Triggering auto-save for:', currentScript.name);
        autoSaveTimelineToFile(currentScript);
      } else {
        console.log('⏭️ Skipping auto-save (no markers)');
      }

      // Switch to new script
      currentScriptId = scriptId;
      const script = scripts.find(s => s.id === scriptId);

      if (script) {
        // Load script content
        scriptText.value = script.content;
        cueMarkers = script.cueMarkers || [];

        // Load script markers
        problemMarkers = script.markers ? [...script.markers] : [];
        console.log(`📂 Loaded ${problemMarkers.length} markers for script "${script.name}"`);

        // Update UI
        updateScriptTabs();
        updateCharCount();
        renderCueList();
        sendScript();
        updateMonitorText();
        updateMonitorPosition({ percent: 0 });

        // Update file name display
        fileName.textContent = script.name;

        // Update marker timeline UI
        updateMarkerTimeline();

        // Reset script timer
        if (isRecording) {
          scriptStartTime = Date.now();
        }
      }
    }

    function saveCurrentScriptState() {
      const script = scripts.find(s => s.id === currentScriptId);
      if (script) {
        script.content = scriptText.value;
        script.cueMarkers = cueMarkers;
        // Save current problemMarkers to this script
        script.markers = [...problemMarkers]; // Create a copy
        console.log(`💾 Saved ${problemMarkers.length} markers for script "${script.name}"`);
      }
    }

    function addNewScript() {
      const scriptId = `script-${nextScriptId++}`;
      scripts.push({
        id: scriptId,
        name: `Script ${nextScriptId}`,
        content: '',
        cueMarkers: [],
        markers: [],
        completed: false
      });

      updateScriptTabs();
      switchToScript(scriptId);
    }

    function removeScript(scriptId) {
      if (scripts.length <= 1) {
        alert('Cannot remove the last script');
        return;
      }

      const index = scripts.findIndex(s => s.id === scriptId);
      if (index !== -1) {
        scripts.splice(index, 1);

        // Switch to another script
        if (currentScriptId === scriptId) {
          const newScript = scripts[Math.max(0, index - 1)];
          switchToScript(newScript.id);
        }

        updateScriptTabs();
      }
    }

    // Edit script name (using modal instead of prompt)
    function editScriptName(scriptId) {
      console.log('editScriptName called for:', scriptId);
      const script = scripts.find(s => s.id === scriptId);
      if (!script) {
        console.error('Script not found:', scriptId);
        return;
      }

      // Show modal
      const modal = document.getElementById('renameModal');
      const input = document.getElementById('renameInput');
      const saveBtn = document.getElementById('renameSaveBtn');
      const cancelBtn = document.getElementById('renameCancelBtn');

      console.log('🔍 Modal elements found:', { modal: !!modal, input: !!input, saveBtn: !!saveBtn, cancelBtn: !!cancelBtn });

      if (!modal || !input || !saveBtn || !cancelBtn) {
        console.error('❌ Modal elements missing! Cannot show rename dialog.');
        alert('Rename modal not loaded. Please refresh the page.');
        return;
      }

      console.log('✅ Showing rename modal');
      input.value = script.name;
      modal.classList.add('visible');
      setTimeout(() => {
        input.focus();
        input.select();
      }, 50);

      // Handle save
      const handleSave = () => {
        const newName = input.value.trim();
        if (newName !== '') {
          script.name = newName;
          updateScriptTabs();
          if (scriptId === currentScriptId) {
            fileName.textContent = script.name;
          }
          console.log('Script renamed to:', script.name);
        }
        modal.classList.remove('visible');
        cleanup();
      };

      const handleCancel = () => {
        modal.classList.remove('visible');
        cleanup();
      };

      const cleanup = () => {
        saveBtn.removeEventListener('click', handleSave);
        cancelBtn.removeEventListener('click', handleCancel);
        input.removeEventListener('keydown', handleKeyDown);
        modal.removeEventListener('click', handleOverlayClick);
      };

      const handleKeyDown = (e) => {
        if (e.key === 'Enter') handleSave();
        else if (e.key === 'Escape') handleCancel();
      };

      const handleOverlayClick = (e) => {
        if (e.target === modal) handleCancel();
      };

      saveBtn.addEventListener('click', handleSave);
      cancelBtn.addEventListener('click', handleCancel);
      input.addEventListener('keydown', handleKeyDown);
      modal.addEventListener('click', handleOverlayClick);
    }

    function updateScriptTabs() {
      const tabsContainer = scriptTabs.querySelector('.script-tabs') || scriptTabs;

      // Clear existing tabs except add button
      const existingTabs = tabsContainer.querySelectorAll('.script-tab');
      existingTabs.forEach(tab => tab.remove());

      // Create tabs for each script
      scripts.forEach(script => {
        const tab = document.createElement('div');
        tab.className = `script-tab${script.id === currentScriptId ? ' active' : ''}`;
        tab.dataset.scriptId = script.id;

        // Check if has markers
        if (script.markers && script.markers.length > 0) {
          tab.classList.add('has-markers');
        }
        if (script.completed) {
          tab.classList.add('completed');
        }

        tab.innerHTML = `
          <span class="script-tab-name">${script.name}</span>
          <button class="script-tab-edit" title="Rename script">
            <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          </button>
          <div class="script-tab-status"></div>
          <button class="script-tab-close" onclick="event.stopPropagation();">
            <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        `;

        // Edit button click to rename
        const editBtn = tab.querySelector('.script-tab-edit');
        if (editBtn) {
          editBtn.addEventListener('click', (e) => {
            console.log('Edit button clicked:', script.id);
            e.stopPropagation();
            editScriptName(script.id);
          });
        } else {
          console.error('Edit button not found for script:', script.id);
        }

        // Tab click switches script (but not if clicking on edit/close buttons)
        tab.addEventListener('click', (e) => {
          const isButton = e.target.closest('.script-tab-edit, .script-tab-close');
          if (!isButton) {
            switchToScript(script.id);
          }
        });

        tab.querySelector('.script-tab-close').addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm(`Remove "${script.name}"?`)) {
            removeScript(script.id);
          }
        });

        tabsContainer.insertBefore(tab, addScriptTab);
      });
    }

    // Add script tab click handler
    addScriptTab.addEventListener('click', addNewScript);

    // ============================================
    // PROBLEM MARKERS WITH TIMESTAMPS
    // ============================================

    function addProblemMarker(type, autoNote = null) {
      console.log('📌 addProblemMarker called:', { type, autoNote, isRecording });

      if (!isRecording) {
        startRecording();
      }

      const currentScript = scripts.find(s => s.id === currentScriptId);
      if (!currentScript) {
        console.error('❌ No current script found');
        return;
      }

      // For note type, show modal first (unless it's an automatic note)
      if (type === 'note' && !autoNote) {
        console.log('📝 Showing note modal for manual note');
        showNoteModal();
        return;
      }

      // For retake type, show modal first (unless it's an automatic retake)
      if (type === 'retake' && !autoNote) {
        console.log('🔴 Showing retake modal');
        showRetakeModal();
        return;
      }

      console.log('✅ Creating marker with autoNote:', autoNote);

      // For other types (playback-started, playback-stopped), create marker immediately
      // If autoNote is provided (for automatic markers), use it
      createMarker(type, autoNote || '', null);
    }

    function createMarker(type, note, slideNumber) {
      const currentScript = scripts.find(s => s.id === currentScriptId);
      if (!currentScript) return;

      const sessionTime = sessionStartTime ? Date.now() - sessionStartTime : 0;
      const scriptTime = scriptStartTime ? Date.now() - scriptStartTime : 0;

      const marker = {
        id: Date.now().toString(),
        type: type,
        timestamp: Date.now(),
        sessionTime: sessionTime,
        scriptTime: scriptTime,
        scriptId: currentScriptId,
        scriptName: currentScript.name,
        position: monitorPosition,
        note: note || '',
        slideNumber: slideNumber
      };

      problemMarkers.push(marker);
      currentScript.markers = currentScript.markers || [];
      currentScript.markers.push(marker);

      console.log('✅ Marker added:', {
        type: marker.type,
        slideNumber: marker.slideNumber,
        scriptTime: formatTime(marker.scriptTime),
        sessionTime: formatTime(marker.sessionTime),
        note: marker.note,
        totalMarkers: problemMarkers.length
      });

      updateScriptTabs();
      updateMarkerTimeline();
      showMarkerFeedback(type);

      // Auto-backup timeline after each marker is added
      autoBackupTimeline();
    }

    // Auto-backup timeline to history folder
    async function autoBackupTimeline() {
      if (problemMarkers.length === 0) return;

      try {
        // Generate timeline content
        let output = `TELEPROMPTER EDITING GUIDE\n`;
        output += `${'='.repeat(60)}\n`;
        output += `Session: ${sessionId}\n`;
        output += `Auto-backup: ${new Date().toLocaleString()}\n`;
        output += `${'='.repeat(60)}\n\n`;

        // Group markers by script
        scripts.forEach(script => {
          const scriptMarkers = problemMarkers.filter(m => m.scriptId === script.id);
          if (scriptMarkers.length === 0) return;

          output += `SCRIPT: ${script.name}\n`;
          output += `${'-'.repeat(40)}\n`;

          const sortedMarkers = [...scriptMarkers].sort((a, b) => a.scriptTime - b.scriptTime);
          sortedMarkers.forEach(marker => {
            const emoji = { 'retake': '🔴', 'stumble': '⚠️', 'note': '📝', 'playback-started': '▶️', 'playback-stopped': '⏸️' };
            output += `${formatTime(marker.scriptTime)} - ${emoji[marker.type] || marker.type.toUpperCase()}`;
            if (marker.note) output += ` - "${marker.note}"`;
            output += `\n`;
          });
          output += `\n`;
        });

        // Summary
        output += `${'='.repeat(60)}\n`;
        output += `SUMMARY: ${problemMarkers.length} markers total\n`;
        output += `${'='.repeat(60)}\n`;

        // Send to main process for backup
        await ipcRenderer.invoke('backup-timeline', { content: output, sessionId });
      } catch (err) {
        console.error('Auto-backup failed:', err);
      }
    }

    function showNoteModal() {
      const modal = document.getElementById('noteModal');
      const input = document.getElementById('noteInput');
      const saveBtn = document.getElementById('noteSaveBtn');
      const cancelBtn = document.getElementById('noteCancelBtn');

      input.value = '';
      modal.classList.add('visible');
      setTimeout(() => {
        input.focus();
      }, 50);

      const handleSave = () => {
        const note = input.value.trim();
        if (note) {
          createMarker('note', note, null);
        }
        modal.classList.remove('visible');
        cleanup();
      };

      const handleCancel = () => {
        modal.classList.remove('visible');
        cleanup();
      };

      const cleanup = () => {
        saveBtn.removeEventListener('click', handleSave);
        cancelBtn.removeEventListener('click', handleCancel);
        input.removeEventListener('keydown', handleKeyDown);
        modal.removeEventListener('click', handleOverlayClick);
      };

      const handleKeyDown = (e) => {
        if (e.key === 'Enter') handleSave();
        else if (e.key === 'Escape') handleCancel();
      };

      const handleOverlayClick = (e) => {
        if (e.target === modal) handleCancel();
      };

      saveBtn.addEventListener('click', handleSave);
      cancelBtn.addEventListener('click', handleCancel);
      input.addEventListener('keydown', handleKeyDown);
      modal.addEventListener('click', handleOverlayClick);
    }

    function showRetakeModal() {
      // Auto-pause teleprompter when marking retake
      if (isPlaying) {
        console.log('🔴 Retake clicked - auto-pausing teleprompter');
        isPlaying = false;
        cancelMonitorCountdown();
        updatePlayButton();
        sendPlaybackState();

        // Add automatic "Playback Stopped" marker for video editing
        if (isRecording) {
          addProblemMarker('playback-stopped', '⏸️ Playback Stopped');
        }
      }

      const modal = document.getElementById('retakeModal');
      const input = document.getElementById('retakeInput');
      const saveBtn = document.getElementById('retakeSaveBtn');
      const cancelBtn = document.getElementById('retakeCancelBtn');

      input.value = '';
      modal.classList.add('visible');
      setTimeout(() => {
        input.focus();
      }, 50);

      const handleSave = () => {
        const startingAt = input.value.trim();
        if (startingAt) {
          createMarker('retake', `Starting at: ${startingAt}`, null);
        } else {
          // If no starting point provided, just mark as retake without location
          createMarker('retake', 'Retake needed', null);
        }
        modal.classList.remove('visible');
        cleanup();
      };

      const handleCancel = () => {
        modal.classList.remove('visible');
        cleanup();
      };

      const cleanup = () => {
        saveBtn.removeEventListener('click', handleSave);
        cancelBtn.removeEventListener('click', handleCancel);
        input.removeEventListener('keydown', handleKeyDown);
        modal.removeEventListener('click', handleOverlayClick);
      };

      const handleKeyDown = (e) => {
        if (e.key === 'Enter') handleSave();
        else if (e.key === 'Escape') handleCancel();
      };

      const handleOverlayClick = (e) => {
        if (e.target === modal) handleCancel();
      };

      saveBtn.addEventListener('click', handleSave);
      cancelBtn.addEventListener('click', handleCancel);
      input.addEventListener('keydown', handleKeyDown);
      modal.addEventListener('click', handleOverlayClick);
    }

    function showMarkerFeedback(type) {
      const emoji = {
        'retake': '🔴',
        'stumble': '⚠️',
        'note': '📝',
        'playback-started': '▶️',
        'playback-stopped': '⏸️'
      };

      console.log(`${emoji[type] || '•'} ${type.toUpperCase()} marker at ${formatTime(scriptStartTime ? Date.now() - scriptStartTime : 0)}`);
    }

    // Marker button handlers (inline recording section)
    inlineMarkerRetake.addEventListener('click', () => addProblemMarker('retake'));
    inlineMarkerStumble.addEventListener('click', () => addProblemMarker('stumble'));
    inlineMarkerNote.addEventListener('click', () => addProblemMarker('note'));

    // Timeline marker button handlers
    timelineMarkerRetake.addEventListener('click', () => addProblemMarker('retake'));
    timelineMarkerStumble.addEventListener('click', () => addProblemMarker('stumble'));
    timelineMarkerNote.addEventListener('click', () => addProblemMarker('note'));

    // ============================================
    // RECORDING TIMER
    // ============================================

    function startRecording() {
      if (isRecording) {
        console.log('Recording already active');
        return;
      }

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

      // Show UI elements
      recordingSection.style.display = 'block';
      headerRecordingTimer.style.display = 'flex';
      controlPanelHeader.style.display = 'flex';
      showTimeline(); // Switch to timeline view

      // Enable timeline marker buttons
      timelineMarkerRetake.disabled = false;
      timelineMarkerStumble.disabled = false;
      timelineMarkerNote.disabled = false;
      console.log('Recording UI elements shown');

      // Start timer
      timerInterval = setInterval(updateTimers, 1000);
      updateTimers();
      updateMarkerTimeline();
      console.log('Recording started - Session ID:', sessionId);
    }

    function stopRecording() {
      console.log('⏹️ Stopping recording session...');
      isRecording = false;

      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }

      // Update button UI
      toggleRecordingBtn.innerHTML = `
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>
        Start Recording
      `;
      toggleRecordingBtn.classList.remove('danger');
      toggleRecordingBtn.classList.add('success');

      // Hide UI elements and switch back to controls
      recordingSection.style.display = 'none';
      headerRecordingTimer.style.display = 'none';
      controlPanelHeader.style.display = 'none';
      showControls(); // Switch back to controls view

      // Disable timeline marker buttons
      timelineMarkerRetake.disabled = true;
      timelineMarkerStumble.disabled = true;
      timelineMarkerNote.disabled = true;
      console.log('Recording stopped. Total markers:', problemMarkers.length);

      // Show export reminder modal
      showExportTimelineReminder();
    }

    function updateTimers() {
      if (!isRecording) return;

      const sessionTime = sessionStartTime ? Date.now() - sessionStartTime : 0;

      headerSessionTimer.textContent = formatTime(sessionTime);
      inlineSessionTimer.textContent = formatTime(sessionTime);
    }

    function formatTime(ms) {
      const seconds = Math.floor(ms / 1000);
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    function formatTimeShort(ms) {
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    // ============================================
    // MARKER TIMELINE UI
    // ============================================

    function updateMarkerTimeline() {
      // Update stats
      markerCount.textContent = `${problemMarkers.length} marker${problemMarkers.length !== 1 ? 's' : ''}`;
      if (sessionStartTime) {
        markerDuration.textContent = formatTime(Date.now() - sessionStartTime);
      }

      // Sort markers by session time
      const sortedMarkers = [...problemMarkers].sort((a, b) => a.sessionTime - b.sessionTime);

      // Clear content
      markerTimelineContent.innerHTML = '';

      if (sortedMarkers.length === 0) {
        // Show empty state
        markerTimelineContent.innerHTML = `
          <div class="marker-timeline-empty">
            <svg viewBox="0 0 24 24" style="width: 48px; height: 48px; opacity: 0.3; margin-bottom: 12px;">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            <p>No markers yet</p>
            <span>Click marker buttons below to add timestamps</span>
          </div>
        `;
        return;
      }

      // Render markers
      sortedMarkers.forEach(marker => {
        const item = document.createElement('div');
        item.className = 'marker-timeline-item';
        item.dataset.markerId = marker.id;

        const emoji = {
          'retake': '🔴',
          'stumble': '⚠️',
          'note': '📝',
          'playback-started': '▶️',
          'playback-stopped': '⏸️'
        };

        const typeClass = marker.type;
        const typeName = marker.type.replace('-', ' ').toUpperCase();

        let detailsHTML = '';
        if (marker.slideNumber) {
          detailsHTML = `<div class="marker-item-details">Slide ${marker.slideNumber}</div>`;
        }
        if (marker.note && marker.type !== 'slide-change') {
          detailsHTML += `<div class="marker-item-note">${marker.note}</div>`;
        }

        item.innerHTML = `
          <div class="marker-item-header">
            <span class="marker-item-icon">${emoji[marker.type] || '•'}</span>
            <span class="marker-item-type ${typeClass}">${typeName}</span>
            <span class="marker-item-time">${formatTime(marker.scriptTime)}</span>
          </div>
          ${detailsHTML}
          <div class="marker-item-script">
            <svg viewBox="0 0 24 24" style="width: 12px; height: 12px; fill: currentColor;">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
            </svg>
            ${marker.scriptName}
          </div>
        `;

        markerTimelineContent.appendChild(item);
      });
    }

    // ============================================
    // CONTROL PANEL / TIMELINE TOGGLE
    // ============================================

    function showTimeline() {
      markerTimeline.classList.add('active');
      // Hide control panel header (it has "Show Timeline" button - not needed when timeline is visible)
      // The timeline has its own header with "Show Controls" button
      controlPanelHeader.style.display = 'none';
      document.querySelectorAll('.control-section').forEach(section => {
        section.style.display = 'none';
      });
      document.querySelector('.keyboard-hints').style.display = 'none';
    }

    function showControls() {
      markerTimeline.classList.remove('active');
      // Show control panel header (it has "Show Timeline" button)
      controlPanelHeader.style.display = 'flex';
      document.querySelectorAll('.control-section').forEach(section => {
        section.style.display = 'block';
      });
      document.querySelector('.keyboard-hints').style.display = 'block';
    }

    // Toggle buttons
    showTimelineBtn.addEventListener('click', showTimeline);
    showControlsBtn.addEventListener('click', showControls);

    // ============================================
    // AUTO-SAVE SYSTEM
    // ============================================

    function startAutoSave() {
      if (autoSaveInterval) return;

      autoSaveInterval = setInterval(performAutoSave, AUTOSAVE_INTERVAL);
    }

    async function performAutoSave() {
      // Save current state
      saveCurrentScriptState();

      // Show saving indicator
      autosaveIndicator.classList.add('saving');
      autosaveSpinner.style.display = 'block';
      autosaveCheckmark.style.display = 'none';
      autosaveText.textContent = 'Auto-saving...';

      // Create autosave data
      const autosaveData = {
        timestamp: Date.now(),
        sessionId: sessionId,
        scripts: scripts,
        problemMarkers: problemMarkers,
        currentScriptId: currentScriptId
      };

      try {
        // Save to file
        const result = await ipcRenderer.invoke('autosave-session', autosaveData);

        if (result.success) {
          // Show success
          autosaveSpinner.style.display = 'none';
          autosaveCheckmark.style.display = 'inline';
          autosaveText.textContent = 'Saved';

          // Hide after 2 seconds
          setTimeout(() => {
            autosaveIndicator.classList.remove('saving');
          }, 2000);
        }
      } catch (error) {
        console.error('Auto-save failed:', error);
        autosaveIndicator.classList.remove('saving');
      }
    }

    // Start auto-save on load
    startAutoSave();

    // ============================================
    // RECORDING TOGGLE
    // ============================================

    const toggleRecordingBtn = document.getElementById('toggleRecordingBtn');

    toggleRecordingBtn.addEventListener('click', () => {
      if (isRecording) {
        // Show confirmation modal before stopping
        showStopRecordingConfirmation();
      } else {
        startRecording();
      }
    });

    function showStopRecordingConfirmation() {
      const modal = document.getElementById('stopRecordingModal');
      const confirmBtn = document.getElementById('stopRecordingConfirmBtn');
      const cancelBtn = document.getElementById('stopRecordingCancelBtn');

      modal.classList.add('visible');

      const handleConfirm = () => {
        modal.classList.remove('visible');
        cleanup();
        stopRecording();
      };

      const handleCancel = () => {
        modal.classList.remove('visible');
        cleanup();
      };

      const cleanup = () => {
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
        modal.removeEventListener('click', handleOverlayClick);
      };

      const handleOverlayClick = (e) => {
        if (e.target === modal) handleCancel();
      };

      confirmBtn.addEventListener('click', handleConfirm);
      cancelBtn.addEventListener('click', handleCancel);
      modal.addEventListener('click', handleOverlayClick);
    }

    function showExportTimelineReminder() {
      const modal = document.getElementById('exportTimelineReminderModal');
      const exportBtn = document.getElementById('exportReminderExportBtn');
      const laterBtn = document.getElementById('exportReminderLaterBtn');
      const markerCountEl = document.getElementById('exportReminderMarkerCount');
      const durationEl = document.getElementById('exportReminderDuration');

      // Calculate total session time
      const totalSessionTime = sessionStartTime ? Date.now() - sessionStartTime : 0;

      // Update summary
      markerCountEl.textContent = `${problemMarkers.length} marker${problemMarkers.length !== 1 ? 's' : ''}`;
      durationEl.textContent = formatTime(totalSessionTime);

      modal.classList.add('visible');

      const handleExport = () => {
        modal.classList.remove('visible');
        cleanup();
        // Trigger the export guide button
        document.getElementById('exportGuideBtn').click();
      };

      const handleLater = () => {
        modal.classList.remove('visible');
        cleanup();
      };

      const cleanup = () => {
        exportBtn.removeEventListener('click', handleExport);
        laterBtn.removeEventListener('click', handleLater);
        modal.removeEventListener('click', handleOverlayClick);
      };

      const handleOverlayClick = (e) => {
        if (e.target === modal) handleLater();
      };

      exportBtn.addEventListener('click', handleExport);
      laterBtn.addEventListener('click', handleLater);
      modal.addEventListener('click', handleOverlayClick);
    }

    // ============================================
    // AUTO-SAVE TIMELINE TO FILE
    // ============================================

    async function autoSaveTimelineToFile(script) {
      if (!script || !script.markers || script.markers.length === 0) {
        return;
      }

      console.log(`💾 Auto-saving timeline for "${script.name}" with ${script.markers.length} markers...`);

      // Generate timeline content
      let output = '';
      output += `Timeline Auto-Save - ${script.name}\n`;
      output += `Session: ${sessionId}\n`;
      output += `Saved: ${new Date().toLocaleString()}\n`;
      output += `\n${'='.repeat(60)}\n\n`;

      // Sort markers by time
      const sortedMarkers = [...script.markers].sort((a, b) => a.scriptTime - b.scriptTime);

      sortedMarkers.forEach(marker => {
        const emoji = {
          'retake': '🔴 RETAKE',
          'stumble': '⚠️ STUMBLE',
          'note': '📝 NOTE',
          'playback-started': '▶️ PLAYBACK STARTED',
          'playback-stopped': '⏸️ PLAYBACK STOPPED'
        };

        output += `${formatTime(marker.scriptTime)} - ${emoji[marker.type] || marker.type.toUpperCase()}`;
        if (marker.note) {
          output += ` - "${marker.note}"`;
        }
        output += `\n`;
      });

      output += `\n`;

      // Summary
      const retakes = sortedMarkers.filter(m => m.type === 'retake').length;
      const stumbles = sortedMarkers.filter(m => m.type === 'stumble').length;
      const notes = sortedMarkers.filter(m => m.type === 'note').length;
      const playbackStarts = sortedMarkers.filter(m => m.type === 'playback-started').length;

      output += `${'-'.repeat(60)}\n`;
      output += `Summary:\n`;
      output += `- Retakes Marked: ${retakes}\n`;
      output += `- Stumbles Marked: ${stumbles}\n`;
      output += `- Notes: ${notes}\n`;
      output += `- Playback Segments: ${playbackStarts}\n`;
      output += `- Total Markers: ${sortedMarkers.length}\n`;

      // Save to file via IPC
      try {
        const fileName = `${script.name.replace(/[^a-zA-Z0-9]/g, '_')}_timeline_${sessionId}`;
        const result = await ipcRenderer.invoke('autosave-timeline', {
          content: output,
          fileName: fileName,
          scriptId: script.id
        });

        if (result.success) {
          console.log(`✅ Timeline auto-saved to: ${result.path}`);
          showAutoSaveNotification(script.name);
        }
      } catch (error) {
        console.error('❌ Auto-save failed:', error);
      }
    }

    function showAutoSaveNotification(scriptName) {
      // Create a subtle notification that fades out
      const notification = document.createElement('div');
      notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: var(--success);
        color: white;
        padding: 12px 20px;
        border-radius: var(--radius-md);
        font-size: 12px;
        font-weight: 600;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        opacity: 0;
        transition: opacity 0.3s ease;
      `;
      notification.textContent = `✓ Timeline auto-saved for "${scriptName}"`;
      document.body.appendChild(notification);

      // Fade in
      setTimeout(() => {
        notification.style.opacity = '1';
      }, 10);

      // Fade out and remove after 3 seconds
      setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
          document.body.removeChild(notification);
        }, 300);
      }, 3000);
    }

    // ============================================
    // EXPORT EDITING GUIDE
    // ============================================

    const exportGuideBtn = document.getElementById('exportGuideBtn');

    exportGuideBtn.addEventListener('click', async () => {
      // Save current state
      saveCurrentScriptState();

      // Show export options
      const format = await showExportDialog();
      if (!format) return;

      if (format === 'txt') {
        exportAsText();
      } else if (format === 'csv') {
        exportAsCSV();
      }
    });

    async function showExportDialog() {
      return new Promise((resolve) => {
        const modal = document.getElementById('exportModal');
        const txtBtn = document.getElementById('exportTxtBtn');
        const csvBtn = document.getElementById('exportCsvBtn');
        const cancelBtn = document.getElementById('exportCancelBtn');

        modal.classList.add('visible');

        const handleTxt = () => {
          modal.classList.remove('visible');
          cleanup();
          resolve('txt');
        };

        const handleCsv = () => {
          modal.classList.remove('visible');
          cleanup();
          resolve('csv');
        };

        const handleCancel = () => {
          modal.classList.remove('visible');
          cleanup();
          resolve(null);
        };

        const cleanup = () => {
          txtBtn.removeEventListener('click', handleTxt);
          csvBtn.removeEventListener('click', handleCsv);
          cancelBtn.removeEventListener('click', handleCancel);
          modal.removeEventListener('click', handleOverlayClick);
        };

        const handleOverlayClick = (e) => {
          if (e.target === modal) handleCancel();
        };

        txtBtn.addEventListener('click', handleTxt);
        csvBtn.addEventListener('click', handleCsv);
        cancelBtn.addEventListener('click', handleCancel);
        modal.addEventListener('click', handleOverlayClick);
      });
    }

    async function exportAsText() {
      let output = '';
      output += `Video Editing Guide - ${new Date().toLocaleDateString()}\n`;
      output += `Session: ${sessionId}\n`;
      output += `Generated: ${new Date().toLocaleString()}\n`;
      output += `\n${'='.repeat(60)}\n\n`;

      // Group markers by script
      scripts.forEach(script => {
        if (!script.markers || script.markers.length === 0) return;

        output += `Script: ${script.name}\n`;
        output += `${'-'.repeat(60)}\n`;

        // Sort markers by time
        const sortedMarkers = [...script.markers].sort((a, b) => a.scriptTime - b.scriptTime);

        sortedMarkers.forEach(marker => {
          const emoji = {
            'retake': '🔴 RETAKE',
            'stumble': '⚠️ STUMBLE',
            'note': '📝 NOTE',
            'playback-started': '▶️ PLAYBACK STARTED',
            'playback-stopped': '⏸️ PLAYBACK STOPPED'
          };

          output += `${formatTime(marker.scriptTime)} - ${emoji[marker.type] || marker.type.toUpperCase()}`;
          if (marker.note) {
            output += ` - "${marker.note}"`;
          }
          output += `\n`;
        });

        output += `\n`;
      });

      // Summary
      const retakes = problemMarkers.filter(m => m.type === 'retake').length;
      const stumbles = problemMarkers.filter(m => m.type === 'stumble').length;
      const notes = problemMarkers.filter(m => m.type === 'note').length;
      const playbackStarts = problemMarkers.filter(m => m.type === 'playback-started').length;
      const playbackStops = problemMarkers.filter(m => m.type === 'playback-stopped').length;

      output += `${'='.repeat(60)}\n`;
      output += `SUMMARY:\n`;
      output += `- Scripts: ${scripts.length}\n`;
      output += `- Retakes Marked: ${retakes}\n`;
      output += `- Stumbles Marked: ${stumbles}\n`;
      output += `- Notes: ${notes}\n`;
      output += `- Playback Segments: ${playbackStarts}\n`;
      if (sessionStartTime) {
        output += `- Total Duration: ${formatTime(Date.now() - sessionStartTime)}\n`;
      }
      output += `${'='.repeat(60)}\n`;

      // Save file
      const result = await ipcRenderer.invoke('save-text-file', {
        content: output,
        defaultName: `Editing-Guide-${Date.now()}.txt`
      });

      if (result.success) {
        alert(`Guide exported to:\n${result.filePath}`);
      }
    }

    async function exportAsCSV() {
      let csv = 'Script,Timestamp,Type,Position,Note\n';

      // Sort markers by time
      const sortedMarkers = [...problemMarkers].sort((a, b) => a.sessionTime - b.sessionTime);

      sortedMarkers.forEach(marker => {
        const script = scripts.find(s => s.id === marker.scriptId);
        const scriptName = script ? script.name : 'Unknown';
        const timestamp = formatTime(marker.scriptTime);
        const type = marker.type.toUpperCase();
        const position = `${marker.position.toFixed(1)}%`;
        const note = `"${(marker.note || '').replace(/"/g, '""')}"`;

        csv += `"${scriptName}",${timestamp},${type},${position},${note}\n`;
      });

      // Save file
      const result = await ipcRenderer.invoke('save-text-file', {
        content: csv,
        defaultName: `Editing-Guide-${Date.now()}.csv`
      });

      if (result.success) {
        alert(`Guide exported to:\n${result.filePath}`);
      }
    }

    // Initialize tabs on load
    updateScriptTabs();

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
      // Cancel any running monitor scroll animation when switching away from monitor view
      if (scrollAnimationId) {
        cancelAnimationFrame(scrollAnimationId);
        scrollAnimationId = null;
      }
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

    // Settings tab switching with dropdown
    const settingsTabSelect = document.getElementById('settingsTabSelect');
    if (settingsTabSelect) {
      settingsTabSelect.addEventListener('change', () => {
        const selectedTab = settingsTabSelect.value;
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById('tab-' + selectedTab).classList.add('active');
      });
    }

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
      // Save scroll position
      const scrollTop = scriptText.scrollTop;

      let cleaned = scriptText.value
        .replace(/\[.*?\]\s*/g, '') // Remove text in square brackets [like this] and trailing space
        .split('\n')
        .map(line => line.trimEnd()) // Remove trailing spaces from each line
        .join('\n')
        .replace(/\n{2,}/g, '\n') // Reduce 2+ newlines to 1
        .trim(); // Trim start and end

      setTextWithUndo(scriptText, cleaned);
      updateCharCount();
      sendScript();

      // Restore scroll position
      setTimeout(() => {
        scriptText.scrollTop = scrollTop;
      }, 0);
    });

    // Open file
    document.getElementById('openFileBtn').addEventListener('click', async () => {
      console.log('Open button clicked');
      try {
        console.log('Calling open-file-dialog...');
        const filePath = await ipcRenderer.invoke('open-file-dialog');
        console.log('File path returned:', filePath);
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
            updateMonitorPosition({ percent: 0 });
          } else {
            alert('Error reading file: ' + result.error);
          }
        }
      } catch (err) {
        console.error('Open file error:', err);
        alert('Error opening file: ' + err.message);
      }
    });

    // New script button removed (now using multi-script tabs with + button)

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

    // Send script to teleprompter (with optional initial position)
    function sendScript(includePosition = false) {
      const data = {
        text: scriptText.value,
        cueMarkers: cueMarkers
      };
      if (includePosition) {
        data.initialPosition = parseInt(positionSlider.value);
      }
      ipcRenderer.send('send-script', data);
    }

    // Open teleprompter display
    document.getElementById('openDisplayBtn').addEventListener('click', async () => {
      const displayId = displaySelect.value ? parseInt(displaySelect.value) : null;
      currentDisplayId = await ipcRenderer.invoke('open-teleprompter', displayId);
      setTimeout(() => {
        // Include initial position so display starts where monitor preview is
        sendScript(true);
        sendSettings();
      }, 500);
    });

    // Close teleprompter display
    document.getElementById('closeDisplayBtn').addEventListener('click', () => {
      ipcRenderer.invoke('close-teleprompter');
    });

    // Playback controls
    const headerPlayPauseBtn = document.getElementById('headerPlayPauseBtn');
    const headerPlayIcon = document.getElementById('headerPlayIcon');
    const headerPlayText = document.getElementById('headerPlayText');

    function updatePlayButton() {
      if (isPlaying) {
        headerPlayIcon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
        headerPlayText.textContent = 'Pause';
        headerPlayPauseBtn.classList.remove('primary');
        headerPlayPauseBtn.classList.add('success');
      } else {
        headerPlayIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
        headerPlayText.textContent = 'Play Teleprompter';
        headerPlayPauseBtn.classList.remove('success');
        headerPlayPauseBtn.classList.add('primary');
      }
      updateMonitorStatus();
    }

    headerPlayPauseBtn.addEventListener('click', async () => {
      console.log('🎮 Play button clicked. Current state:', {
        isPlaying,
        isRecording,
        countdownEnabled: countdownCheckbox.checked
      });

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
        // Start countdown on both teleprompter and monitor preview
        const seconds = parseInt(countdownSeconds.value);
        ipcRenderer.send('start-countdown', seconds);
        runMonitorCountdown(seconds);
        isPlaying = true;
        updatePlayButton();
        // Start recording session automatically
        startRecording();
        // Add automatic "Playback Started" marker immediately when countdown starts
        console.log('🎬 Adding auto playback started marker (countdown starting)');
        addProblemMarker('playback-started', '▶️ Playback Started');
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
        } else {
          console.log('▶️ Started playing - adding marker');
          // Start recording when playback starts
          if (!isRecording) {
            console.log('📹 Starting recording first');
            startRecording();
          }
          // Add automatic "Playback Started" marker for video editing
          console.log('🎬 Adding auto playback started marker');
          addProblemMarker('playback-started', '▶️ Playback Started');
        }
        updatePlayButton();
        // Always include position so playback continues from current spot
        sendPlaybackState(true);
      }
    });

    // Listen for countdown complete
    ipcRenderer.on('countdown-complete', () => {
      isPlaying = true;
      updatePlayButton();
      // Note: Marker already added when countdown started, no need for duplicate
      console.log('⏱️ Countdown complete - continuing playback');
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

    const positionValue = document.getElementById('positionValue');
    const findTextInput = document.getElementById('findTextInput');

    // Position control - update display and send to teleprompter
    positionSlider.addEventListener('input', () => {
      positionValue.textContent = positionSlider.value + '%';
      sendPlaybackState(true);
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
        // Calculate percentage based on line position for better accuracy
        const textBefore = scriptText.value.substring(0, cursorPos);
        const linesBefore = textBefore.split('\n').length;
        const totalLines = scriptText.value.split('\n').length;
        const percent = Math.min(100, Math.max(0, Math.round((linesBefore / totalLines) * 100)));

        positionSlider.value = percent;
        positionValue.textContent = percent + '%';

        // Also update monitor position
        targetPosition = percent;
        applyMonitorPosition(percent);
        monitorProgressBar.style.width = percent + '%';
        monitorPercent.textContent = percent + '%';

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
        if (index === lastFindIndex && scriptContent.indexOf(searchText, index + 1) === -1) {
          // Only one match exists, stay there
        }
      }

      if (index !== -1) {
        lastFindIndex = index;

        // Calculate percentage based on line position for better accuracy
        const textBefore = scriptText.value.substring(0, index);
        const linesBefore = textBefore.split('\n').length;
        const totalLines = scriptText.value.split('\n').length;
        const percent = Math.min(100, Math.max(0, Math.round((linesBefore / totalLines) * 100)));

        // Update position slider and teleprompter
        positionSlider.value = percent;
        positionValue.textContent = percent + '%';

        // Also update monitor position
        targetPosition = percent;
        applyMonitorPosition(percent);
        monitorProgressBar.style.width = percent + '%';
        monitorPercent.textContent = percent + '%';

        sendPlaybackState(true);

        // Highlight in editor and scroll to it
        scriptText.focus();
        scriptText.setSelectionRange(index, index + searchText.length);

        // Scroll textarea to show the selected text
        const lineHeight = parseInt(window.getComputedStyle(scriptText).lineHeight) || 24;
        const targetScroll = (linesBefore - 3) * lineHeight;
        scriptText.scrollTop = Math.max(0, targetScroll);

        // Show feedback
        findTextInput.style.borderColor = 'var(--success)';
        setTimeout(() => {
          findTextInput.style.borderColor = '';
        }, 500);
      } else {
        lastFindIndex = 0;
        // Show not found feedback
        findTextInput.style.borderColor = 'var(--danger)';
        setTimeout(() => {
          findTextInput.style.borderColor = '';
        }, 500);
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
    }

    // Update monitor preview settings to match teleprompter
    function updateMonitorSettings(settings) {
      // Just call updateMonitorScale which handles all settings
      updateMonitorScale();
    }

    fontFamilySelect.addEventListener('change', sendSettings);
    fontSizeInput.addEventListener('input', () => {
      fontSizeValue.textContent = fontSizeInput.value;
      sendSettings();
    });
    textColorInput.addEventListener('change', sendSettings);
    bgColorInput.addEventListener('change', sendSettings);
    mirrorCheckbox.addEventListener('change', sendSettings);
    flipCheckbox.addEventListener('change', sendSettings);

    // Toggle countdown seconds visibility based on checkbox
    countdownCheckbox.addEventListener('change', () => {
      countdownRow.style.display = countdownCheckbox.checked ? 'flex' : 'none';
    });
    // Initialize countdown row visibility
    countdownRow.style.display = countdownCheckbox.checked ? 'flex' : 'none';

    // Script text change
    scriptText.addEventListener('input', () => {
      clearTimeout(scriptText.sendTimeout);
      scriptText.sendTimeout = setTimeout(() => {
        sendScript();
        updateMonitorText();
      }, 500);
    });

    // Edit from monitor view
    let isMonitorEditing = false;
    const editFromMonitorBtn = document.getElementById('editFromMonitorBtn');

    editFromMonitorBtn.addEventListener('click', () => {
      isMonitorEditing = !isMonitorEditing;
      console.log('📝 Edit button clicked, isMonitorEditing:', isMonitorEditing);

      if (isMonitorEditing) {
        // Enable editing - convert HTML spans to plain text for proper editing
        const plainText = monitorScriptText.textContent;
        monitorScriptText.textContent = plainText; // Removes all span wrappers
        monitorScriptText.contentEditable = 'true';
        monitorScriptText.style.cursor = 'text';
        monitorScriptText.style.outline = '2px solid var(--accent-primary)';
        monitorScriptText.style.borderRadius = '4px';
        monitorScriptText.style.whiteSpace = 'pre-wrap'; // Preserve line breaks
        editFromMonitorBtn.classList.add('success');
        editFromMonitorBtn.innerHTML = '<svg viewBox="0 0 24 24" style="width: 12px; height: 12px;"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> Done';
        // Focus the text so user can start typing immediately
        monitorScriptText.focus();
        console.log('   Edit mode enabled, text converted to plain text');
      } else {
        // Disable editing and sync back to editor
        monitorScriptText.contentEditable = 'false';
        monitorScriptText.style.cursor = '';
        monitorScriptText.style.outline = '';
        monitorScriptText.style.whiteSpace = '';
        editFromMonitorBtn.classList.remove('success');
        editFromMonitorBtn.innerHTML = '<svg viewBox="0 0 24 24" style="width: 12px; height: 12px;"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg> Edit';

        // Sync edited content back to editor
        scriptText.value = monitorScriptText.textContent;
        updateCharCount();
        sendScript(); // This will re-wrap words in spans via updateMonitorPreview
        console.log('   Edit mode disabled, synced back to editor');
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

            // Scroll the selection into view (center it in the textarea)
            const textBeforeSelection = scriptText.value.substring(0, startIndex);
            const linesBefore = textBeforeSelection.split('\n').length;
            const lineHeight = parseInt(window.getComputedStyle(scriptText).lineHeight) || 20;
            const targetScroll = (linesBefore * lineHeight) - (scriptText.clientHeight / 2);
            scriptText.scrollTop = Math.max(0, targetScroll);
          }
        }
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
      console.log('🎹 Keydown:', e.code, 'Target:', e.target.tagName, 'ID:', e.target.id);

      // For spacebar, check if monitor view is active - if so, always trigger play/pause
      // (unless actively typing in find input, a modal input, or editing in monitor)
      if (e.code === 'Space') {
        const monitorActive = monitorView.classList.contains('active');
        const isInFindInput = e.target.id === 'findTextInput';
        const isInModalInput = e.target.closest('.modal-content');

        console.log('   Space pressed - Monitor active:', monitorActive, 'Find input:', isInFindInput, 'Modal:', !!isInModalInput, 'isMonitorEditing:', isMonitorEditing);

        // Allow spacebar for play/pause if monitor is active and not in specific inputs or editing
        if (monitorActive && !isInFindInput && !isInModalInput && !isMonitorEditing) {
          console.log('   ✅ Space key - triggering play/pause (monitor view active)');
          e.preventDefault();
          headerPlayPauseBtn.click();
          return;
        }
      }

      // Arrow keys for speed - ALWAYS work (except in textareas/contentEditable where vertical nav matters)
      if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        // Skip only for textarea and contentEditable
        if (e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
          return;
        }

        e.preventDefault();
        if (e.code === 'ArrowUp') {
          speedSlider.value = Math.min(100, parseInt(speedSlider.value) + 5);
        } else {
          speedSlider.value = Math.max(1, parseInt(speedSlider.value) - 5);
        }
        speedValue.textContent = speedSlider.value;
        // Only send speed update, not playback state change (to avoid interrupting countdown)
        ipcRenderer.send('speed-update', { speed: parseInt(speedSlider.value) });
        return;
      }

      // Skip other shortcuts when typing in any input field
      if (e.target === scriptText) {
        console.log('   Skipping - scriptText focused');
        return;
      }
      if (e.target.isContentEditable) {
        console.log('   Skipping - contentEditable focused');
        return;
      }
      if (e.target.tagName === 'INPUT') {
        console.log('   Skipping - INPUT focused');
        return;
      }
      if (e.target.tagName === 'TEXTAREA') {
        console.log('   Skipping - TEXTAREA focused');
        return;
      }

      if (e.code === 'Space') {
        console.log('   ✅ Space key - triggering play/pause');
        e.preventDefault();
        headerPlayPauseBtn.click();
      } else if (e.code === 'Home') {
        e.preventDefault();
        document.getElementById('jumpStartBtn').click();
      } else if (e.code === 'End') {
        e.preventDefault();
        document.getElementById('jumpEndBtn').click();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        ipcRenderer.invoke('close-teleprompter');
      }
    });


    // Smooth scroll in monitor viewport to change position
    // Initialize position from slider (variables declared at top of file)
    targetPosition = parseFloat(positionSlider.value) || 0;
    currentDisplayPosition = targetPosition;

    function animateScroll() {
      const diff = targetPosition - currentDisplayPosition;
      if (Math.abs(diff) < 0.01) {
        // Close enough, snap to target
        currentDisplayPosition = targetPosition;
        scrollAnimationId = null;
      } else {
        // Ease toward target (0.15 = smoothing factor, lower = smoother)
        currentDisplayPosition += diff * 0.15;
        scrollAnimationId = requestAnimationFrame(animateScroll);
      }

      // Update display
      const displayPos = Math.min(100, Math.max(0, currentDisplayPosition));
      positionSlider.value = displayPos;
      positionValue.textContent = Math.round(displayPos) + '%';
      applyMonitorPosition(displayPos);
      monitorProgressBar.style.width = displayPos + '%';
      monitorPercent.textContent = Math.round(displayPos) + '%';
    }

    monitorContainer.addEventListener('wheel', (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Skip if no actual scroll movement
      if (e.deltaY === 0) return;

      // Accumulate scroll input toward target position
      // Lower sensitivity = less touchy scrolling
      const sensitivity = 0.03;
      const maxDelta = 1.5;
      const rawDelta = e.deltaY * sensitivity;
      const delta = Math.sign(rawDelta) * Math.min(Math.abs(rawDelta), maxDelta);
      targetPosition = Math.min(100, Math.max(0, targetPosition + delta));

      // Start animation if not already running
      if (!scrollAnimationId) {
        scrollAnimationId = requestAnimationFrame(animateScroll);
      }

      // Debounce sending to teleprompter
      clearTimeout(monitorContainer.scrollTimeout);
      monitorContainer.scrollTimeout = setTimeout(() => {
        sendPlaybackState(true);
      }, 100);
    }, { passive: false });

    // Click on monitor to enable keyboard shortcuts (blur any focused inputs)
    // But NOT when editing in monitor view
    monitorContainer.addEventListener('click', (e) => {
      // Skip if in edit mode or clicking on editable text
      if (isMonitorEditing) return;
      if (e.target.id === 'monitorScriptText') return;
      if (e.target.closest('#monitorScriptText')) return;

      // Only blur if clicking on the container itself or its children (not buttons/controls)
      if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT') {
        document.activeElement.blur();
        console.log('🎯 Monitor clicked - inputs blurred for keyboard shortcuts');
      }
    });

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
      console.log('🔘 Update button clicked, state:', updateState);
      if (updateState === 'available') {
        // Immediately show downloading state
        updateState = 'downloading';
        updateActionBtn.textContent = 'Downloading...';
        updateActionBtn.disabled = true;
        updateText.innerHTML = 'Starting download...';

        console.log('   Requesting download...');
        const result = await ipcRenderer.invoke('download-update');
        console.log('   Download request result:', result);

        if (result && result.error) {
          // Reset on error
          updateState = 'available';
          updateActionBtn.textContent = 'Download';
          updateActionBtn.disabled = false;
          updateText.innerHTML = 'Download failed: ' + result.error;
        }
      } else if (updateState === 'downloaded') {
        console.log('   Installing update...');
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

    // =======================================
    // Dropdown Menus
    // =======================================
    const dropdowns = document.querySelectorAll('.dropdown');
    console.log('🔍 Found dropdowns:', dropdowns.length);

    dropdowns.forEach(dropdown => {
      const toggle = dropdown.querySelector('.dropdown-toggle');
      console.log('🔍 Dropdown toggle:', toggle);

      if (!toggle) {
        console.error('❌ No toggle found for dropdown:', dropdown);
        return;
      }

      toggle.addEventListener('click', (e) => {
        console.log('✅ Dropdown toggle clicked');
        e.stopPropagation();

        // Close other dropdowns
        dropdowns.forEach(d => {
          if (d !== dropdown) {
            d.classList.remove('active');
          }
        });

        // Toggle current dropdown
        dropdown.classList.toggle('active');
        console.log('✅ Dropdown active state:', dropdown.classList.contains('active'));
      });

      // Close dropdown when clicking menu items
      const items = dropdown.querySelectorAll('.dropdown-item');
      items.forEach(item => {
        item.addEventListener('click', () => {
          dropdown.classList.remove('active');
        });
      });
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.dropdown')) {
        dropdowns.forEach(dropdown => {
          dropdown.classList.remove('active');
        });
      }
    });

    // =======================================
    // Refresh Warning (Development Only)
    // =======================================
    let allowRefresh = false;

    // Allow app to close without warning when quitting
    ipcRenderer.on('app-closing', () => {
      allowRefresh = true;
    });

    // Catch Cmd+R / Ctrl+R / F5
    document.addEventListener('keydown', (e) => {
      // Cmd+R (Mac) or Ctrl+R (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === 'r') {
        e.preventDefault();
        showRefreshWarning();
      }
      // F5
      if (e.key === 'F5') {
        e.preventDefault();
        showRefreshWarning();
      }
    });

    // Catch browser refresh attempts
    window.addEventListener('beforeunload', (e) => {
      if (!allowRefresh && scriptText.value.trim() !== '') {
        // This message may not show in modern browsers, but the dialog will still appear
        e.preventDefault();
        e.returnValue = 'You have unsaved work. Are you sure you want to refresh?';
        return e.returnValue;
      }
    });

    function showRefreshWarning() {
      const modal = document.getElementById('refreshWarningModal');
      const confirmBtn = document.getElementById('refreshConfirmBtn');
      const cancelBtn = document.getElementById('refreshCancelBtn');

      modal.classList.add('visible');

      const handleConfirm = () => {
        allowRefresh = true;
        modal.classList.remove('visible');
        cleanup();
        location.reload();
      };

      const handleCancel = () => {
        modal.classList.remove('visible');
        cleanup();
      };

      const cleanup = () => {
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
        modal.removeEventListener('click', handleOverlayClick);
      };

      const handleOverlayClick = (e) => {
        if (e.target === modal) handleCancel();
      };

      confirmBtn.addEventListener('click', handleConfirm);
      cancelBtn.addEventListener('click', handleCancel);
      modal.addEventListener('click', handleOverlayClick);
    }
