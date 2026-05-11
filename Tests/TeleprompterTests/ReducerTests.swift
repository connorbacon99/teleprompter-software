import XCTest
import Cocoa
@testable import Teleprompter

final class ReducerTests: XCTestCase {

    func testScriptAddAppendsAndActivates() {
        let initial = AppState.initial()
        let beforeCount = initial.scripts.count

        let after = reduce(state: initial, action: .scriptAdd(name: "New Script", content: "Hello"))

        XCTAssertEqual(after.scripts.count, beforeCount + 1)
        XCTAssertEqual(after.scripts.last?.name, "New Script")
        XCTAssertEqual(after.scripts.last?.content, "Hello")
        XCTAssertEqual(after.activeScriptId, after.scripts.last?.id)
        XCTAssertFalse(after.playback.playing)
        XCTAssertEqual(after.playback.position, 0)
    }

    func testSetPositionClampsToUnitInterval() {
        let initial = AppState.initial()

        let low = reduce(state: initial, action: .setPosition(-0.5))
        XCTAssertEqual(low.playback.position, 0)

        let high = reduce(state: initial, action: .setPosition(2.0))
        XCTAssertEqual(high.playback.position, 1)

        let mid = reduce(state: initial, action: .setPosition(0.42))
        XCTAssertEqual(mid.playback.position, 0.42, accuracy: 1e-9)
    }

    func testPersistenceLoadFromCorruptFileReturnsNilAndBacksUp() throws {
        let tmpDir = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("teleprompter-persistence-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: tmpDir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: tmpDir) }

        let badFile = tmpDir.appendingPathComponent("state.json")
        try Data("this is not json {".utf8).write(to: badFile)

        let result = Persistence.loadFrom(url: badFile)
        XCTAssertNil(result, "corrupt state.json must decode to nil instead of throwing")

        let siblings = try FileManager.default.contentsOfDirectory(atPath: tmpDir.path)
        let backups = siblings.filter { $0.hasPrefix("state.json.bak.") }
        XCTAssertEqual(backups.count, 1, "corrupt load must produce exactly one backup file; got \(siblings)")

        // The original bad file should still be present alongside the backup
        // (we copy, not move, so the next save can overwrite it cleanly).
        XCTAssertTrue(FileManager.default.fileExists(atPath: badFile.path))
    }

    func testPersistenceLoadFromMissingFileReturnsNilSilently() {
        let missing = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("teleprompter-missing-\(UUID().uuidString).json")
        XCTAssertNil(Persistence.loadFrom(url: missing))
    }

    func testRecordingLogAddAppendsEntry() {
        var state = AppState.initial()
        let scriptId = state.activeScriptId
        XCTAssertEqual(state.activeScript?.recordingLog.count, 0)

        let entry = RecordingLogEntry(
            id: UUID(),
            timeSeconds: 12.5,
            line: "the line where we restarted",
            note: "flubbed it"
        )
        state = reduce(state: state, action: .recordingLogAdd(scriptId: scriptId, entry: entry))

        XCTAssertEqual(state.activeScript?.recordingLog.count, 1)
        XCTAssertEqual(state.activeScript?.recordingLog.first?.id, entry.id)
        XCTAssertEqual(state.activeScript?.recordingLog.first?.timeSeconds, 12.5)
        XCTAssertEqual(state.activeScript?.recordingLog.first?.line, "the line where we restarted")
        XCTAssertEqual(state.activeScript?.recordingLog.first?.note, "flubbed it")
    }

    func testRecordingLogActionsAreFlaggedForImmediatePersistence() {
        // Every recording-log mutation must opt into the synchronous save
        // path. If you add a new one to Action, update isRecordingLogMutation
        // and this test in the same change.
        let entry = RecordingLogEntry(id: UUID(), timeSeconds: 0, line: "", note: "")
        let scriptId = UUID()
        let entryId = UUID()
        let logActions: [Action] = [
            .recordingLogAdd(scriptId: scriptId, entry: entry),
            .recordingLogUpdateLine(scriptId: scriptId, entryId: entryId, line: "x"),
            .recordingLogUpdateNote(scriptId: scriptId, entryId: entryId, note: "x"),
            .recordingLogSetKind(scriptId: scriptId, entryId: entryId, kind: .chapter),
            .recordingLogRemove(scriptId: scriptId, entryId: entryId),
            .recordingLogClear(scriptId: scriptId),
        ]
        for action in logActions {
            XCTAssertTrue(action.isRecordingLogMutation, "\(action) must be flagged for immediate save")
        }

        let nonLogActions: [Action] = [
            .scriptAdd(name: "x", content: "y"),
            .play,
            .pause,
            .setPosition(0.5),
            .setSpeed(1.5),
            .setFontSize(64),
            .setMirror(true),
            .cueAdd(scriptId: scriptId, label: "x", position: 0.5),
        ]
        for action in nonLogActions {
            XCTAssertFalse(action.isRecordingLogMutation, "\(action) must NOT be flagged for immediate save")
        }
    }

    /// Invariant under test: a log entry, once dispatched, survives an
    /// immediate process kill. We simulate the AppDelegate wiring with a
    /// store action-observer that writes synchronously for recording-log
    /// mutations, then read the file back to confirm the entry is there.
    /// No debounce timer is given the chance to fire.
    func testRecordingLogActionTriggersSynchronousPersistence() throws {
        let tmpDir = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("teleprompter-immediate-save-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: tmpDir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: tmpDir) }
        let file = tmpDir.appendingPathComponent("state.json")

        let store = Store(initialState: AppState.initial())
        store.subscribeActions { state, action in
            guard action.isRecordingLogMutation else { return }
            Persistence.saveTo(.init(
                scripts: state.scripts,
                activeScriptId: state.activeScriptId,
                appearance: state.appearance
            ), url: file)
        }

        let scriptId = store.state.activeScriptId
        let entry = RecordingLogEntry(id: UUID(), timeSeconds: 5, line: "first words after the flub", note: "retake")
        store.dispatch(.recordingLogAdd(scriptId: scriptId, entry: entry))

        XCTAssertTrue(FileManager.default.fileExists(atPath: file.path), "recording-log mutation must write to disk before dispatch returns")

        let snap = Persistence.loadFrom(url: file)
        XCTAssertEqual(snap?.scripts.first?.recordingLog.count, 1)
        XCTAssertEqual(snap?.scripts.first?.recordingLog.first?.id, entry.id)
        XCTAssertEqual(snap?.scripts.first?.recordingLog.first?.line, "first words after the flub")
    }

    func testRecordingLogEntryDecodesWithoutKindFieldDefaultsToFlub() throws {
        // Simulates a state.json written by an older build that predates
        // EntryKind and wallclock. The decoded entry must come back with
        // kind == .flub and wallclock == .distantPast instead of throwing.
        let legacyJSON = """
        {
            "id": "11111111-2222-3333-4444-555555555555",
            "timeSeconds": 12.5,
            "line": "from before kinds existed",
            "note": "old entry"
        }
        """
        let data = Data(legacyJSON.utf8)
        let entry = try JSONDecoder().decode(RecordingLogEntry.self, from: data)
        XCTAssertEqual(entry.kind, .flub, "legacy entries with no kind field must default to .flub")
        XCTAssertEqual(entry.wallclock, .distantPast, "legacy entries with no wallclock must default to .distantPast")
        XCTAssertEqual(entry.line, "from before kinds existed")
        XCTAssertEqual(entry.timeSeconds, 12.5)
    }

    func testRecordingLogEntryDefaultWallclockIsRecent() {
        let before = Date()
        let entry = RecordingLogEntry(id: UUID(), timeSeconds: 0, line: "", note: "")
        let after = Date()
        XCTAssertGreaterThanOrEqual(entry.wallclock, before)
        XCTAssertLessThanOrEqual(entry.wallclock, after)
    }

    func testCSVExportContainsParseableISO8601WallclockColumn() {
        let when = Date(timeIntervalSince1970: 1_700_000_000) // 2023-11-14T22:13:20Z
        let entries = [
            RecordingLogEntry(id: UUID(), timeSeconds: 42, line: "first words", note: "n1", kind: .flub, wallclock: when),
            RecordingLogEntry(id: UUID(), timeSeconds: 99, line: "second", note: "", kind: .chapter, wallclock: .distantPast)
        ]
        let csv = TrackerView.csvText(for: entries, moduleName: "Module A")
        let lines = csv.split(separator: "\n", omittingEmptySubsequences: true).map(String.init)
        XCTAssertEqual(lines.count, 3, "header + two rows")
        XCTAssertEqual(lines[0], "Module,Time,Wallclock,Kind,Status,Line,Note")

        // Row 1: real wallclock → ISO-8601, parseable back.
        let row1Fields = lines[1].split(separator: ",").map(String.init)
        XCTAssertEqual(row1Fields[0], "Module A")
        XCTAssertEqual(row1Fields[1], "0:42")
        let wallclockField = row1Fields[2]
        XCTAssertFalse(wallclockField.isEmpty, "wallclock column must be present for a stamped entry")
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime]
        let parsed = parser.date(from: wallclockField)
        XCTAssertNotNil(parsed, "wallclock column must be parseable as ISO-8601; got \(wallclockField)")
        if let parsed = parsed {
            XCTAssertEqual(parsed.timeIntervalSince1970, when.timeIntervalSince1970, accuracy: 1.0)
        }
        XCTAssertEqual(row1Fields[3], "Flub")
        XCTAssertEqual(row1Fields[4], "live", "non-superseded entry must render as 'live' in CSV")

        // Row 2: legacy .distantPast wallclock → empty column so editors
        // don't see a year-0001 timestamp in their CSV.
        let row2Fields = lines[2].split(separator: ",", omittingEmptySubsequences: false).map(String.init)
        XCTAssertEqual(row2Fields[2], "", "legacy .distantPast wallclock must render as empty in CSV")
        XCTAssertEqual(row2Fields[3], "Chapter")
        XCTAssertEqual(row2Fields[4], "live")
    }

    func testRetakeSupersedesPriorFlubsInChapterWindow() {
        var state = AppState.initial()
        let scriptId = state.activeScriptId

        // Case 1: flub, flub, retake → both flubs superseded, retake live.
        let flub1 = RecordingLogEntry(id: UUID(), timeSeconds: 1, line: "a", note: "", kind: .flub)
        let flub2 = RecordingLogEntry(id: UUID(), timeSeconds: 2, line: "b", note: "", kind: .flub)
        let retake1 = RecordingLogEntry(id: UUID(), timeSeconds: 3, line: "c", note: "", kind: .retake)
        state = reduce(state: state, action: .recordingLogAdd(scriptId: scriptId, entry: flub1))
        state = reduce(state: state, action: .recordingLogAdd(scriptId: scriptId, entry: flub2))
        state = reduce(state: state, action: .recordingLogAdd(scriptId: scriptId, entry: retake1))

        let log1 = state.activeScript?.recordingLog ?? []
        XCTAssertEqual(log1.count, 3)
        XCTAssertTrue(log1[0].superseded, "first flub before retake must be superseded")
        XCTAssertTrue(log1[1].superseded, "second flub before retake must be superseded")
        XCTAssertFalse(log1[2].superseded, "retake itself must stay live")

        // Case 2: chapter, flub, retake → chapter live, flub superseded, retake live.
        // (Chapter scopes the supersede window — flubs before the chapter are
        // untouched, but this fresh script starts with the chapter at index 0.)
        var state2 = AppState.initial()
        let scriptId2 = state2.activeScriptId
        let chapter = RecordingLogEntry(id: UUID(), timeSeconds: 10, line: "ch", note: "", kind: .chapter)
        let flub3 = RecordingLogEntry(id: UUID(), timeSeconds: 11, line: "f", note: "", kind: .flub)
        let retake2 = RecordingLogEntry(id: UUID(), timeSeconds: 12, line: "r", note: "", kind: .retake)
        state2 = reduce(state: state2, action: .recordingLogAdd(scriptId: scriptId2, entry: chapter))
        state2 = reduce(state: state2, action: .recordingLogAdd(scriptId: scriptId2, entry: flub3))
        state2 = reduce(state: state2, action: .recordingLogAdd(scriptId: scriptId2, entry: retake2))

        let log2 = state2.activeScript?.recordingLog ?? []
        XCTAssertEqual(log2.count, 3)
        XCTAssertFalse(log2[0].superseded, "chapter must stay live")
        XCTAssertTrue(log2[1].superseded, "flub after chapter, before retake, must be superseded")
        XCTAssertFalse(log2[2].superseded, "retake must stay live")

        // Case 3: flub before chapter is NOT touched by a later retake.
        var state3 = AppState.initial()
        let scriptId3 = state3.activeScriptId
        let preFlub = RecordingLogEntry(id: UUID(), timeSeconds: 1, line: "pre", note: "", kind: .flub)
        let ch = RecordingLogEntry(id: UUID(), timeSeconds: 2, line: "ch", note: "", kind: .chapter)
        let rt = RecordingLogEntry(id: UUID(), timeSeconds: 3, line: "rt", note: "", kind: .retake)
        state3 = reduce(state: state3, action: .recordingLogAdd(scriptId: scriptId3, entry: preFlub))
        state3 = reduce(state: state3, action: .recordingLogAdd(scriptId: scriptId3, entry: ch))
        state3 = reduce(state: state3, action: .recordingLogAdd(scriptId: scriptId3, entry: rt))

        let log3 = state3.activeScript?.recordingLog ?? []
        XCTAssertEqual(log3.count, 3)
        XCTAssertFalse(log3[0].superseded, "flub before the chapter boundary must stay live — retake only supersedes within its chapter window")
        XCTAssertFalse(log3[1].superseded)
        XCTAssertFalse(log3[2].superseded)
    }

    func testRecordingLogEntryDecodesWithoutSupersededFieldDefaultsToFalse() throws {
        // Pre-supersede JSON has no `superseded` key. Tolerant decoding must
        // default it to false.
        let legacyJSON = """
        {
            "id": "11111111-2222-3333-4444-555555555555",
            "timeSeconds": 1,
            "line": "x",
            "note": "y",
            "kind": "flub"
        }
        """
        let entry = try JSONDecoder().decode(RecordingLogEntry.self, from: Data(legacyJSON.utf8))
        XCTAssertFalse(entry.superseded)
    }

    func testRecordingLogSetKindUpdatesEntryKind() {
        var state = AppState.initial()
        let scriptId = state.activeScriptId
        let entry = RecordingLogEntry(id: UUID(), timeSeconds: 1, line: "x", note: "y")
        XCTAssertEqual(entry.kind, .flub, "default kind on init should be .flub")
        state = reduce(state: state, action: .recordingLogAdd(scriptId: scriptId, entry: entry))

        state = reduce(state: state, action: .recordingLogSetKind(scriptId: scriptId, entryId: entry.id, kind: .chapter))

        XCTAssertEqual(state.activeScript?.recordingLog.first?.kind, .chapter)
    }

    /// Posting the global-hotkey notification must cause TrackerView to log a
    /// flub entry into the active script — same end state as pressing the
    /// in-app "Log line" button. The actual Carbon registration is wired in
    /// AppDelegate; here we exercise the notification → dispatch path because
    /// that's the seam between the OS-level hotkey and our store.
    func testFlubHotkeyNotificationAppendsFlubEntryToActiveScript() {
        var initial = AppState.initial()
        // Give the active script some content so paragraphAtCurrentScrollPosition
        // has something to extract.
        if let firstId = initial.scripts.first?.id {
            initial = reduce(state: initial,
                             action: .scriptSetContent(id: firstId, content: "Paragraph one.\nParagraph two."))
        }
        let store = Store(initialState: initial)
        let engine = PlaybackEngine()
        let tracker = TrackerView(store: store, engine: engine)
        defer { _ = tracker } // keep alive past the notification post

        XCTAssertEqual(store.state.activeScript?.recordingLog.count, 0)

        NotificationCenter.default.post(name: .teleprompterFlubHotkey, object: nil)

        let log = store.state.activeScript?.recordingLog ?? []
        XCTAssertEqual(log.count, 1, "the global hotkey notification must produce exactly one new log entry")
        XCTAssertEqual(log.first?.kind, .flub, "hotkey-logged entries must default to .flub")
        XCTAssertFalse(log.first?.line.isEmpty ?? true, "the new entry should capture the paragraph at the current scroll position")
    }

    func testBookmarkLabelFormatsElapsedSecondsAsHMS() {
        let any = Date()
        XCTAssertEqual(TrackerView.bookmarkLabel(elapsedSeconds: 0, wallclock: any), "Bookmark 0:00:00")
        XCTAssertEqual(TrackerView.bookmarkLabel(elapsedSeconds: 5, wallclock: any), "Bookmark 0:00:05")
        XCTAssertEqual(TrackerView.bookmarkLabel(elapsedSeconds: 90, wallclock: any), "Bookmark 0:01:30")
        XCTAssertEqual(TrackerView.bookmarkLabel(elapsedSeconds: 3600, wallclock: any), "Bookmark 1:00:00")
        XCTAssertEqual(TrackerView.bookmarkLabel(elapsedSeconds: 3661, wallclock: any), "Bookmark 1:01:01")
        // Fractional seconds truncate (don't round) — matches Time column behavior in the table.
        XCTAssertEqual(TrackerView.bookmarkLabel(elapsedSeconds: 11.7, wallclock: any), "Bookmark 0:00:11")
    }

    func testBookmarkLabelFallsBackToWallclockWhenTimerNotRunning() {
        var comps = DateComponents()
        comps.year = 2024; comps.month = 6; comps.day = 15
        comps.hour = 14; comps.minute = 35; comps.second = 7
        let date = Calendar.current.date(from: comps)!
        XCTAssertEqual(TrackerView.bookmarkLabel(elapsedSeconds: nil, wallclock: date), "Bookmark 14:35:07")

        // Negative elapsed (countdown still ticking down) also falls back to wallclock,
        // because the session timer hasn't reached 0:00 yet.
        XCTAssertEqual(TrackerView.bookmarkLabel(elapsedSeconds: -2.4, wallclock: date), "Bookmark 14:35:07")
    }

    func testCueAddAppendsAndSortsByPosition() {
        var state = AppState.initial()
        let scriptId = state.activeScriptId
        state = reduce(state: state, action: .cueAdd(scriptId: scriptId, label: "Bookmark 0:01:00", position: 0.5))
        state = reduce(state: state, action: .cueAdd(scriptId: scriptId, label: "Bookmark 0:00:30", position: 0.2))
        state = reduce(state: state, action: .cueAdd(scriptId: scriptId, label: "Bookmark 0:02:00", position: 0.9))

        let cues = state.activeScript?.cues ?? []
        XCTAssertEqual(cues.count, 3)
        XCTAssertEqual(cues.map { $0.position }, [0.2, 0.5, 0.9], "cues must be sorted by position so the bookmark hotkey stays usable as a marker list")
        XCTAssertEqual(cues.map { $0.label }, ["Bookmark 0:00:30", "Bookmark 0:01:00", "Bookmark 0:02:00"])
    }

    func testNonRecordingLogActionDoesNotTriggerSynchronousPersistence() throws {
        let tmpDir = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("teleprompter-no-immediate-save-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: tmpDir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: tmpDir) }
        let file = tmpDir.appendingPathComponent("state.json")

        let store = Store(initialState: AppState.initial())
        store.subscribeActions { state, action in
            guard action.isRecordingLogMutation else { return }
            Persistence.saveTo(.init(
                scripts: state.scripts,
                activeScriptId: state.activeScriptId,
                appearance: state.appearance
            ), url: file)
        }

        store.dispatch(.setFontSize(80))
        store.dispatch(.setPosition(0.5))
        store.dispatch(.scriptSetContent(id: store.state.activeScriptId, content: "typing typing typing"))

        XCTAssertFalse(FileManager.default.fileExists(atPath: file.path), "non-log mutations must not trip the immediate-save path; they go through the debounce")
    }
}
