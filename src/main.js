const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const mammoth = require('mammoth');
const http = require('http');
const os = require('os');

let operatorWindow = null;
let teleprompterWindow = null;
let remoteServer = null;
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
  },
  cueMarkers: []
};

function createOperatorWindow() {
  operatorWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Teleprompter - Operator',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  operatorWindow.loadFile(path.join(__dirname, 'operator.html'));

  operatorWindow.on('closed', () => {
    operatorWindow = null;
    if (teleprompterWindow) {
      teleprompterWindow.close();
    }
    if (remoteServer) {
      remoteServer.close();
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

  // Notify operator when teleprompter is ready
  teleprompterWindow.webContents.on('did-finish-load', () => {
    if (operatorWindow) {
      operatorWindow.webContents.send('teleprompter-opened');
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

    if (url.pathname === '/api/jump-to-cue' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        const { index } = JSON.parse(body);
        if (operatorWindow) {
          operatorWindow.webContents.send('jump-to-cue', index);
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
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>Teleprompter Remote</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
      background: #09090b;
      color: #fafafa;
      min-height: 100vh;
      padding: 20px;
      -webkit-tap-highlight-color: transparent;
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
    .cue-list {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 12px;
      padding: 16px;
      margin-top: 20px;
    }
    .cue-list h3 {
      font-size: 13px;
      color: #71717a;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .cue-item {
      background: #27272a;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 8px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .cue-item:active {
      background: #3f3f46;
    }
    .cue-item:last-child {
      margin-bottom: 0;
    }
    .no-cues {
      color: #71717a;
      font-size: 14px;
      text-align: center;
      padding: 20px;
    }
  </style>
</head>
<body>
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

    <div class="cue-list">
      <h3>Cue Markers</h3>
      <div id="cueList">
        <div class="no-cues">No cue markers set</div>
      </div>
    </div>
  </div>

  <script>
    let state = { isPlaying: false, speed: 30, cueMarkers: [] };

    async function fetchState() {
      try {
        const res = await fetch('/api/state');
        state = await res.json();
        updateUI();
      } catch (e) {
        console.error('Failed to fetch state');
      }
    }

    function updateUI() {
      document.getElementById('statusDot').className = 'status-dot' + (state.isPlaying ? ' playing' : '');
      document.getElementById('statusText').textContent = state.isPlaying ? 'Playing' : 'Paused';
      document.getElementById('playPauseText').textContent = state.isPlaying ? 'Pause' : 'Play';
      document.getElementById('playPauseBtn').className = 'btn ' + (state.isPlaying ? 'danger' : 'success');
      document.getElementById('speedDisplay').textContent = state.speed;

      const cueList = document.getElementById('cueList');
      if (state.cueMarkers && state.cueMarkers.length > 0) {
        cueList.innerHTML = state.cueMarkers.map((cue, i) =>
          '<div class="cue-item" onclick="jumpToCue(' + i + ')">' + cue.name + '</div>'
        ).join('');
      } else {
        cueList.innerHTML = '<div class="no-cues">No cue markers set</div>';
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

    async function jumpToCue(index) {
      await fetch('/api/jump-to-cue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index })
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
  currentState.cueMarkers = scriptData.cueMarkers || [];
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

// Open file dialog
ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(operatorWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Documents', extensions: ['docx', 'txt', 'rtf'] },
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

// Read file content
ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.docx') {
      const result = await mammoth.extractRawText({ path: filePath });
      return { success: true, content: result.value, fileName: path.basename(filePath) };
    } else if (ext === '.txt' || ext === '.rtf') {
      const content = fs.readFileSync(filePath, 'utf-8');
      return { success: true, content, fileName: path.basename(filePath) };
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
    return { success: true, ...result };
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

app.whenReady().then(() => {
  createOperatorWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createOperatorWindow();
  }
});
