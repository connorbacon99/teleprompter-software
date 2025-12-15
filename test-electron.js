const { app } = require('electron');
console.log('App imported:', typeof app);
console.log('App.commandLine:', typeof app.commandLine);
app.whenReady().then(() => {
  console.log('App is ready!');
  app.quit();
});
