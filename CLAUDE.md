# Flowstate - Claude Code Instructions

## Release Process

When creating releases for this Electron app:

1. **Build both architectures**:
   ```bash
   npm run build:mac -- --arm64   # Apple Silicon (M1/M2/M3/M4 Macs)
   npm run build:mac -- --x64      # Intel Macs
   ```

2. **Upload ALL required files to GitHub release**:
   - `Flowstate-{version}-arm64.dmg` - **Apple Silicon** (M1/M2/M3/M4 Macs)
   - `Flowstate-{version}.dmg` - **Intel** Macs
   - `latest-mac.yml` - **REQUIRED** for update checker to detect new versions
   - Optionally: ZIP files for manual updates

   The `latest-mac.yml` file is generated in the `dist/` folder during build and MUST be uploaded to every release for the "Check for Updates" feature to function.

3. **Create release with clear chip architecture notes**:
   ```bash
   gh release create v{version} \
     dist/Flowstate-{version}-arm64.dmg \
     dist/Flowstate-{version}.dmg \
     dist/latest-mac.yml \
     --title "Flowstate v{version}" \
     --notes "## Downloads
   - **Apple Silicon (M1/M2/M3/M4)**: Flowstate-{version}-arm64.dmg
   - **Intel Macs**: Flowstate-{version}.dmg

   ## Installation
   1. Download the correct DMG for your Mac
   2. Open the DMG and drag Flowstate to Applications
   3. This will replace any previous version automatically

   ## Changes
   - List changes here"
   ```

## Update System

**Important**: Without an Apple Developer certificate ($99/year), auto-updates cannot be installed automatically. The app will:
1. Check GitHub releases for new versions
2. Notify the user when an update is available
3. Open the GitHub releases page for manual download

Users install updates by downloading the new DMG and dragging to /Applications, which replaces the previous version.

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
