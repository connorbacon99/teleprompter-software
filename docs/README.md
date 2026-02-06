# Flowstate Documentation

## Quick Links

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System architecture and design decisions
- **[CHANGELOG.md](CHANGELOG.md)** - Version history and notable changes

## Implementation Notes

Detailed documentation of features, fixes, and improvements can be found in [`implementation-notes/`](implementation-notes/):

- **Phase Documentation**
  - `PHASE1_IMPLEMENTATION.md` - Multi-script session management
  - `PHASE2_PLAN.md` - Voice follow feature planning
  - `PHASE2A_IMPLEMENTATION.md` - Voice follow implementation

- **Fixes and Improvements**
  - `FIXES_APPLIED.md` - Bug fixes log
  - `INTEGRATION_FIXES.md` - Integration improvements
  - `NAVIGATION_CLARITY_FIX.md` - UI navigation improvements
  - `UI_DEEP_DIVE_FIXES.md` - Deep UI fixes
  - `UX_IMPROVEMENTS.md` - User experience enhancements
  - `BUG_REPORT.md` - Bug tracking

## For Developers

### Getting Started
```bash
npm install
npm start
```

### Building
```bash
npm run build:mac -- --arm64  # Apple Silicon
npm run build:mac -- --x64     # Intel
```

### Project Structure
```
flowstate/
├── src/
│   ├── main.js           - Main Electron process
│   ├── operator.html     - Operator control panel
│   ├── teleprompter.html - Teleprompter display
│   ├── js/               - JavaScript modules
│   └── css/              - Stylesheets
├── assets/               - App icons
└── docs/                 - Documentation (you are here)
```

##Contributing

When making changes:
1. Update relevant documentation
2. Test thoroughly (especially operator.js changes)
3. Follow existing code style
4. Update CHANGELOG.md for user-facing changes
