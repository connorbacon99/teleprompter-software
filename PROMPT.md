@prd.md @activity.md

We are building the teleprompter app according to the PRD in this repo.

First read `activity.md` to see what was recently accomplished. That tells you what
state the codebase is in coming into this iteration.

## Project context

This is a native macOS teleprompter app written in Swift + AppKit + Core Animation,
located at `/Users/baconc1/Documents/Claude Code Projects/teleprompter-native`.

The product goal is a rock-solid teleprompter for instructors recording long
(8–12 hour) educational content. The key differentiator is **edit-tracking** —
capturing mess-ups, retakes, chapter markers, and notes mid-recording so the
post-production editor has a clean map of what to keep and what to cut. Long-session
stability and seamless editor handoff are the success metrics.

Architecture highlights:
- Single-store reducer pattern (`Sources/Teleprompter/Model/Store.swift`,
  `AppState.swift`). All state mutations go through `store.dispatch(Action)`.
- `Persistence.swift` snapshots scripts + active id + appearance to
  `~/Library/Application Support/Teleprompter/state.json`, debounced 500ms.
- `PlaybackEngine` owns scroll position + speed and drives CABasicAnimation in
  the operator and teleprompter view controllers.
- `TrackerView` is the operator-side recording log UI (timer, countdown, log
  entries with timestamps + paragraph context + notes, CSV export).

## Work on Tasks

Open `prd.md` and find the SINGLE highest-priority task where `"passes": false`.
Tasks are ordered intentionally — earlier tasks set up infrastructure later tasks
depend on, so always take the topmost unfinished task.

Work on exactly ONE task per iteration:
1. Read the task `description` and `steps`
2. Implement the change
3. Run `swift build` — it MUST succeed before you proceed
4. If `Tests/` exists, run `swift test` — all tests MUST pass
5. If the task includes a "write a test" step, add an XCTest covering the change

## Verify

For pure logic changes (reducer, persistence, models, exports, formatters):
- Add or extend a unit test in `Tests/TeleprompterTests/` that exercises the change
- Run `swift test` and confirm the new test passes alongside existing ones

For UI changes (AppKit views, hotkeys, layout, window management):
- Carefully re-read your diff. This loop has no human in it and cannot click
  buttons — be conservative. Prefer small, mechanically obvious changes over
  speculative refactors.
- Run `swift build` to catch compile errors. That is the floor.
- Where any sub-piece is testable headlessly (string formatting, sorting,
  state transitions, export output), add an XCTest for that piece.

If a task genuinely cannot be verified with `swift build` + tests, write down
in `activity.md` exactly what manual smoke test the human should run before
shipping. Then still mark `"passes": true` if your code is sound — the human
will catch UI issues on their next review pass.

## Log Progress

Append a dated entry to `activity.md` with:
- Date/time and which task you worked on
- Files changed (one short line per file)
- Commands run (`swift build`, `swift test`) and their results
- Tests added (file + test name)
- Anything you noticed that's not in the PRD but seems worth flagging
  (architectural issues, bugs you spotted in passing, etc.)

## Update Task Status

When the task is implemented and `swift build` (and `swift test`, if tests
exist) both pass, update that task's `"passes"` field in `prd.md` from `false`
to `true`.

## Commit Changes

Make ONE git commit per task with a clear message:

```
git add -A
git commit -m "<category>: <brief description>"
```

DO NOT run `git init`, do NOT change git remotes, and do NOT `git push`.

## Important Rules

- ONLY work on a SINGLE task per iteration
- Run `swift build` (and `swift test`) before marking a task as passing
- Always log your progress in `activity.md`
- Always commit after completing a task
- Never edit `prd.md` fields other than the `"passes"` boolean of the task you
  just completed (do not rewrite tasks, reorder, or add new ones)
- Never delete files outside `Sources/`, `Tests/`, `dist/`, `.build/` without
  good reason
- Don't disable tests to make them pass — fix the code or the test
- Don't introduce dependencies (no new `Package.swift` `.package(...)` entries)
  unless the task explicitly calls for it
- Don't broaden the macOS deployment target — Catalina 10.15 is the floor

## Completion

When ALL tasks in `prd.md` have `"passes": true`, output exactly:

<promise>COMPLETE</promise>
