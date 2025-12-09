# Development Context

**Purpose**: This document serves as the central reference for tracking major changes, documenting the application structure, and maintaining development context. Always reference and update this document when making significant changes to the codebase.

---

## Application Overview

**Name**: Teleprompter Software
**Purpose**: Professional teleprompter application to replace ZapromptEdge (Telmax - discontinued)
**Platform**: Desktop (Mac/Windows) via Electron

---

## Core Features

1. **Operator Window** - Control panel for managing scripts and playback
2. **Teleprompter Display** - Full-screen output for external monitor/talent view
3. **Script Management** - Import Word docs (.docx), edit scripts, save/load projects
4. **Playback Controls** - Play/pause, variable speed, position jumping
5. **Mirror/Flip** - Horizontal and vertical flip for beam-splitter teleprompters
6. **Multi-Display Support** - Output to external HDMI displays
7. **Countdown Timer** - Configurable 3-2-1-GO countdown before scrolling starts
8. **Font Selection** - Choose from multiple font families (Arial, Helvetica, Georgia, etc.)
9. **Cue Markers** - Mark sections in script for quick navigation
10. **Remote Control** - Web-based control from phone/tablet on same network
11. **Project Save/Load** - Save scripts with all settings as .tproj files

---

## Application Structure

```
teleprompter-software/
├── package.json              # Project config, dependencies, build settings
├── package-lock.json         # Dependency lock file
├── development_context.md    # This file - development tracking
├── assets/
│   ├── icon.svg              # Source icon (umbrella design, cyan/blue gradient)
│   ├── icon.png              # Generated 512x512 icon for builds
│   ├── icon@2x.png           # Generated 1024x1024 for retina displays
│   └── icon_*.png            # Various sizes for platform iconsets
├── scripts/
│   └── generate-icons.js     # Converts SVG to PNG icons using sharp
└── src/
    ├── main.js               # Electron main process
    │                          - Window management (operator + teleprompter)
    │                          - IPC handlers for inter-window communication
    │                          - File dialog and document reading
    │                          - Display detection and management
    │                          - Remote control HTTP server
    │                          - Auto-update with electron-updater
    │
    ├── operator.html         # Operator control panel UI
    │                          - Modern dark theme (purple/cyan accents)
    │                          - Script editor with monitor preview
    │                          - Display selection
    │                          - Playback controls with countdown
    │                          - Style settings (font, color, mirror/flip)
    │                          - Cue markers with custom modal
    │                          - Remote control with QR code
    │                          - Update notification banner
    │
    └── teleprompter.html     # Teleprompter display output
                               - Full-screen script display
                               - Smooth auto-scrolling animation
                               - Reading guide line at center
                               - Gradient overlays for focus
                               - Countdown overlay (3-2-1-GO)
                               - Status indicator (playing/paused)
                               - Mirror/flip transform support
                               - Receives commands from operator via IPC
```

---

## Dependencies

- **electron** (^28.0.0) - Desktop application framework
- **electron-builder** (^24.9.1) - Build/packaging tool
- **electron-updater** (^6.6.2) - Auto-update from GitHub Releases
- **mammoth** (^1.6.0) - Word document (.docx) parsing
- **qrcode** (^1.5.4) - QR code generation for remote control
- **sharp** (^0.34.5, devDep) - SVG to PNG icon conversion

---

## Change Log

### 2025-12-08 - Initial Project Setup
- Created Electron project structure
- Implemented main process with:
  - Multi-window management (operator + teleprompter)
  - IPC communication between windows
  - File dialog for opening scripts
  - Word document (.docx) import using mammoth
  - Display detection for multi-monitor support
- Created operator control panel with:
  - Script editor textarea
  - Display selection dropdown
  - Playback controls (play/pause, stop/reset)
  - Speed slider control
  - Position slider with jump buttons
  - Style controls (font size, text color, background color)
  - Mirror and flip checkboxes
  - Preview box
  - Keyboard shortcuts (Space, Arrow keys, Home/End)
- Created teleprompter display window with:
  - Full-screen display for external monitor
  - Smooth 60fps scrolling animation
  - Reading guide line (horizontal) at screen center
  - Gradient overlays (top/bottom) for focus effect
  - Status indicator showing play/pause state
  - Mirror and flip transformation support
  - IPC communication to receive script and commands

---

### 2025-12-08 - Feature Update: Advanced Features
- Added countdown timer before scrolling:
  - Configurable 1-10 seconds
  - Full-screen 3-2-1-GO overlay on teleprompter display
  - Toggle on/off in playback settings
- Added font family selection:
  - Arial, Helvetica, Georgia, Times, Verdana, Courier
  - Applied to teleprompter display in real-time
- Added project save/load:
  - .tproj file format (JSON)
  - Saves script, cue markers, and all settings
  - Load restores complete project state
- Added cue markers:
  - Mark positions in script by cursor location
  - Quick jump to any cue marker
  - Cues saved with project files
- Added remote control:
  - Built-in HTTP server (port 8080)
  - Mobile-friendly web interface
  - Play/pause, reset, speed control
  - Jump to cue markers from phone/tablet
  - Shows local network IP for easy access
- Fixed speed adjustment causing text to jump

---

### 2025-12-08 - Feature Update: Live Monitor View
- Added operator monitor view for reading along with teleprompter from a distance:
  - View toggle (Editor/Monitor) in script panel header
  - Eye-friendly design with muted colors (#b8b8b8 text on #1a1a1a background)
  - Georgia serif font at 22px with 2x line height for comfortable reading
  - Gradient fades (top/bottom) to focus attention on current reading position
  - Blue focus line indicator at center (50%)
  - Progress bar showing current scroll percentage
  - Status indicator with animated dot (playing/paused)
  - Real-time position sync from teleprompter (~6 updates per second via IPC)
- Added position-update IPC handler in main.js for monitor sync
- Added monitor-position IPC listener in operator.html

---

### 2025-12-08 - Bug Fix: Monitor Sync Accuracy
- Fixed monitor view position calculation to exactly match teleprompter scroll behavior
- Monitor now uses identical calculation as teleprompter:
  - startY = containerHeight * 0.5 (text starts at center)
  - endY = -textHeight + (containerHeight * 0.5) (text ends when bottom reaches center)
  - Percent-based position is calculated identically
- Moved focus line from 40% to 50% to match teleprompter reading guide
- Adjusted gradient fades to be symmetric around center

---

### 2025-12-08 - Enhancement: Scaled Clone Monitor
- Replaced video capture approach with **scaled clone** method
- Previous video capture approach had issues with window permissions on some systems
- New approach: Render an exact clone of the teleprompter at 1920x1080, then scale down
- How it works:
  1. Monitor preview renders at fixed 1920x1080 (same as teleprompter reference)
  2. Uses identical HTML structure: gradient-top, reading-guide, script-wrapper, script-text, gradient-bottom
  3. CSS `transform: scale()` scales the 1920x1080 preview to fit the container
  4. Position is calculated using percentage (normalized) so it works regardless of actual teleprompter display resolution
  5. Settings (font, color, mirror/flip) are synced in real-time
- Benefits:
  - No external permissions required (unlike desktopCapturer)
  - Works regardless of teleprompter display resolution
  - Perfect sync via percentage-based positioning
  - Shows mirror/flip transforms correctly
- Implementation:
  - `updateMonitorScale()` - calculates scale factor and applies settings
  - `applyMonitorPosition(percent)` - applies position using teleprompter formula
  - `updateMonitorText()` - syncs script content
  - `updateMonitorSettings()` - syncs appearance settings

---

### 2025-12-08 - Feature: Display Refresh & Script Navigation
- Added refresh button for display selection to detect newly connected monitors
- Added position controls to find your place in the script:
  - Position percentage display that updates in real-time
  - "Cursor" button - jumps teleprompter to cursor position in editor
  - "Find text" input - search for text and jump to that position
  - Find cycles through multiple matches on repeated clicks
  - Highlights found text in editor and switches to editor view

---

### 2025-12-08 - macOS Compatibility Verification
- Confirmed Electron 28 supports macOS 10.15+ (Catalina)
- Target machine: macOS Catalina 10.15.7 ✓
- Built Intel x64 DMG for Catalina compatibility: `dist/Teleprompter-1.0.0.dmg`
- Also built Apple Silicon DMG: `dist/Teleprompter-1.0.0-arm64.dmg`

---

### 2025-12-08 - Quality of Life Improvements
- Added draggable font size input:
  - Click and drag left/right on the font size number to adjust value
  - More intuitive than clicking small arrow buttons
  - Sensitivity: 2 pixels of movement = 1 unit change
- Added scroll-to-position in monitor viewport:
  - Mouse wheel scrolling in the monitor preview changes position
  - 0.5% increments for fine control over long scripts
  - Debounced updates to teleprompter (50ms) for smooth experience
  - Updates both local preview and remote teleprompter

---

### 2025-12-08 - UI Modernization & Remote Control Enhancement
- Complete UI redesign with modern dark theme:
  - Purple (#8b5cf6) and cyan (#06b6d4) accent gradient
  - Glass-like panels with subtle transparency
  - Improved button states and hover effects
  - Better typography and spacing
- QR code for remote control:
  - Auto-generates QR code when remote server starts
  - Displays in Remote Control panel for easy phone scanning
  - Uses qrcode library for generation
- Fixed Word document import:
  - Preserves paragraph breaks properly
  - Converts single line breaks (soft returns) to spaces
  - Cleans up excess whitespace

---

### 2025-12-08 - Bug Fixes & Polish
- Fixed monitor scroll direction:
  - Wheel event now properly handles both up/down scrolling
  - Uses Math.sign() for reliable direction detection
  - Added proper event handling (stopPropagation, passive: false)
- Fixed cue markers modal:
  - Replaced browser prompt() (doesn't work in Electron) with custom modal
  - Modal styled to match app theme
  - Keyboard support (Enter to save, Escape to cancel)
- Fixed UI inconsistencies:
  - Ghost "New" button now has visible background
  - "Seconds" label color matches other text
  - Hidden browser number input spinners for cleaner look

---

### 2025-12-08 - New App Icon & Deployment Setup
- New umbrella icon design:
  - Cyan-to-blue gradient (#00C6FB to #005BEA)
  - Umbrella with teleprompter text lines motif
  - SVG-based for scalability
- Icon generation pipeline:
  - scripts/generate-icons.js converts SVG to PNG
  - Generates all required sizes (16-1024px)
  - Prebuild hook auto-runs before `npm run build`
  - Uses sharp library for high-quality conversion
- Updated electron-builder config:
  - icon.png now used for app icons
  - Works across Mac, Windows, Linux builds

---

### 2025-12-08 - Auto-Update via GitHub Releases
- Integrated electron-updater for automatic updates:
  - Checks for updates on app startup (production only)
  - Update banner appears when new version available
  - Download progress shown in banner
  - "Restart Now" to install downloaded update
- GitHub Releases integration:
  - Configured publish settings for connorbacon99/teleprompter-software
  - Build outputs include update metadata (latest-mac.yml)
- Update workflow:
  1. Update version in package.json
  2. Run `npm run build:mac`
  3. Create GitHub Release with tag
  4. Upload DMG and yml files
  5. Users get notified automatically

---

### 2025-12-08 - v1.0.0 Release
- Created first official release v1.0.0 on GitHub
- Built for both Mac architectures:
  - Apple Silicon (arm64): `Umbrellaprompter-1.0.0-arm64.dmg`
  - Intel (x64): `Umbrellaprompter-1.0.0.dmg`
- Release includes:
  - DMG installers for both architectures
  - ZIP files for auto-update functionality
  - `latest-mac.yml` metadata for update detection
- Repository: https://github.com/connorbacon99/teleprompter-software
- Release URL: https://github.com/connorbacon99/teleprompter-software/releases/tag/v1.0.0

---

## TODO / Upcoming

- [x] Verify macOS version compatibility (Electron 28 supports 10.15+) ✓
- [x] Add QR code for remote control ✓
- [x] Modern UI redesign ✓
- [x] Auto-update from GitHub Releases ✓
- [x] First release v1.0.0 published ✓
- [ ] Add estimated read time display
- [ ] Add script import from Google Docs
- [ ] Implement script sections/chapters
- [ ] Add ability to customize reading guide line
- [ ] Code signing for Mac (remove "unidentified developer" warning)

---

## Notes for Development

- Always update this document when making major changes
- Log structural changes, new features, and architectural decisions
- Reference this document to understand current state of the application
- Speed changes should NOT include position to avoid jarring jumps
