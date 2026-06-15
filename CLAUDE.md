# Teleprompter (native macOS rebuild)

Native Swift/AppKit teleprompter — the v2 rebuild of
[teleprompter-software](https://github.com/connorbacon99/teleprompter-software).
Goal: **rock-solid, infrequent updates, runs on a single old Mac.** No voice,
no AI, no cloud. Reliability over features.

## Build & run

```bash
swift build                 # debug build
swift build -c release      # release build
swift test                  # run the XCTest suite (currently 44 tests)
.build/debug/Teleprompter   # launch the app
```

SwiftPM package, `platforms: [.macOS(.v10_15)]`. Three targets:
- `Teleprompter` — library target with all the real code (so tests can `@testable import`).
- `TeleprompterApp` — thin executable (`Sources/TeleprompterApp/main.swift`) that just boots `AppDelegate`.
- `TeleprompterTests` — XCTest target.

## Architecture — the load-bearing invariants

These exist *on purpose* to prevent the v1 desync bugs. Don't break them.

### 1. Single state owner: the `Store` + reducer
- `Store` (`Model/Store.swift`) holds the one `AppState`. All mutation goes
  through `dispatch(Action)` → pure `reduce(state:action:)`. Views never mutate
  shared state directly; they dispatch and re-render from the new state.
- The reducer is **pure and clock-free**. Anything time-dependent
  (`CACurrentMediaTime()`, `Date()`) is captured at the call site and passed
  into the action (e.g. `.recToggle(now:)`, `.recReset(wallclock:)`). This keeps
  the reducer fully unit-testable.
- `Store.subscribe` → fires on every state change (and immediately on subscribe).
  `Store.subscribeActions` → fires only on dispatch, with the action; used for
  side effects that depend on *which* action fired (persistence).

### 2. Single scroll driver: the `PlaybackEngine`
- `Playback/PlaybackEngine.swift` is a **vsync-locked CVDisplayLink** that
  advances `currentPosition` (0…1) once per frame using real elapsed `dt`. Using
  measured elapsed time (not a fixed per-frame increment) means the scroll rate
  never drifts even if a frame is delayed.
- Every render surface (`ScrollingTextView` in the fullscreen window AND in the
  operator's monitor preview) subscribes to the engine and receives the **same
  position in the same `CATransaction`** each tick → atomic, can't desync.
- `ScrollingTextView` is a **pure renderer**: it renders whatever position it's
  handed via `applyStaticPosition(_:)`. It does NOT advance scroll itself.
  (There used to be a parallel `CABasicAnimation` scroll path — it's been fully
  removed. If you see references to `startScrolling`/`visualPosition`/
  `playSessionStartTime`, that's stale; they're gone.)

### 3. Position mapping (operator preview ↔ fullscreen output)
- The operator preview lays out text at the **target display's actual point
  dimensions**, then scales down via `layer.sublayerTransform`. So line-wrap,
  text height, and percent positions are identical on both surfaces by
  construction. `engine.totalDistance` is the same regardless of which view set it.
- Position 0 = first line at the eye-line (reading triangles); position 1 = last
  line at the eye-line. Script scrolls fully through the eye-line.

### 4. Text pagination (`ScrollingTextView`)
- Long scripts are split into **stacked `CATextLayer` "pages"** capped at
  `maxPageHeightPts = 3500`. A single tall `CATextLayer` silently fails to
  render past the GPU max texture size (~4096pt at 2× on older Intel Macs) — see
  the memory note `native_macos_catextlayer_texture_limit`.
- **No paragraph style** is applied — CATextLayer's CoreText rendering doesn't
  reliably honor line-spacing properties, and any mismatch between measurement
  and rendering shows as black gaps. Font + color attributes only; measurement
  (`boundingRect`) then matches rendering. (This is why there's no line-spacing
  UI control yet — it's a real constraint, not an oversight.)

### 5. Mirror/flip for beam-splitter glass
- The reflection transform negates the scroll y-axis; `ty(forPosition:)`
  compensates so playback always reads forward in all 4 mirror/flip combos.
- The **operator preview is intentionally never mirrored/flipped** — it stays
  readable while the fullscreen output is reflected through the glass.
- CATransform3D matrices are built right-to-left (CA's row-vector convention) —
  see memory note `native_macos_catransform3d_row_vector_trap`.

## Persistence (`Model/Persistence.swift`)
- Saves scripts (content + cues + recording log), active script id, and
  appearance to `~/Library/Application Support/Teleprompter/state.json`.
- **Does NOT persist** playback/display/teleprompter-window/timer state — those
  reset clean each launch. The recording-timer anchor is a process-relative
  `CACurrentMediaTime`, meaningless across launches.
- **Corrupt-file resilience**: a decode failure backs the bad file up to
  `state.json.bak.<timestamp>` and returns nil (treats as no saved state)
  rather than crashing.
- **Tolerant decoding**: `Script` and `RecordingLogEntry` have custom
  `init(from:)` that default missing fields (e.g. older files with no
  `recordingLog`/`cues`/`kind`/`wallclock`/`superseded`). A throw here would make
  `load()` treat the whole snapshot as corrupt and discard every saved script —
  so new optional fields MUST be added with `decodeIfPresent` + a default.
- **Save timing**: recording-log mutations (`Action.isRecordingLogMutation`,
  which includes `.recReset` because it can append a session divider) save
  **synchronously** — a flub logged at hour 11 of a 12h shoot must survive an
  immediate kill. Everything else debounces 500ms. Wired in `AppDelegate`.

## Features (current)
- Variable speed 0.1–3× (slider + ↑/↓ arrows), play/pause (space), seek slider +
  Home/End, scroll-wheel jog on the preview.
- Horizontal mirror + vertical flip. Per-display fullscreen output. Adjustable
  font size. Esc panic-close from either window.
- **Bookmarks**: `B` drops a cue at the current scroll position; the operator
  sidebar "Bookmarks" pull-down lists them and seeks to the chosen one.
- **Recording tracker** (`Operator/TrackerView.swift` + compact
  `TrackerHUDView.swift` docked under the monitor preview): countdown→timer,
  log entries by kind (flub/clean/retake/chapter/note), auto-fills the script
  paragraph at the current scroll position, inline-editable, CSV export.
  - Entry kinds + supersede logic: a `.retake` auto-supersedes prior `.flub`
    entries in its chapter window; `.chapter` and `.session` dividers are hard
    boundaries a retake won't reach across.
  - `.session` divider: synthetic row inserted by the reducer on timer reset
    (when the log is non-empty + timer was non-idle). Numbered Session 2, 3, …
  - Global `⌃⌥F` hotkey (Carbon `RegisterEventHotKey`) logs a flub from any app
    without alt-tabbing. Falls back to the in-app button if registration fails.
- Progress indicator: "N% through script • ~M min remaining at current speed".
- PowerPoint import (`Operator/PowerPointImport.swift`).

## Conventions
- Heavy explanatory comments on non-obvious decisions — match that density.
- New `Action` cases that touch the recording log → add to
  `isRecordingLogMutation` AND its test in the same change.
- Reducer stays pure: pass clocks/dates in via the action.
- Commit style: `area: imperative summary` (e.g. `scroll-core:`, `stability:`,
  `operator-ergonomics:`, `edit-tracking:`). Co-author trailer on commits.

## Not done yet / known gaps (optional, scoped out for now)
- On-prompter 3-2-1 pre-roll countdown overlay (the *recording* timer has a
  countdown; the *scroll* playback does not).
- UI for text/background color (state + persistence already support it).
- Line-spacing control — blocked by the CATextLayer constraint above.
- No visual confirmation that scroll looks smooth on a real second display has
  been done by an agent (headless can't watch it) — eyeball it on hardware.

## Recent work log
- **scroll-core review** (`dc62751`): removed the dead `CABasicAnimation` scroll
  path so `PlaybackEngine` is the sole driver; slimmed `Playback` state to
  playing/position/speed (dropped unread epoch/countdown fields); removed
  duplicate pause-position capture; added the Bookmarks jump UI (cues were
  previously write-only).
- **stability review** (`7d43e11`): fixed the tracker Start/Cancel button title
  not updating when countdown crosses zero; tolerant `Script` decoding to avoid
  wiping saved scripts; moved session-divider-on-reset into the reducer
  (`.recReset(wallclock:)`) so both tracker surfaces share one path; bookmark
  hotkey reads timer from the store directly.
