# Teleprompter v2 - Activity Log

## Current Status
**Last Updated:** 2026-05-11
**Tasks Completed:** 1
**Current Task:** None (next: stability — resilient Persistence.load)

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
