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
}
