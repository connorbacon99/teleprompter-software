import Foundation

/// On-disk storage for the parts of `AppState` that should survive an app
/// quit. We persist scripts (with their content + cues + recording log),
/// the active script id, and the user-facing appearance settings.
///
/// We deliberately DON'T persist playback state, display info, or
/// teleprompter window state — those should reset cleanly on each launch.
enum Persistence {
    private static let fileURL: URL = {
        let appSupport = FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first ?? URL(fileURLWithPath: NSHomeDirectory())
        let dir = appSupport.appendingPathComponent("Teleprompter", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("state.json")
    }()

    struct Snapshot: Codable {
        var scripts: [Script]
        var activeScriptId: UUID?
        var appearance: Appearance
    }

    static func load() -> Snapshot? {
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        return try? JSONDecoder().decode(Snapshot.self, from: data)
    }

    static func save(_ snapshot: Snapshot) {
        do {
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            let data = try encoder.encode(snapshot)
            try data.write(to: fileURL, options: .atomic)
        } catch {
            NSLog("[Persistence] save failed: \(error)")
        }
    }
}
