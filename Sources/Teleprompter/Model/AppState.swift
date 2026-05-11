import Foundation

struct CueMarker: Codable, Equatable, Identifiable {
    var id: UUID
    var label: String
    var position: Double
}

enum EntryKind: String, Codable, CaseIterable {
    case flub
    case clean
    case chapter
    case retake
    case note
}

struct RecordingLogEntry: Codable, Equatable, Identifiable {
    var id: UUID
    /// Seconds elapsed since recording timer started (after countdown).
    var timeSeconds: Double
    /// Captured paragraph text (the "first words of where they restarted").
    var line: String
    /// Free-text note (clean / cut / pause between slides / etc.).
    var note: String
    /// Semantic category. Older persisted entries decode without this field
    /// and fall back to `.flub` (see `init(from:)`).
    var kind: EntryKind
    /// Absolute wallclock time at which the entry was created. Stamped in the
    /// memberwise init so any `RecordingLogEntry(id:…)` call gets a real time
    /// without callers having to remember. Older persisted entries decode
    /// without this field and fall back to `.distantPast` — that sentinel is
    /// chosen so the CSV/markers export can render it as "unknown" rather
    /// than as a misleading "now".
    var wallclock: Date

    init(id: UUID, timeSeconds: Double, line: String, note: String, kind: EntryKind = .flub, wallclock: Date = Date()) {
        self.id = id
        self.timeSeconds = timeSeconds
        self.line = line
        self.note = note
        self.kind = kind
        self.wallclock = wallclock
    }

    private enum CodingKeys: String, CodingKey {
        case id, timeSeconds, line, note, kind, wallclock
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try c.decode(UUID.self, forKey: .id)
        self.timeSeconds = try c.decode(Double.self, forKey: .timeSeconds)
        self.line = try c.decode(String.self, forKey: .line)
        self.note = try c.decode(String.self, forKey: .note)
        // Tolerant default for pre-EntryKind state.json files.
        self.kind = try c.decodeIfPresent(EntryKind.self, forKey: .kind) ?? .flub
        // Tolerant default for pre-wallclock state.json files. Use distantPast
        // (not "now") so legacy entries are visibly unknown rather than
        // misdated to the moment the user happened to reopen the app.
        self.wallclock = try c.decodeIfPresent(Date.self, forKey: .wallclock) ?? .distantPast
    }
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
    case recordingLogSetKind(scriptId: UUID, entryId: UUID, kind: EntryKind)
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

extension Action {
    /// True for actions that mutate a script's `recordingLog`. Invariant:
    /// once a recording-log action has been dispatched it must survive an
    /// immediate process kill, so `AppDelegate` persists synchronously for
    /// these (no 500ms debounce). The reason is the human operator: a flub
    /// logged at hour 11 of a 12h shoot can't be re-derived from anything
    /// else if the app dies before the debounce fires.
    var isRecordingLogMutation: Bool {
        switch self {
        case .recordingLogAdd, .recordingLogUpdateLine, .recordingLogUpdateNote,
             .recordingLogSetKind, .recordingLogRemove, .recordingLogClear:
            return true
        default:
            return false
        }
    }
}
