const { app, BrowserWindow, ipcMain, dialog, screen, session } = require('electron');
const path = require('path');
const fs = require('fs');
const mammoth = require('mammoth');
const JSZip = require('jszip');
const { Document, Packer, Paragraph, TextRun } = require('docx');
const http = require('http');
const os = require('os');
const QRCode = require('qrcode');

// Don't load electron-updater until app is ready
let autoUpdater = null;

// Enable Web Speech API - must be set before app ready
app.commandLine.appendSwitch('enable-speech-dispatcher');
app.commandLine.appendSwitch('enable-features', 'WebSpeechAPI');

let operatorWindow = null;
let teleprompterWindow = null;
let remoteServer = null;
let localServer = null;
let localServerPort = 45678; // Port for serving operator.html locally
let currentState = {
  script: '',
  isPlaying: false,
  speed: 30,
  position: 0,
  settings: {
    fontSize: 72,
    fontFamily: 'Arial',
    textColor: '#ffffff',
    bgColor: '#000000',
    mirror: false,
    flip: false,
    countdownEnabled: true,
    countdownSeconds: 3
  }
};

// Create local HTTP server for serving operator.html (needed for Web Speech API)
function createLocalServer() {
  return new Promise((resolve, reject) => {
    const mimeTypes = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml'
    };

    localServer = http.createServer((req, res) => {
      let filePath = path.join(__dirname, req.url === '/' ? 'operator.html' : req.url);
      const ext = path.extname(filePath).toLowerCase();
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      fs.readFile(filePath, (err, content) => {
        if (err) {
          res.writeHead(404);
          res.end('Not Found');
        } else {
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(content);
        }
      });
    });

    localServer.listen(localServerPort, '127.0.0.1', () => {
      console.log(`Local server running at http://127.0.0.1:${localServerPort}`);
      resolve(localServerPort);
    });

    localServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        // Try another port
        localServerPort++;
        localServer.listen(localServerPort, '127.0.0.1');
      } else {
        reject(err);
      }
    });
  });
}

function createOperatorWindow() {
  operatorWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Umbrellaprompter - Operator',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false // Allow loading local resources
    }
  });

  // Load from localhost for better API compatibility
  operatorWindow.loadURL(`http://127.0.0.1:${localServerPort}/operator.html`);

  operatorWindow.on('closed', () => {
    operatorWindow = null;
    if (teleprompterWindow) {
      teleprompterWindow.close();
    }
    if (remoteServer) {
      remoteServer.close();
    }
    if (localServer) {
      localServer.close();
    }
    app.quit();
  });
}

function createTeleprompterWindow(displayId) {
  const displays = screen.getAllDisplays();
  let targetDisplay = displays.find(d => d.id === displayId);

  if (!targetDisplay) {
    targetDisplay = displays.find(d => d.id !== screen.getPrimaryDisplay().id) || screen.getPrimaryDisplay();
  }

  const { x, y, width, height } = targetDisplay.bounds;

  teleprompterWindow = new BrowserWindow({
    x: x,
    y: y,
    width: width,
    height: height,
    fullscreen: true,
    frame: false,
    title: 'Teleprompter Display',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  teleprompterWindow.loadFile(path.join(__dirname, 'teleprompter.html'));

  // Notify operator when teleprompter is ready with display dimensions
  teleprompterWindow.webContents.on('did-finish-load', () => {
    if (operatorWindow) {
      operatorWindow.webContents.send('teleprompter-opened', {
        width: width,
        height: height
      });
    }
  });

  teleprompterWindow.on('closed', () => {
    teleprompterWindow = null;
    if (operatorWindow) {
      operatorWindow.webContents.send('teleprompter-closed');
    }
  });

  return targetDisplay.id;
}

// Get local IP addresses for remote control
function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

// Start remote control server
function startRemoteServer(port = 8080) {
  if (remoteServer) {
    remoteServer.close();
  }

  remoteServer = http.createServer((req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    // API endpoints
    if (url.pathname === '/api/state') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(currentState));
      return;
    }

    if (url.pathname === '/api/play' && req.method === 'POST') {
      currentState.isPlaying = true;
      broadcastState();
      res.writeHead(200);
      res.end('OK');
      return;
    }

    if (url.pathname === '/api/pause' && req.method === 'POST') {
      currentState.isPlaying = false;
      broadcastState();
      res.writeHead(200);
      res.end('OK');
      return;
    }

    if (url.pathname === '/api/reset' && req.method === 'POST') {
      currentState.isPlaying = false;
      currentState.position = 0;
      broadcastState({ reset: true });
      res.writeHead(200);
      res.end('OK');
      return;
    }

    if (url.pathname === '/api/speed' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        const { speed } = JSON.parse(body);
        currentState.speed = speed;
        broadcastState();
        res.writeHead(200);
        res.end('OK');
      });
      return;
    }

    if (url.pathname === '/api/position' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        const { position } = JSON.parse(body);
        currentState.position = position;
        // Send to operator which will update teleprompter
        if (operatorWindow) {
          operatorWindow.webContents.send('remote-position', position);
        }
        res.writeHead(200);
        res.end('OK');
      });
      return;
    }

    // Serve remote control HTML
    if (url.pathname === '/' || url.pathname === '/remote') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(getRemoteControlHTML());
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  remoteServer.listen(port, '0.0.0.0', () => {
    console.log(`Remote control server running on port ${port}`);
  });

  return { port, ips: getLocalIPs() };
}

function broadcastState(extra = {}) {
  const state = {
    isPlaying: currentState.isPlaying,
    speed: currentState.speed,
    position: currentState.position,
    ...extra
  };

  if (teleprompterWindow) {
    teleprompterWindow.webContents.send('playback-update', state);
  }
  if (operatorWindow) {
    operatorWindow.webContents.send('state-update', state);
  }
}

function getRemoteControlHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <title>Umbrellaprompter Remote</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; touch-action: manipulation; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
      background: #09090b;
      color: #fafafa;
      min-height: 100vh;
      padding: 20px;
      padding-bottom: env(safe-area-inset-bottom, 20px);
      -webkit-tap-highlight-color: transparent;
      -webkit-touch-callout: none;
      -webkit-user-select: none;
      user-select: none;
    }
    .header {
      text-align: center;
      padding: 20px 0 30px;
      border-bottom: 1px solid #27272a;
      margin-bottom: 30px;
    }
    .header h1 {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .header p {
      color: #71717a;
      font-size: 14px;
    }
    .status {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-top: 12px;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #ef4444;
    }
    .status-dot.playing {
      background: #22c55e;
      animation: pulse 1s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .status-text {
      font-size: 13px;
      color: #a1a1aa;
    }
    .controls {
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-width: 400px;
      margin: 0 auto;
    }
    .btn {
      background: #27272a;
      border: 1px solid #3f3f46;
      color: #fafafa;
      padding: 20px;
      border-radius: 12px;
      font-size: 18px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
    }
    .btn:active {
      transform: scale(0.98);
      background: #3f3f46;
    }
    .btn.primary {
      background: #3b82f6;
      border-color: #3b82f6;
    }
    .btn.primary:active {
      background: #2563eb;
    }
    .btn.success {
      background: #22c55e;
      border-color: #22c55e;
    }
    .btn.success:active {
      background: #16a34a;
    }
    .btn.danger {
      background: #ef4444;
      border-color: #ef4444;
    }
    .btn-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .speed-control {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 12px;
      padding: 20px;
    }
    .speed-control label {
      display: block;
      font-size: 13px;
      color: #71717a;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .speed-display {
      font-size: 48px;
      font-weight: 700;
      text-align: center;
      margin-bottom: 16px;
    }
    .speed-buttons {
      display: flex;
      gap: 8px;
    }
    .speed-buttons .btn {
      flex: 1;
      padding: 16px;
    }
    .position-control {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 12px;
      padding: 20px;
    }
    .position-control label {
      display: block;
      font-size: 13px;
      color: #71717a;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .position-control label span {
      color: #fafafa;
      font-weight: 600;
    }
    .position-control input[type="range"] {
      width: 100%;
      height: 40px;
      -webkit-appearance: none;
      background: #27272a;
      border-radius: 8px;
      margin-bottom: 12px;
    }
    .position-control input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 24px;
      height: 24px;
      background: #3b82f6;
      border-radius: 50%;
      cursor: pointer;
    }
    .position-buttons {
      display: flex;
      gap: 8px;
    }
    .position-buttons .btn {
      flex: 1;
      padding: 12px 8px;
      font-size: 14px;
    }
    /* Loading state - show content only when connected */
    .controls { opacity: 0.3; pointer-events: none; transition: opacity 0.3s; }
    body.connected .controls { opacity: 1; pointer-events: auto; }
    .loading-msg {
      text-align: center;
      padding: 40px 20px;
      color: #71717a;
      display: block;
    }
    body.connected .loading-msg { display: none; }
  </style>
</head>
<body>
  <div class="loading-msg">Connecting to teleprompter...</div>
  <div class="header">
    <h1>Teleprompter Remote</h1>
    <p>Control your teleprompter from this device</p>
    <div class="status">
      <div class="status-dot" id="statusDot"></div>
      <span class="status-text" id="statusText">Paused</span>
    </div>
  </div>

  <div class="controls">
    <button class="btn primary" id="playPauseBtn" onclick="togglePlay()">
      <span id="playPauseText">Play</span>
    </button>

    <div class="btn-row">
      <button class="btn" onclick="reset()">Reset</button>
      <button class="btn" onclick="jumpToStart()">Jump to Start</button>
    </div>

    <div class="speed-control">
      <label>Scroll Speed</label>
      <div class="speed-display" id="speedDisplay">30</div>
      <div class="speed-buttons">
        <button class="btn" onclick="adjustSpeed(-10)">-10</button>
        <button class="btn" onclick="adjustSpeed(-5)">-5</button>
        <button class="btn" onclick="adjustSpeed(5)">+5</button>
        <button class="btn" onclick="adjustSpeed(10)">+10</button>
      </div>
    </div>

    <div class="position-control">
      <label>Position <span id="positionDisplay">0%</span></label>
      <input type="range" id="positionSlider" min="0" max="100" value="0" oninput="updatePositionDisplay()" onchange="setPosition()">
      <div class="position-buttons">
        <button class="btn" onclick="nudgePosition(-5)">-5%</button>
        <button class="btn" onclick="nudgePosition(-1)">-1%</button>
        <button class="btn" onclick="nudgePosition(1)">+1%</button>
        <button class="btn" onclick="nudgePosition(5)">+5%</button>
      </div>
    </div>

  </div>

  <script>
    let state = { isPlaying: false, speed: 30 };
    let connected = false;

    async function fetchState() {
      try {
        const res = await fetch('/api/state');
        if (!res.ok) throw new Error('Server error');
        state = await res.json();
        connected = true;
        document.body.classList.add('connected');
        updateUI();
      } catch (e) {
        connected = false;
        document.body.classList.remove('connected');
        document.getElementById('statusText').textContent = 'Connecting...';
        console.error('Failed to fetch state:', e);
      }
    }

    function updateUI() {
      document.getElementById('statusDot').className = 'status-dot' + (state.isPlaying ? ' playing' : '');
      document.getElementById('statusText').textContent = state.isPlaying ? 'Playing' : 'Paused';
      document.getElementById('playPauseText').textContent = state.isPlaying ? 'Pause' : 'Play';
      document.getElementById('playPauseBtn').className = 'btn ' + (state.isPlaying ? 'danger' : 'success');
      document.getElementById('speedDisplay').textContent = state.speed;

      // Update position slider
      if (state.position !== undefined) {
        document.getElementById('positionSlider').value = Math.round(state.position);
        document.getElementById('positionDisplay').textContent = Math.round(state.position) + '%';
      }
    }

    async function togglePlay() {
      await fetch(state.isPlaying ? '/api/pause' : '/api/play', { method: 'POST' });
      state.isPlaying = !state.isPlaying;
      updateUI();
    }

    async function reset() {
      await fetch('/api/reset', { method: 'POST' });
      state.isPlaying = false;
      updateUI();
    }

    async function jumpToStart() {
      await fetch('/api/reset', { method: 'POST' });
      state.isPlaying = false;
      updateUI();
    }

    async function adjustSpeed(delta) {
      state.speed = Math.max(1, Math.min(100, state.speed + delta));
      await fetch('/api/speed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speed: state.speed })
      });
      updateUI();
    }

    function updatePositionDisplay() {
      const pos = document.getElementById('positionSlider').value;
      document.getElementById('positionDisplay').textContent = pos + '%';
    }

    async function setPosition() {
      const pos = parseInt(document.getElementById('positionSlider').value);
      state.position = pos;
      await fetch('/api/position', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: pos })
      });
    }

    async function nudgePosition(delta) {
      const slider = document.getElementById('positionSlider');
      const newPos = Math.max(0, Math.min(100, parseInt(slider.value) + delta));
      slider.value = newPos;
      state.position = newPos;
      document.getElementById('positionDisplay').textContent = newPos + '%';
      await fetch('/api/position', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: newPos })
      });
    }

    // Poll for state updates
    fetchState();
    setInterval(fetchState, 1000);
  </script>
</body>
</html>`;
}

// Get available displays
ipcMain.handle('get-displays', () => {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  return displays.map(d => ({
    id: d.id,
    label: d.label || `Display ${d.id}`,
    width: d.bounds.width,
    height: d.bounds.height,
    isPrimary: d.id === primary.id
  }));
});

// Check if teleprompter is open
ipcMain.handle('is-teleprompter-open', () => {
  return teleprompterWindow !== null;
});

// Open teleprompter on specific display
ipcMain.handle('open-teleprompter', (event, displayId) => {
  if (teleprompterWindow) {
    teleprompterWindow.close();
  }
  return createTeleprompterWindow(displayId);
});

// Close teleprompter window
ipcMain.handle('close-teleprompter', () => {
  if (teleprompterWindow) {
    teleprompterWindow.close();
  }
});

// Send script to teleprompter
ipcMain.on('send-script', (event, scriptData) => {
  currentState.script = scriptData.text;
  if (teleprompterWindow) {
    teleprompterWindow.webContents.send('update-script', scriptData);
  }
});

// Send playback state to teleprompter
ipcMain.on('playback-control', (event, state) => {
  currentState.isPlaying = state.isPlaying;
  currentState.speed = state.speed;
  if (state.position !== undefined) {
    currentState.position = state.position;
  }
  if (teleprompterWindow) {
    teleprompterWindow.webContents.send('playback-update', state);
  }
});

// Receive position updates from teleprompter for operator monitor
ipcMain.on('position-update', (event, positionData) => {
  // positionData contains: { percent, transform, containerHeight, scrollHeight }
  currentState.position = positionData.percent;
  if (operatorWindow) {
    operatorWindow.webContents.send('monitor-position', positionData);
  }
});

// Send settings to teleprompter
ipcMain.on('update-settings', (event, settings) => {
  currentState.settings = { ...currentState.settings, ...settings };
  if (teleprompterWindow) {
    teleprompterWindow.webContents.send('settings-update', settings);
  }
});

// Start countdown
ipcMain.on('start-countdown', (event, seconds) => {
  if (teleprompterWindow) {
    teleprompterWindow.webContents.send('start-countdown', seconds);
  }
});

// Voice follow position update (smooth continuous following)
ipcMain.on('voice-follow-position', (event, percent) => {
  if (teleprompterWindow) {
    teleprompterWindow.webContents.send('voice-follow-position', percent);
  }
});

// Stop voice follow mode
ipcMain.on('voice-follow-stop', () => {
  if (teleprompterWindow) {
    teleprompterWindow.webContents.send('voice-follow-stop');
  }
});

// Jump to position (for cue markers - instant, not smooth)
ipcMain.on('jump-to-position', (event, percent) => {
  if (teleprompterWindow) {
    teleprompterWindow.webContents.send('jump-to-position', percent);
  }
});

// Open file dialog
ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(operatorWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Documents', extensions: ['docx', 'pptx', 'txt', 'rtf'] },
      { name: 'PowerPoint', extensions: ['pptx'] },
      { name: 'Word Documents', extensions: ['docx'] },
      { name: 'Text Files', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

// Extract speaker notes from PowerPoint file
async function extractPowerPointNotes(filePath) {
  const data = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(data);

  // Get all notes slide files
  const notesFiles = [];
  zip.forEach((relativePath, file) => {
    if (relativePath.startsWith('ppt/notesSlides/notesSlide') && relativePath.endsWith('.xml')) {
      // Extract slide number from filename (notesSlide1.xml -> 1)
      const match = relativePath.match(/notesSlide(\d+)\.xml$/);
      if (match) {
        notesFiles.push({ path: relativePath, slideNum: parseInt(match[1]) });
      }
    }
  });

  // Sort by slide number
  notesFiles.sort((a, b) => a.slideNum - b.slideNum);

  // Extract text from each notes slide
  const results = [];
  for (const noteFile of notesFiles) {
    const xmlContent = await zip.file(noteFile.path).async('string');

    // Extract all text from <a:t> elements (text elements in OOXML)
    const textMatches = xmlContent.match(/<a:t>([^<]*)<\/a:t>/g) || [];
    const texts = textMatches
      .map(match => match.replace(/<a:t>([^<]*)<\/a:t>/, '$1'))
      .filter(text => text.trim().length > 0)
      // Filter out standalone slide numbers (page number placeholders)
      .filter(text => text.trim() !== String(noteFile.slideNum));

    // Skip slides with no notes
    // Join text intelligently - no space before punctuation
    let noteText = '';
    for (const text of texts) {
      if (noteText && !/^[.,!?;:)}\]'"…]/.test(text) && !/[(\[{'"']$/.test(noteText)) {
        noteText += ' ';
      }
      noteText += text;
    }
    noteText = noteText.trim();
    if (noteText) {
      results.push(`[Slide ${noteFile.slideNum}] ${noteText}`);
    }
  }

  return results.join('\n');
}

// Clean up text from Word documents
// - Preserve paragraph breaks (double line breaks)
// - Convert single line breaks to spaces (these are usually soft returns from Word)
// - Clean up excess whitespace
function cleanImportedText(text) {
  return text
    // Normalize line endings
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Preserve paragraph breaks (2+ newlines) by marking them
    .replace(/\n\n+/g, '<<<PARA>>>')
    // Convert remaining single newlines to spaces
    .replace(/\n/g, ' ')
    // Restore paragraph breaks
    .replace(/<<<PARA>>>/g, '\n\n')
    // Clean up multiple spaces
    .replace(/  +/g, ' ')
    // Trim whitespace from each paragraph
    .split('\n\n')
    .map(p => p.trim())
    .filter(p => p.length > 0)
    .join('\n\n')
    .trim();
}

// Read file content
ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.pptx') {
      const content = await extractPowerPointNotes(filePath);
      return { success: true, content, fileName: path.basename(filePath) };
    } else if (ext === '.docx') {
      const result = await mammoth.extractRawText({ path: filePath });
      const cleanedContent = cleanImportedText(result.value);
      return { success: true, content: cleanedContent, fileName: path.basename(filePath) };
    } else if (ext === '.txt' || ext === '.rtf') {
      const content = fs.readFileSync(filePath, 'utf-8');
      const cleanedContent = cleanImportedText(content);
      return { success: true, content: cleanedContent, fileName: path.basename(filePath) };
    } else {
      const content = fs.readFileSync(filePath, 'utf-8');
      return { success: true, content, fileName: path.basename(filePath) };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Save project
ipcMain.handle('save-project', async (event, projectData) => {
  const result = await dialog.showSaveDialog(operatorWindow, {
    filters: [{ name: 'Teleprompter Project', extensions: ['tproj'] }],
    defaultPath: projectData.name || 'Untitled.tproj'
  });

  if (result.canceled) {
    return { success: false };
  }

  try {
    fs.writeFileSync(result.filePath, JSON.stringify(projectData, null, 2));
    return { success: true, filePath: result.filePath, fileName: path.basename(result.filePath) };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Export script to Word document
ipcMain.handle('export-docx', async (event, scriptText, suggestedName) => {
  const result = await dialog.showSaveDialog(operatorWindow, {
    filters: [{ name: 'Word Document', extensions: ['docx'] }],
    defaultPath: suggestedName || 'Script.docx'
  });

  if (result.canceled) {
    return { success: false };
  }

  try {
    // Split script into paragraphs and create document
    const paragraphs = scriptText.split('\n').map(line =>
      new Paragraph({
        children: [new TextRun(line)]
      })
    );

    const doc = new Document({
      sections: [{
        properties: {},
        children: paragraphs
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(result.filePath, buffer);
    return { success: true, filePath: result.filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Save text file (for exporting editing guides)
ipcMain.handle('save-text-file', async (event, { content, defaultName }) => {
  // Determine file type from defaultName extension
  const ext = path.extname(defaultName).slice(1) || 'txt';
  const filterName = ext === 'csv' ? 'CSV File' : 'Text File';

  const result = await dialog.showSaveDialog(operatorWindow, {
    filters: [{ name: filterName, extensions: [ext] }],
    defaultPath: defaultName
  });

  if (result.canceled) {
    return { success: false };
  }

  try {
    fs.writeFileSync(result.filePath, content);
    return { success: true, filePath: result.filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Autosave session
ipcMain.handle('autosave-session', async (event, autosaveData) => {
  try {
    const autosaveDir = path.join(app.getPath('userData'), 'autosave');
    if (!fs.existsSync(autosaveDir)) {
      fs.mkdirSync(autosaveDir, { recursive: true });
    }

    const autosavePath = path.join(autosaveDir, 'session.json');
    fs.writeFileSync(autosavePath, JSON.stringify(autosaveData, null, 2));
    return { success: true };
  } catch (error) {
    console.error('Autosave error:', error);
    return { success: false, error: error.message };
  }
});

// Load project
ipcMain.handle('load-project', async () => {
  const result = await dialog.showOpenDialog(operatorWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Teleprompter Project', extensions: ['tproj'] }]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false };
  }

  try {
    const content = fs.readFileSync(result.filePaths[0], 'utf-8');
    const projectData = JSON.parse(content);
    return { success: true, data: projectData, fileName: path.basename(result.filePaths[0]) };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Start remote control server
ipcMain.handle('start-remote-server', async (event, port) => {
  try {
    const result = startRemoteServer(port);
    const ip = result.ips[0] || 'localhost';
    const url = `http://${ip}:${result.port}`;
    // Generate QR code as data URL
    const qrDataUrl = await QRCode.toDataURL(url, {
      width: 200,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' }
    });
    return { success: true, ...result, qrCode: qrDataUrl, url };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Stop remote control server
ipcMain.handle('stop-remote-server', async () => {
  if (remoteServer) {
    remoteServer.close();
    remoteServer = null;
  }
  return { success: true };
});

// Get remote server status
ipcMain.handle('get-remote-status', () => {
  return {
    running: !!remoteServer,
    ips: getLocalIPs()
  };
});

// IPC handlers for updates (with null checks since autoUpdater is initialized later)
ipcMain.handle('check-for-updates', async () => {
  if (!autoUpdater) return { error: 'Auto-updater not available' };
  try {
    return await autoUpdater.checkForUpdates();
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('download-update', async () => {
  if (!autoUpdater) return { error: 'Auto-updater not available' };
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('install-update', () => {
  if (autoUpdater) {
    autoUpdater.quitAndInstall(false, true);
  }
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

app.whenReady().then(async () => {
  // Set up permission handler for microphone access
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['media', 'microphone', 'audioCapture'];
    if (allowedPermissions.includes(permission)) {
      callback(true);
    } else {
      callback(false);
    }
  });

  // Also handle permission check
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    const allowedPermissions = ['media', 'microphone', 'audioCapture'];
    return allowedPermissions.includes(permission);
  });

  // Initialize auto-updater now that app is ready
  try {
    autoUpdater = require('electron-updater').autoUpdater;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    // Set up auto-updater event handlers
    autoUpdater.on('checking-for-update', () => {
      if (operatorWindow) {
        operatorWindow.webContents.send('update-status', { status: 'checking' });
      }
    });

    autoUpdater.on('update-available', (info) => {
      if (operatorWindow) {
        operatorWindow.webContents.send('update-status', {
          status: 'available',
          version: info.version,
          releaseNotes: info.releaseNotes
        });
      }
    });

    autoUpdater.on('update-not-available', () => {
      if (operatorWindow) {
        operatorWindow.webContents.send('update-status', { status: 'not-available' });
      }
    });

    autoUpdater.on('download-progress', (progress) => {
      if (operatorWindow) {
        operatorWindow.webContents.send('update-status', {
          status: 'downloading',
          percent: progress.percent
        });
      }
    });

    autoUpdater.on('update-downloaded', (info) => {
      if (operatorWindow) {
        operatorWindow.webContents.send('update-status', {
          status: 'downloaded',
          version: info.version
        });
      }
    });

    autoUpdater.on('error', (err) => {
      if (operatorWindow) {
        operatorWindow.webContents.send('update-status', {
          status: 'error',
          message: err.message
        });
      }
    });
  } catch (err) {
    console.log('Auto-updater not available:', err.message);
  }

  // Start local server first (needed for Web Speech API)
  try {
    await createLocalServer();
    console.log('Local server started successfully');
  } catch (err) {
    console.error('Failed to start local server:', err);
  }

  createOperatorWindow();

  // Check for updates after app is ready (only in production)
  if (app.isPackaged && autoUpdater) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {});
    }, 3000);
  }
});

app.on('window-all-closed', () => {
  if (localServer) {
    localServer.close();
  }
  app.quit();
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    if (!localServer) {
      await createLocalServer();
    }
    createOperatorWindow();
  }
});
