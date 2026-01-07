# Flowstate - Claude Code Instructions

## Release Process

When creating releases for this Electron app:

1. **Build both architectures**:
   ```bash
   npm run build:mac -- --arm64   # Apple Silicon
   npm run build:mac -- --x64      # Intel
   ```

2. **Upload ALL required files to GitHub release**:
   - `Flowstate-{version}-arm64.dmg` - Apple Silicon installer
   - `Flowstate-{version}.dmg` - Intel installer
   - `latest-mac.yml` - **REQUIRED** for auto-updater to work
   - Optionally: ZIP files and blockmaps for delta updates

   The `latest-mac.yml` file is generated in the `dist/` folder during build and MUST be uploaded to every release for the "Check for Updates" feature to function.

3. **Create release**:
   ```bash
   gh release create v{version} \
     dist/Flowstate-{version}-arm64.dmg \
     dist/Flowstate-{version}.dmg \
     dist/latest-mac.yml \
     --title "Flowstate v{version}" \
     --notes "Release notes here"
   ```

## Architecture

- **Electron app** with operator window and teleprompter display window
- Uses `electron-updater` for auto-updates via GitHub releases
- Local HTTP server for Web Speech API support

## Key Files

- `src/main.js` - Main process, window management, IPC handlers
- `src/operator.html` - Operator control panel
- `src/js/operator.js` - Operator window logic
- `src/teleprompter.html` - Teleprompter display
- `src/css/operator-modern.css` - Main stylesheet
