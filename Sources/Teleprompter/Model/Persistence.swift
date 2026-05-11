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
        return loadFrom(url: fileURL)
    }

    /// Testable variant of `load()`. Reads the file at `url`, attempts to
    /// decode it as a `Snapshot`, and on decode failure copies the bad file
    /// to `<url>.bak.<unix-timestamp>` in the same directory before
    /// returning nil. Missing/unreadable files return nil silently.
    static func loadFrom(url: URL) -> Snapshot? {
        let data: Data
        do {
            data = try Data(contentsOf: url)
        } catch {
            // No file (or unreadable) — treat as "no saved state".
            return nil
        }
        do {
            return try JSONDecoder().decode(Snapshot.self, from: data)
        } catch {
            NSLog("[Persistence] decode failed for \(url.path): \(error)")
            let timestamp = Int(Date().timeIntervalSince1970)
            let backupURL = url.deletingLastPathComponent()
                .appendingPathComponent("\(url.lastPathComponent).bak.\(timestamp)")
            do {
                try FileManager.default.copyItem(at: url, to: backupURL)
                NSLog("[Persistence] corrupt state backed up to \(backupURL.path)")
            } catch {
                NSLog("[Persistence] backup copy failed: \(error)")
            }
            return nil
        }
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
