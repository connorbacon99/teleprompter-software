# Teleprompter v2 — Product Requirements

## Vision

A native macOS teleprompter for **instructors recording long (8–12 hour)
educational content**. The key differentiator vs. generic teleprompters is
**edit-tracking** — capturing mess-ups, retakes, chapter markers, and notes
mid-recording so the post-production editor has a clean map of what to keep
and what to cut.

Success metrics, in order:
1. **Long-session stability** — 12-hour sessions don't crash, leak, decay, or
   lose work to crashes/power events.
2. **Seamless editor handoff** — exported markers drop into Premiere / Final
   Cut / Resolve and tell the editor exactly where the good takes live.
3. **Operator ergonomics** — common actions (start session, log a flub,
   bookmark, retake-from-here) are one-keystroke and never require window
   focus changes mid-recording.

## Tech stack (fixed)

- Swift + AppKit + Core Animation
- Single-store reducer pattern (`Store.dispatch(Action)`)
- macOS deployment target: 10.15 Catalina (Intel target hardware)
- No external dependencies — `Package.swift` is stdlib-only and stays that way
- Build via `swift build` for dev, `./Scripts/build-app.sh` for the .app bundle

## Out of scope (do not implement)

- Voice-follow / Whisper / Deepgram
- Any AI features
- Auto-update mechanism (a banner notifying the user of a new version is OK;
  in-place self-update is not)
- Cross-platform (Linux/Windows) support
- iCloud / cloud sync

## Task list

Tasks are ordered intentionally — earlier tasks add infrastructure later
tasks depend on. Always work the topmost task with `"passes": false`.

```json
[
  {
    "category": "testing",
    "description": "Add XCTest scaffolding so the loop can verify changes headlessly",
    "steps": [
      "Add a `testTarget` to `Package.swift` named `TeleprompterTests` depending on `Teleprompter`",
      "Create `Tests/TeleprompterTests/ReducerTests.swift` with at least three tests covering the pure reducer: a `scriptAdd` test, a `setPosition` clamp test, and a `recordingLogAdd` test",
      "Run `swift test` and confirm all tests pass",
      "If `Teleprompter` is currently an executable-only target, restructure into a library target + thin executable target so the test target can import it"
    ],
    "passes": true
  },
  {
    "category": "stability",
    "description": "Make Persistence.load() resilient to corrupt state.json",
    "steps": [
      "On decode failure in `Persistence.load()`, copy the bad file to `state.json.bak.<timestamp>` in the same directory and return nil instead of crashing",
      "Log the failure via NSLog with the underlying error",
      "Add a unit test that writes garbage to a temp URL, calls a testable version of the load logic, and confirms it returns nil + creates the backup file"
    ],
    "passes": true
  },
  {
    "category": "stability",
    "description": "Persist recording-log mutations immediately, not just on the 500ms debounce",
    "steps": [
      "In `AppDelegate.schedulePersistenceSave`, detect when the action that triggered the save was a recording-log mutation (you may need to plumb the action into the observer, or add a separate immediate-save observer)",
      "For recording-log adds/edits/clears, write to disk synchronously in addition to scheduling the debounced save",
      "Confirm the existing debounced save still applies to other state changes (typing in the script editor, appearance tweaks)",
      "Add a unit test or comment block explaining the invariant: 'a log entry, once dispatched, survives an immediate process kill'"
    ],
    "passes": true
  },
  {
    "category": "edit-tracking",
    "description": "Add an EntryKind field to RecordingLogEntry (flub / clean / chapter / retake / note)",
    "steps": [
      "Define `enum EntryKind: String, Codable { case flub, clean, chapter, retake, note }`",
      "Add `var kind: EntryKind` to `RecordingLogEntry`, defaulting to `.flub` for `init`",
      "Make the Codable decoding tolerant: if `kind` is absent in the JSON (old persisted state), default to `.flub`",
      "Add a `recordingLogSetKind(scriptId:entryId:kind:)` action and reduce it",
      "Surface kind as a popup-button column in `TrackerView`'s table",
      "Add a unit test that decodes a JSON entry without a `kind` field and confirms it defaults to `.flub`"
    ],
    "passes": false
  },
  {
    "category": "edit-tracking",
    "description": "Stamp each RecordingLogEntry with a wallclock ISO-8601 timestamp",
    "steps": [
      "Add `var wallclock: Date` to `RecordingLogEntry`, set to `Date()` at construction",
      "Make Codable decoding tolerant of entries missing `wallclock` (default to distant past or epoch, with a comment explaining why)",
      "Update `TrackerView.logAction()` to stamp `wallclock = Date()` on each new entry",
      "Update CSV export to include a `Wallclock` column with ISO-8601 formatting",
      "Add a unit test confirming the CSV output contains the wallclock column with a parseable ISO-8601 value"
    ],
    "passes": false
  },
  {
    "category": "edit-tracking",
    "description": "Auto-supersede flub entries when a retake-from-here is logged",
    "steps": [
      "When an entry of kind `.retake` is added, mark all preceding `.flub` entries (since the most recent `.chapter`, or since the start of the recordingLog if none) as superseded",
      "Implementation choice: add a `var superseded: Bool = false` field to `RecordingLogEntry` (tolerant decoding, default false) and update it in the reducer when `.retake` is added",
      "Add a 'Status' column to the CSV export ('live' or 'superseded')",
      "Add a unit test: a log with flub, flub, retake should yield two superseded flubs + one live retake; chapter, flub, retake should yield one chapter live + one superseded flub + one live retake"
    ],
    "passes": false
  },
  {
    "category": "edit-tracking",
    "description": "Register a global hotkey that logs a flub from any focused app",
    "steps": [
      "Use Carbon's `RegisterEventHotKey` (works without accessibility entitlements for in-process hotkeys, system-wide for the user's session) to register a default combo of ⌃⌥F",
      "When fired, dispatch a `recordingLogAdd` with kind=.flub at the current scroll position, the same way `TrackerView.logAction()` does",
      "Wire registration in AppDelegate so it's active whenever the operator window is open",
      "Unregister on app terminate",
      "If Carbon registration fails (e.g., combo already taken system-wide), log a warning and continue — do not crash"
    ],
    "passes": false
  },
  {
    "category": "operator-ergonomics",
    "description": "Add a bookmark hotkey (B) that adds a cue marker at the current scroll position",
    "steps": [
      "In `OperatorViewController` (or appropriate first-responder chain), handle the unmodified 'B' key when the teleprompter view isn't taking text input focus",
      "On press, dispatch `cueAdd` with label 'Bookmark HH:MM:SS' (HH:MM:SS = the current session timer, or wallclock if no timer is running) and position = engine.currentPosition",
      "Make sure typing 'B' inside the script editor or notes field still types a literal 'B' — only hot-route when the operator window is key and no text field has focus",
      "Add a brief HUD-style flash or label change confirming the bookmark was added (e.g., status label shows 'Bookmark added' for 1.5s)"
    ],
    "passes": false
  },
  {
    "category": "operator-ergonomics",
    "description": "Show a progress indicator: 'NN% through script • ~MM min remaining at current speed'",
    "steps": [
      "Add a small read-only label or HUD to the operator UI (not the teleprompter window) that reflects `engine.currentPosition` and `engine.speed`",
      "Estimate remaining time using the current scroll-rate (you can derive this from the engine's animation, or from a measured pace if available). If you don't have a precise pace, use a sensible heuristic and label it as approximate.",
      "Update at most twice per second (don't burn CPU on label refresh)"
    ],
    "passes": false
  },
  {
    "category": "operator-ergonomics",
    "description": "Visual session-divider row in the recording log table when the timer is reset",
    "steps": [
      "When the recording timer is reset while there are existing log entries, insert a synthetic 'divider' entry into the script's recordingLog. Choose between (a) a real `RecordingLogEntry` of a new kind `.session`, or (b) a separate `sessionDividers: [Date]` array on the Script. Pick the option that requires the least invasive change to the table view's row math.",
      "Render the divider row visually distinct (different background, larger row height, or a header-style font)",
      "CSV export should also reflect the divider — either as a blank row with a 'Session N started <wallclock>' note, or by writing per-session CSV sections"
    ],
    "passes": false
  },
  {
    "category": "stability",
    "description": "Don't crash if the secondary display is disconnected mid-session",
    "steps": [
      "In `AppDelegate.refreshDisplays()` and the screen-change notification handler, detect when the currently selected display id is no longer present",
      "If the teleprompter window is open on a now-disconnected display, either (a) move it to the primary display, or (b) close it gracefully and surface a non-blocking notice to the operator",
      "Add a unit test of the `displaysRefreshed` reducer case confirming that `selectedDisplayId` is nulled or reassigned correctly when its display disappears"
    ],
    "passes": false
  },
  {
    "category": "stability",
    "description": "Document long-session perf characteristics in docs/long-session-stability.md",
    "steps": [
      "Create `docs/long-session-stability.md`",
      "Document the known CALayer / CATextLayer pagination strategy (reference the existing `ScrollingTextView` pagination logic) and why it exists — including the CATextLayer ~4096pt texture limit",
      "Note the memory pressure expectations: rough RSS at idle, during 1h playback, and during 12h playback (mark these as 'to be measured' if you don't have data — do not invent numbers)",
      "Add a manual test plan: 'Open longest sample script, set speed 1.0, start playback, leave for 12h, verify no crash and RSS within X MB of start'",
      "No code changes needed for this task — it's documentation only"
    ],
    "passes": false
  },
  {
    "category": "edit-tracking",
    "description": "Export the recording log as Premiere Pro marker CSV",
    "steps": [
      "Add a second export option to TrackerView: 'Export Premiere markers (.csv)'",
      "Format: Premiere's marker import CSV expects columns 'Marker Name,Description,In,Out,Duration,Marker Type'. Times are 'HH:MM:SS:FF' (FF = frames). Default to 30fps unless the user can configure it.",
      "Use entry `kind` to choose Marker Type ('To Do', 'Comment', 'Chapter')",
      "Skip superseded entries by default — only export live entries",
      "Add a unit test that builds a sample log and asserts the generated CSV has the expected header + correct timecode for a known timeSeconds value at 30fps"
    ],
    "passes": false
  },
  {
    "category": "edit-tracking",
    "description": "Export the recording log as Final Cut Pro FCPXML markers",
    "steps": [
      "Add an export option 'Export FCPXML markers (.fcpxml)'",
      "Generate minimal FCPXML 1.10 containing chapter and todo markers, one per live log entry, with `start` set to the entry's `timeSeconds` (expressed as a rational timecode appropriate for 30fps)",
      "Validate the XML is well-formed by parsing it back with `XMLDocument`",
      "Skip superseded entries",
      "Add a unit test that parses the generated FCPXML string back into XMLDocument and confirms it contains the expected number of marker elements"
    ],
    "passes": false
  },
  {
    "category": "build-and-ship",
    "description": "Extend build-app.sh with optional Developer ID signing and notarization",
    "steps": [
      "In `Scripts/build-app.sh`, if env var `CODESIGN_IDENTITY` is set, sign the bundle with that identity instead of ad-hoc",
      "If env var `NOTARIZE_PROFILE` is also set, run `xcrun notarytool submit ... --keychain-profile $NOTARIZE_PROFILE --wait` followed by `xcrun stapler staple`",
      "Both env vars unset = current ad-hoc behavior (no breakage for the default dev workflow)",
      "Echo clear status messages for each phase",
      "No new dependencies; rely on stock `codesign` and `xcrun notarytool`"
    ],
    "passes": false
  },
  {
    "category": "build-and-ship",
    "description": "Add a launch-time update-check banner",
    "steps": [
      "On app launch, asynchronously fetch a JSON document from a URL stored as a compile-time constant `UPDATE_FEED_URL` (use a placeholder like `https://example.invalid/teleprompter/latest.json` if no real URL is available — the user will fill this in)",
      "Expected JSON shape: `{ \"version\": \"2.1.0\", \"url\": \"https://...\", \"notes\": \"...\" }`",
      "Compare against the current `CFBundleShortVersionString`. If newer, show a non-modal banner in the operator window with the version and a clickable 'Download' button that opens the url",
      "Fail silently on network error — never block app startup",
      "Add a unit test of the semver comparison logic: '2.0.0' < '2.0.1' < '2.1.0' < '3.0.0', and equal versions don't trigger the banner"
    ],
    "passes": false
  }
]
```
