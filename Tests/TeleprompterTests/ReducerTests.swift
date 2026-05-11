import XCTest
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
        // EntryKind. The decoded entry must come back with kind == .flub
        // instead of throwing.
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
        XCTAssertEqual(entry.line, "from before kinds existed")
        XCTAssertEqual(entry.timeSeconds, 12.5)
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
