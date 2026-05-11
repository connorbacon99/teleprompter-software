import Foundation

struct CueMarker: Codable, Equatable, Identifiable {
    var id: UUID
    var label: String
    var position: Double
}

struct RecordingLogEntry: Codable, Equatable, Identifiable {
    var id: UUID
    /// Seconds elapsed since recording timer started (after countdown).
    var timeSeconds: Double
    /// Captured paragraph text (the "first words of where they restarted").
    var line: String
    /// Free-text note (clean / cut / pause between slides / etc.).
    var note: String
}

struct Script: Codable, Equatable, Identifiable {
    var id: UUID
    var name: String
    var content: String
    var cues: [CueMarker]
    var recordingLog: [RecordingLogEntry]
}

struct Appearance: Codable, Equatable {
    var fontFamily: String
    var fontSizePt: Double
    var lineHeight: Double
    var textColorHex: String
    var bgColorHex: String
    var mirror: Bool
    var flip: Bool
}

struct Playback: Codable, Equatable {
    var playing: Bool
    var position: Double
    var speed: Double
    var countdownEnabled: Bool
    var countdownSeconds: Int
    /// CACurrentMediaTime at which the current play session (or seek/speed
    /// epoch) began. Both VCs anchor their CABasicAnimation.beginTime to this
    /// value so they render the same progress regardless of when each VC's
    /// animation was actually added to its layer.
    var playSessionStartTime: TimeInterval?
    /// The position at the start of the current play session/epoch.
    var playSessionStartPosition: Double
}

struct DisplayInfo: Codable, Equatable {
    var id: UInt32
    var label: String
    var isPrimary: Bool
}

struct AppState: Codable, Equatable {
    var scripts: [Script]
    var activeScriptId: UUID
    var appearance: Appearance
    var playback: Playback
    var displays: [DisplayInfo]
    var selectedDisplayId: UInt32?
    var teleprompterOpen: Bool

    static func initial() -> AppState {
        let firstScript = Script(id: UUID(), name: "Untitled", content: "", cues: [], recordingLog: [])
        return AppState(
            scripts: [firstScript],
            activeScriptId: firstScript.id,
            appearance: Appearance(
                fontFamily: "Helvetica",
                fontSizePt: 64,
                lineHeight: 1.5,
                textColorHex: "#FFFFFF",
                bgColorHex: "#000000",
                mirror: false,
                flip: false
            ),
            playback: Playback(
                playing: false,
                position: 0,
                speed: 1.0,
                countdownEnabled: true,
                countdownSeconds: 3,
                playSessionStartTime: nil,
                playSessionStartPosition: 0
            ),
            displays: [],
            selectedDisplayId: nil,
            teleprompterOpen: false
        )
    }

    var activeScript: Script? {
        scripts.first(where: { $0.id == activeScriptId })
    }
}

enum Action {
    case scriptAdd(name: String, content: String)
    case scriptRemove(id: UUID)
    case scriptRename(id: UUID, name: String)
    case scriptSetContent(id: UUID, content: String)
    case scriptSetActive(id: UUID)

    case cueAdd(scriptId: UUID, label: String, position: Double)
    case cueRemove(scriptId: UUID, cueId: UUID)

    case recordingLogAdd(scriptId: UUID, entry: RecordingLogEntry)
    case recordingLogUpdateLine(scriptId: UUID, entryId: UUID, line: String)
    case recordingLogUpdateNote(scriptId: UUID, entryId: UUID, note: String)
    case recordingLogRemove(scriptId: UUID, entryId: UUID)
    case recordingLogClear(scriptId: UUID)

    case play
    case pause
    case togglePlay
    case reset
    case setPosition(Double)
    case setSpeed(Double)

    case setFontSize(Double)
    case setMirror(Bool)
    case setFlip(Bool)

    case displaysRefreshed([DisplayInfo])
    case setSelectedDisplay(UInt32?)
    case setTeleprompterOpen(Bool)

    /// Coalesced action for live speed change during play. Captures the live
    /// visual position from the operator so both VCs restart at the same
    /// epoch (sessionStartTime updated together) without speed-change drift.
    case changePlaySpeed(speed: Double, livePosition: Double)

    case projectLoad(AppState)
}
