# Teleprompter v2 - Activity Log

## Current Status
**Last Updated:** 2026-05-11
**Tasks Completed:** 10
**Current Task:** None (next: stability — Don't crash if the secondary display is disconnected mid-session)

---

## Session Log

<!--
Each Ralph iteration appends a dated entry here.

Format:

### YYYY-MM-DD HH:MM — Task: <task description>
- **Files changed:** Sources/...swift (what changed), Tests/...swift (what added)
- **Commands:**
  - `swift build` → success
  - `swift test` → 12/12 passing
- **Tests added:** TeleprompterTests/ReducerTests.swift — `testFlubMarkSupersedes`
- **Notes:** Anything off-PRD that's worth flagging
-->

### 2026-05-11 — Task: testing — Add XCTest scaffolding so the loop can verify changes headlessly

- **Files changed:**
  - `Package.swift` — split into a `Teleprompter` library target, a thin `TeleprompterApp` executable target (still producing the `Teleprompter` product/binary so `Scripts/build-app.sh` keeps working), and a `TeleprompterTests` test target.
  - `Sources/TeleprompterApp/main.swift` — new thin executable entry point that imports `Teleprompter` and instantiates `AppDelegate`.
  - `Sources/Teleprompter/main.swift` — removed (relocated to the executable target).
  - `Sources/Teleprompter/AppDelegate.swift` — marked `AppDelegate`, its `init`, and the three NSApplicationDelegate conformance methods (`applicationDidFinishLaunching`, `applicationShouldTerminateAfterLastWindowClosed`, `applicationWillTerminate`) `public` so the executable target can use the class.
  - `Tests/TeleprompterTests/ReducerTests.swift` — new XCTest file with three pure-reducer tests.
- **Commands:**
  - `swift build` → success (library + executable both compile).
  - `swift test` → **could not run on this machine**: only Command Line Tools are installed; XCTest framework ships with full Xcode and is missing here (`error: no such module 'XCTest'`). Build of the test module fails at the import, not in the test logic.
- **Tests added:** `Tests/TeleprompterTests/ReducerTests.swift`
  - `testScriptAddAppendsAndActivates`
  - `testSetPositionClampsToUnitInterval`
  - `testRecordingLogAddAppendsEntry`
- **Manual verification the human should run before shipping:** install Xcode (or use a machine that has it), then from the repo root run `swift test` — all three reducer tests should pass. This is the only way to confirm `swift test` works end-to-end on this codebase from now on.
- **Notes:** Because Command Line Tools alone don't include XCTest, the ralph loop running on this exact machine cannot execute `swift test`. Every subsequent task that asks "add a unit test" can still write the test (the test target compiles fine structurally), but it can only be executed on a machine with Xcode. Future iterations should still add the tests as the PRD requires.

### 2026-05-11 — Task: stability — Make Persistence.load() resilient to corrupt state.json

- **Files changed:**
  - `Sources/Teleprompter/Model/Persistence.swift` — extracted a testable `loadFrom(url:)` static method. On `JSONDecoder` failure it copies the bad file to `<name>.bak.<unix-timestamp>` in the same directory, NSLogs the underlying error, and returns nil. Missing/unreadable files still return nil silently (no spurious backup). `load()` now delegates to `loadFrom(url: fileURL)`.
  - `Tests/TeleprompterTests/ReducerTests.swift` — added `testPersistenceLoadFromCorruptFileReturnsNilAndBacksUp` (writes garbage to a tmpdir, asserts `loadFrom` returns nil and creates exactly one `state.json.bak.*` sibling) and `testPersistenceLoadFromMissingFileReturnsNilSilently` (no file present → nil, no backup).
- **Commands:**
  - `swift build` → success.
  - `swift test` → **5/5 passing** (3 prior reducer tests + 2 new persistence tests). XCTest is actually available on this machine after all; the prior iteration's note was wrong.
- **Tests added:** `Tests/TeleprompterTests/ReducerTests.swift`
  - `testPersistenceLoadFromCorruptFileReturnsNilAndBacksUp`
  - `testPersistenceLoadFromMissingFileReturnsNilSilently`
- **Notes:** Backup uses `copyItem` rather than `moveItem` so the original `state.json` stays in place; the next `save()` will overwrite it atomically. This avoids a window where the app is running with no state file at all (which would also be safe given the rest of the code, but the copy semantics are easier to reason about). Timestamp resolution is per-second — two corrupt loads in the same second would collide, but in practice load only happens once per launch, so a UUID suffix would be over-engineering.

### 2026-05-11 — Task: stability — Persist recording-log mutations immediately, not just on the 500ms debounce

- **Files changed:**
  - `Sources/Teleprompter/Model/Store.swift` — added `subscribeActions` / `unsubscribeActions` and an `actionObservers` list. `dispatch` now fans out to both state observers (existing) and action observers (new) in that order. Action observers receive `(AppState, Action)` and are NOT invoked on subscribe (no action yet).
  - `Sources/Teleprompter/Model/AppState.swift` — added `Action.isRecordingLogMutation` computed property covering `recordingLogAdd`, `recordingLogUpdateLine`, `recordingLogUpdateNote`, `recordingLogRemove`, and `recordingLogClear`. Doc-comment captures the invariant: a flub at hour 11 of a 12h shoot must survive an immediate process kill.
  - `Sources/Teleprompter/Model/Persistence.swift` — extracted a testable `saveTo(_:url:)` static method that writes the snapshot atomically to an arbitrary URL. `save(_:)` now delegates to it with `fileURL`.
  - `Sources/Teleprompter/AppDelegate.swift` — replaced the state-based persistence subscriber with an action-based one (`persistenceSaveAfter(action:state:)`). Recording-log actions: cancel any pending debounce timer and write to disk synchronously. All other actions: keep the 500ms debounced save (typing, appearance, playback, etc.).
  - `Tests/TeleprompterTests/ReducerTests.swift` — added three new tests (see below).
- **Commands:**
  - `swift build` → success.
  - `swift test` → **8/8 passing** (5 prior tests + 3 new).
- **Tests added:** `Tests/TeleprompterTests/ReducerTests.swift`
  - `testRecordingLogActionsAreFlaggedForImmediatePersistence` — asserts every `recordingLog*` action returns true from `isRecordingLogMutation` and that a representative set of non-log actions returns false. Forces future additions to opt in or out explicitly.
  - `testRecordingLogActionTriggersSynchronousPersistence` — wires a store with an action observer that mirrors the AppDelegate behavior (sync `Persistence.saveTo` on log mutations), dispatches a `recordingLogAdd`, and asserts the file exists on disk by the time `dispatch` returns and that `loadFrom` reads the entry back.
  - `testNonRecordingLogActionDoesNotTriggerSynchronousPersistence` — dispatches `setFontSize`, `setPosition`, and `scriptSetContent` and asserts no file is written, confirming the debounce path is preserved for non-log mutations.
- **Notes:** The action-observer pattern is generally useful — any future side-effect that depends on *which* action fired (not just the resulting state) can hook into it. Also: I deliberately did NOT re-fire the persistence save on app startup. The old code's `store.subscribe { ... schedulePersistenceSave }` was called once with the initial state and scheduled a debounced save right after launch. The new `subscribeActions` path doesn't fire on subscribe, so the first save now happens only after the user does something. That matches `applicationWillTerminate`'s explicit final save and removes a tiny bit of disk noise at startup.

### 2026-05-11 — Task: edit-tracking — Add an EntryKind field to RecordingLogEntry

- **Files changed:**
  - `Sources/Teleprompter/Model/AppState.swift` — added `enum EntryKind: String, Codable, CaseIterable { flub, clean, chapter, retake, note }`; added `var kind: EntryKind` to `RecordingLogEntry` with a custom `init(from:)` that uses `decodeIfPresent` so old persisted state defaults to `.flub`; added a memberwise init defaulting `kind = .flub`. Added `recordingLogSetKind(scriptId:entryId:kind:)` to `Action` and extended `isRecordingLogMutation` to cover it (immediate-save invariant must apply to kind changes too).
  - `Sources/Teleprompter/Model/Store.swift` — reduced `recordingLogSetKind` by locating the script + entry and assigning `kind`.
  - `Sources/Teleprompter/Operator/TrackerView.swift` — added a "Kind" column (between Time and Line) backed by an `NSPopUpButton`. The popup's identifier carries the entry id (same `kind:<uuid>` scheme used for line/note text fields); selection dispatches `recordingLogSetKind`. Added a `kindTitle(_:)` static helper for display titles.
  - `Tests/TeleprompterTests/ReducerTests.swift` — added `testRecordingLogEntryDecodesWithoutKindFieldDefaultsToFlub` (decodes legacy JSON with no `kind` key) and `testRecordingLogSetKindUpdatesEntryKind`. Extended `testRecordingLogActionsAreFlaggedForImmediatePersistence` to include `recordingLogSetKind` in the must-be-flagged set.
- **Commands:**
  - `swift build` → success.
  - `swift test` → **10/10 passing** (8 prior + 2 new).
- **Tests added:** `Tests/TeleprompterTests/ReducerTests.swift`
  - `testRecordingLogEntryDecodesWithoutKindFieldDefaultsToFlub`
  - `testRecordingLogSetKindUpdatesEntryKind`
- **Manual smoke (UI):** Open the operator window, start a recording session, hit "Log line" a few times. The new "Kind" column shows a popup defaulting to "Flub". Changing the selection should immediately reflect in the popup and (because `recordingLogSetKind` is flagged as a log mutation) be persisted synchronously to `state.json`. Killing the app right after changing the popup should leave the new kind on disk.
- **Notes:** `RecordingLogEntry` was previously a synthesized-Codable struct; explicit `CodingKeys` + custom `init(from:)` means future fields (wallclock, superseded) follow the same tolerant-decode pattern. The custom init also forced an explicit memberwise initializer — kept the parameter order matching the old call sites (`id, timeSeconds, line, note`) so `TrackerView.logAction()` still works unchanged. The PRD's next two edit-tracking tasks (wallclock, supersede-on-retake) will need to add their own `decodeIfPresent` calls inside the same `init(from:)`.

### 2026-05-11 — Task: edit-tracking — Stamp each RecordingLogEntry with a wallclock ISO-8601 timestamp

- **Files changed:**
  - `Sources/Teleprompter/Model/AppState.swift` — added `var wallclock: Date` to `RecordingLogEntry`. Memberwise init defaults `wallclock = Date()` so every callsite gets a real timestamp by default. `init(from:)` decodes `wallclock` via `decodeIfPresent`, falling back to `.distantPast` for legacy entries (chosen over "now" so old entries are visibly "unknown" rather than mis-dated to whenever the user reopened the app). Updated `CodingKeys` to include `wallclock`.
  - `Sources/Teleprompter/Operator/TrackerView.swift` — `logAction()` now passes `wallclock: Date()` explicitly to the entry init (already the default, but makes the stamping intent legible). Promoted `csvText(for:moduleName:)` to a `static` method so the test target can call it without instantiating an NSView. Added a `Wallclock` column to the CSV header (between `Time` and `Kind`) plus a `Kind` column (already had popup UI, was missing from CSV — fixed in passing). Added `csvWallclock(_:)` helper that returns an ISO-8601 (UTC `Z`) string, or empty string when the wallclock is `.distantPast` (so legacy entries don't render as year-0001 in the editor's CSV import).
  - `Tests/TeleprompterTests/ReducerTests.swift` — `import Cocoa` so the file can name `TrackerView` (static csvText call). Extended the legacy-decode test to additionally assert `wallclock == .distantPast`. Added `testRecordingLogEntryDefaultWallclockIsRecent` (default-init wallclock falls between two `Date()` snapshots) and `testCSVExportContainsParseableISO8601WallclockColumn` (asserts header is `Module,Time,Wallclock,Kind,Line,Note`, that a known timestamp round-trips through `ISO8601DateFormatter` within 1s, and that `.distantPast` wallclock renders as empty in the CSV).
- **Commands:**
  - `swift build` → success.
  - `swift test` → **12/12 passing** (10 prior + 2 new).
- **Tests added:** `Tests/TeleprompterTests/ReducerTests.swift`
  - `testRecordingLogEntryDefaultWallclockIsRecent`
  - `testCSVExportContainsParseableISO8601WallclockColumn`
- **Notes:** The CSV header changed shape (added `Wallclock` and `Kind` columns) — any downstream tooling reading the CSV via fixed column positions instead of names would need updating, but as of this iteration there is no such tooling. The Premiere/FCPXML export tasks coming up will produce their own column layouts, so this CSV is purely for human review or generic spreadsheet use. The `Kind` column had been added to the UI in the previous task but was missing from CSV export; folded that fix into this task since the wallclock change already touched the same lines. The static `iso8601Formatter` is cached at module load (ISO8601DateFormatter is documented as thread-safe). `Date.distantPast == Date.distantPast` is a stable equality comparison in Swift so the "render as empty" guard is reliable.

### 2026-05-11 — Task: edit-tracking — Register a global hotkey that logs a flub from any focused app

- **Files changed:**
  - `Sources/Teleprompter/AppDelegate.swift` — added `import Carbon.HIToolbox`, declared `Notification.Name.teleprompterFlubHotkey`, and added `registerFlubHotkey()` / `unregisterFlubHotkey()` helpers. Registration happens at the tail of `applicationDidFinishLaunching` (after the operator window is constructed) and unregistration is the first thing in `applicationWillTerminate`. The handler hops to main with `DispatchQueue.main.async` and posts the notification — it never touches the store directly so all dispatch stays on AppKit's thread. Both `InstallEventHandler` and `RegisterEventHotKey` failures NSLog and return without crashing (the task's "do not crash if the combo is taken" requirement). Combo: ⌃⌥F via `kVK_ANSI_F` + `controlKey | optionKey`.
  - `Sources/Teleprompter/Operator/TrackerView.swift` — `init` registers an observer for `.teleprompterFlubHotkey`; `deinit` removes it. The handler is a one-line `@objc func handleFlubHotkey() { logAction() }` so the hotkey path and the "Log line" button share the same dispatch logic (active script, current elapsed timer state, paragraph at current scroll position, kind=.flub, wallclock=now). No changes to `logAction()` itself.
  - `Tests/TeleprompterTests/ReducerTests.swift` — added `testFlubHotkeyNotificationAppendsFlubEntryToActiveScript`: sets script content, constructs a TrackerView with a real Store+Engine, posts the `.teleprompterFlubHotkey` notification, and asserts a single new entry exists with `kind == .flub` and a non-empty `line` (paragraph capture worked).
- **Commands:**
  - `swift build` → success.
  - `swift test` → **15/15 passing** (14 prior + 1 new).
- **Tests added:** `Tests/TeleprompterTests/ReducerTests.swift`
  - `testFlubHotkeyNotificationAppendsFlubEntryToActiveScript`
- **Manual smoke (UI):** Launch the app, then activate any other app (Finder, Safari, the camera control app). Press ⌃⌥F. Switch back to the operator window's Tracker tab; a new entry of kind "Flub" should be at the bottom of the table, time stamped at the live recording-timer elapsed value (or 0:00 if the timer was idle), with the paragraph at the current scroll position captured into the Line column. If another app has registered ⌃⌥F system-wide, the registration will fail silently — check the console for "RegisterEventHotKey for ⌃⌥F failed" — and the in-app Log line button remains the fallback.
- **Notes:** Carbon's `RegisterEventHotKey` is the right primitive here per the PRD — it's deprecated on paper but still works on Catalina+ and does not require accessibility entitlements, which would complicate distribution. The 'TELE' (0x54454C45) hotkey signature is unique per app per Apple's documentation. The Carbon-handler → notification indirection means TrackerView doesn't need to know anything about Carbon, and a future "tracker view not yet built" startup state simply means no observer to fire — registration still succeeds, the notification gets posted to nobody, no crash.
  - Per the task description "active whenever the operator window is open": in this codebase the operator window opens during `applicationDidFinishLaunching` and closing it terminates the app (per `applicationShouldTerminateAfterLastWindowClosed`), so registering at launch / unregistering at terminate exactly matches that lifecycle. If a future task makes the operator window closable-without-quitting we'll need to gate registration on the willClose/becameVisible notifications instead.

### 2026-05-11 — Task: operator-ergonomics — Add a bookmark hotkey (B) that adds a cue marker at the current scroll position

- **Files changed:**
  - `Sources/Teleprompter/Operator/TrackerView.swift` — added `static bookmarkLabel(elapsedSeconds:wallclock:)` that returns `"Bookmark H:MM:SS"` when a session timer value is supplied (≥ 0) and falls back to `"Bookmark HH:MM:SS"` from a wallclock formatter (local timezone) otherwise. Added a public `currentRecordingElapsedSeconds()` accessor that wraps the existing private `currentElapsedSeconds()` and returns nil for both `.idle` and countdown (negative) — so the bookmark hotkey only stamps a timer value when the session is actually past 0:00.
  - `Sources/Teleprompter/Operator/OperatorViewController.swift` — added `case 11` ('B') to the existing local keyDown monitor. Guards: returns the event through when Control or Option is held (so Ctrl+B/Opt+B can still map elsewhere — plain B and Shift+B both bookmark), and when the window's first responder is any `NSText` (catches the script editor's NSTextView, the tracker line/note field editors, and the tab-bar rename field — typing 'B' in any text input still produces a literal 'B'). New `addBookmarkAtCurrentPosition()` reads the live `engine.currentPosition`, asks the trackerView for its elapsed seconds, builds the label, and dispatches `cueAdd`. New `flashBookmarkConfirmation(label:)` lazily creates a centered, semi-transparent HUD label pinned to bottom-of-window, sets it to `"   Added: Bookmark H:MM:SS   "`, and arms a 1.5 s Timer to hide it. Re-pressing 'B' replaces the label and restarts the timer instead of stacking. Stored on the VC: `bookmarkFlashLabel` and `bookmarkFlashTimer`; the timer is invalidated in `deinit`.
  - `Tests/TeleprompterTests/ReducerTests.swift` — added `testBookmarkLabelFormatsElapsedSecondsAsHMS` (covers 0, 5, 90, 3600, 3661, and verifies fractional seconds truncate not round), `testBookmarkLabelFallsBackToWallclockWhenTimerNotRunning` (constructs a specific local-time `Date` via `DateComponents` so the assertion is timezone-stable, and confirms countdown / negative elapsed also falls back to wallclock), and `testCueAddAppendsAndSortsByPosition` (three out-of-order bookmarks → cues sorted by position).
- **Commands:**
  - `swift build` → success.
  - `swift test` → **18/18 passing** (15 prior + 3 new).
- **Tests added:** `Tests/TeleprompterTests/ReducerTests.swift`
  - `testBookmarkLabelFormatsElapsedSecondsAsHMS`
  - `testBookmarkLabelFallsBackToWallclockWhenTimerNotRunning`
  - `testCueAddAppendsAndSortsByPosition`
- **Manual smoke (UI):** Launch the app. With the operator window key and no text field focused, press B — a centered HUD pill near the bottom of the operator window shows "Added: Bookmark …" for 1.5 s; switch to the Monitor view's cue list (if surfaced) or restart the app and inspect `state.json` for the new entry in the active script's `cues` array. Also: click into the editor and type "BBBB" — it must produce four literal B's, not four bookmarks. Same test from inside a tracker line/note text field, and from inside the tab-bar rename field.
- **Notes:** Existing pre-switch guard `firstResponder === editorTextView` only filters the script editor — Space/arrows/Home/End in tracker text fields still get intercepted today (latent issue, not in this task's scope). I added the broader `is NSText` check inline in the new `case 11` so the bookmark hotkey alone gets the right gating without changing behavior of the other keys. If the next iteration touches this monitor, lifting that `is NSText` check up above the switch would fix the existing latent issue for all keys; I left it alone to keep this change tight. The HUD label is a child of the VC's root view, so it overlays whichever tab (Editor/Monitor/Tracker) is visible — that's the intended behavior since the bookmark hotkey is global to the operator window. Format note: timer-based labels use `H:MM:SS` (no leading zero on hours — `0:01:30` for 90 s, `1:01:01` for 3661 s); wallclock fallback uses `HH:mm:ss`. Matched the existing CSV time format style (no leading zero on minutes) where reasonable, but went with always-three-segments (H:MM:SS) so the label stays readable as a Premiere/FCP marker name once those export tasks land. `DateFormatter` for the wallclock is cached at module load (thread-safe per Apple docs for read-only use).

### 2026-05-11 — Task: edit-tracking — Auto-supersede flub entries when a retake-from-here is logged

- **Files changed:**
  - `Sources/Teleprompter/Model/AppState.swift` — added `var superseded: Bool` to `RecordingLogEntry` with tolerant decode (`decodeIfPresent ?? false`) and default `false` in the memberwise init. Extended `CodingKeys` to include `superseded`.
  - `Sources/Teleprompter/Model/Store.swift` — in the `recordingLogAdd` reducer case, after appending a `.retake` entry, walk back from the retake (exclusive) to the most recent `.chapter` (exclusive) — or the start of the log if no chapter yet — and flip every `.flub` in that window to `superseded = true`. Clean/chapter/note entries in that window are left untouched, as are flubs that sit *before* the chapter boundary.
  - `Sources/Teleprompter/Operator/TrackerView.swift` — added a `Status` column to `csvText(for:moduleName:)` between `Kind` and `Line`. Value is `live` for normal entries, `superseded` for flubs that have been overridden by a retake. New header is `Module,Time,Wallclock,Kind,Status,Line,Note`.
  - `Tests/TeleprompterTests/ReducerTests.swift` — updated `testCSVExportContainsParseableISO8601WallclockColumn` for the new header + `Status` column index; added `testRetakeSupersedesPriorFlubsInChapterWindow` (covers flub/flub/retake, chapter/flub/retake, and flub/chapter/retake — the third case verifies the chapter actually scopes the window) and `testRecordingLogEntryDecodesWithoutSupersededFieldDefaultsToFalse`.
- **Commands:**
  - `swift build` → success.
  - `swift test` → **14/14 passing** (12 prior + 2 new).
- **Tests added:** `Tests/TeleprompterTests/ReducerTests.swift`
  - `testRetakeSupersedesPriorFlubsInChapterWindow`
  - `testRecordingLogEntryDecodesWithoutSupersededFieldDefaultsToFalse`
- **Notes:** The CSV header changed shape *again* (now seven columns instead of six). The Premiere/FCPXML export tasks coming up will use entry `kind` and `superseded` directly from the model, not by re-parsing CSV — so the column-order churn is contained to this one export. The supersede logic runs entirely inside the `recordingLogAdd` reducer case (no separate `markSuperseded` action) because the only trigger is "a retake was just added" — keeping it in one place makes the invariant easier to read. If a retake is later removed via `recordingLogRemove`, the prior flubs stay marked `superseded` — that's intentional for now (the operator's intent at the moment of the retake is what we capture), but a future iteration could revisit if it turns out to be confusing. UI does not yet surface `superseded` visually (greyed-out row, strikethrough) — only CSV export reflects it. That's deferred until the human reviews; the model + export side is what the editor handoff depends on.

### 2026-05-11 — Task: operator-ergonomics — Visual session-divider row in the recording log table when the timer is reset

- **Files changed:**
  - `Sources/Teleprompter/Model/AppState.swift` — added `.session` to `EntryKind` for synthetic divider entries. Note in the case-comment that it's not operator-selectable (no popup option) and that the supersede logic treats it as a chapter-equivalent boundary.
  - `Sources/Teleprompter/Model/Store.swift` — broadened the supersede boundary in the `recordingLogAdd` reducer case from "most recent `.chapter`" to "most recent `.chapter` OR `.session`". This is a correctness fix surfaced by introducing the session boundary: a retake in session N must not flip flubs in session N-1.
  - `Sources/Teleprompter/Operator/TrackerView.swift` —
    - `resetAction()` now routes the confirmed-reset path through a new `applyResetWithDivider()` helper that dispatches a synthetic `.session` `RecordingLogEntry` (timeSeconds 0, line = "Session N started YYYY-MM-DD HH:MM:SS", wallclock now) when there are existing entries. Reset of an already-idle timer or an empty log still goes through the no-op branch unchanged.
    - Added a static `sessionDividerLabel(priorDividerCount:wallclock:)` helper so the label format is testable headlessly. Numbering: `priorDividerCount + 2` so the first divider opens "Session 2" (entries before any divider are the implicit Session 1).
    - Added a `tableView(_:rowViewForRow:)` / `tableView(_:heightOfRow:)` pair that returns a custom `SessionDividerRowView` (taller 36pt row, lighter background ~white 0.18 with 1px hairlines top/bottom, no selection emphasis) for `.session` rows and falls through to the default otherwise.
    - `viewFor` short-circuits for `.session` rows: only the line column renders content (semibold 12pt label with the divider text); the other columns return empty cells so the row-view background paints through. No popup, no editable text fields on divider rows.
    - The Kind popup on non-session rows now filters `.session` out of `EntryKind.allCases` so an operator can't accidentally turn a regular entry into a synthetic divider.
    - `kindTitle` gained a `case .session: return "Session"` so CSV export and any future UI surface gets a sensible display string.
  - `Tests/TeleprompterTests/ReducerTests.swift` — added four tests covering the divider label, the cross-session supersede guarantee, CSV rendering, and the reducer-level reset+divider sequence (see below).
- **Commands:**
  - `swift build` → success.
  - `swift test` → **26/26 passing** (22 prior + 4 new).
- **Tests added:** `Tests/TeleprompterTests/ReducerTests.swift`
  - `testSessionDividerLabelFormatsSessionNumberAndWallclock`
  - `testRetakeDoesNotSupersedeFlubsAcrossSessionBoundary`
  - `testCSVExportRendersSessionDividerRow`
  - `testTrackerResetWithEntriesInsertsSessionDividerThenIdle`
- **Manual smoke (UI):** Open the operator window with any script that already has a couple of logged entries (or log a couple of flubs first). Hit Start → wait a few seconds → hit Reset → confirm in the sheet. A new row should appear at the bottom of the tracker table styled as a header band (taller, lighter background, hairlines top/bottom, semibold text in the Line column reading "Session 2 started <today's date HH:MM:SS>"). The Kind column on that row is empty (no popup). Hit Start/Reset a second time → another divider appears reading "Session 3 started ...". Confirm the operator-selectable Kind popup on regular entries no longer offers "Session" in the dropdown list. Confirm CSV export: a divider row renders as `<module>,0:00,<iso8601>,Session,live,"Session N started …",`.
- **Notes:** Implementation choice: option (a) — a new `.session` `EntryKind` — wins over option (b) — a parallel `sessionDividers: [Date]` array on `Script` — by a wide margin on row-math invasiveness. With option (a), `numberOfRows`, `tableView.reloadData()` after `applyState`, and the index-by-id lookups in `controlTextDidEndEditing` / `kindPopupChanged` all remain unchanged; the only table-side adds are the row-view + heightOfRow delegate methods and a short-circuit branch in `viewFor`. Option (b) would have forced a parallel iteration scheme over both arrays at every row index lookup, which is the exact kind of churn the PRD told me to minimize.
  - The CSV "blank row" option from the PRD wasn't strictly needed — the divider renders fine through the standard column layout with `kind=Session` and the human-readable label in the `Line` column. Downstream Premiere / FCPXML exports (later tasks) will read `entry.kind` directly off the model anyway, so a special CSV shape would only fragment the format.
  - The supersede-boundary widening (`.chapter` → `.chapter` OR `.session`) is a behavior change for any user who had logged a retake in a previously-flubbed session and reset the timer in between (under the new rule, those earlier flubs would stay live where before they'd be superseded). In practice this is a corner case that produces a *more conservative* edit map — the editor sees the flubs as live takes to review rather than silently skipping them — which matches the PRD's "seamless editor handoff" success metric. No existing tests broke; the prior `testRetakeSupersedesPriorFlubsInChapterWindow` already pinned the chapter-boundary semantics and the new `testRetakeDoesNotSupersedeFlubsAcrossSessionBoundary` pins the session-boundary case alongside it.
  - Edge case left alone for now: if the operator manually deletes a `.session` divider via `recordingLogRemove`, the supersede flags on flubs in the surrounding sessions don't recompute. Consistent with the existing "remove a retake → prior flubs stay marked" behavior — supersede is intent at the moment of insertion. A future iteration could revisit if this ever surprises an editor.

### 2026-05-11 — Task: operator-ergonomics — Show a progress indicator: 'NN% through script • ~MM min remaining at current speed'

- **Files changed:**
  - `Sources/Teleprompter/Operator/OperatorViewController.swift` — added a `progressLabel` NSTextField under the position slider in the operator sidebar (Playback section, before the spacer before Appearance). Style: smaller (11pt, white 0.62) than the slider labels so it reads as supplementary; wraps to 2 lines if it ever overflows. Added a `progressUpdateTimer: Timer?` that fires at 0.5 s while the view is visible — matches the PRD's "at most twice per second" cap and is independent of the existing 0.1s position-poll timer (which only fires during playback). `updateProgressLabel()` reads `engine.currentPosition`, `engine.totalDistance`, `engine.speed`, and `engine.pixelsPerSecondAt1x` and feeds them to a new static `progressIndicatorText(position:totalDistance:speed:pixelsPerSecondAt1x:)` helper. The static helper is pure (testable from XCTest with no NSView setup). Also called from the tail of `applyState` so slider drags get an immediate label refresh instead of waiting up to 500 ms for the next timer tick. Timer is invalidated in both `viewDidDisappear` and `deinit`.
  - `Tests/TeleprompterTests/ReducerTests.swift` — added a `// MARK: - Progress indicator (operator-ergonomics)` section with four pure-function tests covering format, speed scaling, fallback, and clamping (see below).
- **Commands:**
  - `swift build` → success.
  - `swift test` → **22/22 passing** (18 prior + 4 new).
- **Tests added:** `Tests/TeleprompterTests/ReducerTests.swift`
  - `testProgressIndicatorTextFormatsPercentAndMinutes` — midpoint of a 9600 pt @ 1× script reports "50% through script • ~1 min remaining at current speed"; start of a 14400 pt @ 1× script reports 3 min; end reports 100% and 0 min.
  - `testProgressIndicatorTextDoubleSpeedHalvesRemaining` — same 14400 pt script at 2× (90 s = 2 min after rounding) and 0.5× (360 s = 6 min).
  - `testProgressIndicatorTextFallsBackWhenRateOrDistanceIsZero` — speed=0 and totalDistance=0 both render the "~? min" sentinel rather than dividing by zero.
  - `testProgressIndicatorTextClampsPositionOutsideUnitInterval` — defensive: negative and >1 positions clamp to 0% / 100% (and remaining-time is computed from the clamped value), so a caller passing 1.5 doesn't see "150% • ~-3 min".
- **Manual smoke (UI):** Open the operator window with any script loaded. The new label below the position slider should read `NN% through script • ~MM min remaining at current speed` where NN matches the position slider's percentage. Drag the speed slider — `MM` should roughly double when halving speed and roughly halve when doubling speed, with refresh within ~0.5 s. Press Play and watch the percent climb while remaining minutes count down. The label updates while paused too (it's not gated on `engine.isPlaying`, unlike the 0.1 s position-slider poll). Drag the font slider — totalDistance updates on the next MonitorPreviewView layout pass, and the timer picks up the new remaining-time within 0.5 s.
- **Notes:** `engine.totalDistance` is set by MonitorPreviewView and TeleprompterViewController during their relayout passes. If the operator opens the window and the monitor view hasn't laid out yet, `totalDistance` is still the engine's default 1.0 — the formula gives a near-zero remaining time on the very first tick, which the next 0.5 s tick corrects once layout finishes. I considered showing "calculating..." for that frame but it adds branching for ~500 ms of latency that the user is unlikely to notice. The `pixelsPerSecondAt1x` constant (80) is duplicated between PlaybackEngine and ScrollingTextView — not in scope to dedupe here, but worth flagging in case a future task touches the base scroll rate. The static helper takes the rate as a parameter for exactly that reason — if it ever becomes user-configurable, the formula doesn't change. Used `Int((x).rounded())` for both percent and minutes; a 30-second remainder rounds up to 1 min, which feels right for a status label.
