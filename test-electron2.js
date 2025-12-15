const electron = require('electron');
console.log('Electron keys:', Object.keys(electron));
console.log('Has app?:', 'app' in electron);
console.log('App type:', typeof electron.app);
