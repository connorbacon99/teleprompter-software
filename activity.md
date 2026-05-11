# Teleprompter v2 - Activity Log

## Current Status
**Last Updated:** 2026-05-11
**Tasks Completed:** 6
**Current Task:** None (next: edit-tracking — register a global hotkey that logs a flub from any focused app)

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
