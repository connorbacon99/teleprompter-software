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
    /// Synthetic divider inserted by the recording-timer reset. Acts like a
    /// chapter boundary for the supersede logic (a retake in session N must
    /// not flip flubs in session N-1) and renders as a header row in the
    /// tracker table rather than a regular log line. Not operator-selectable
    /// via the Kind popup.
    case session
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
    /// Whether this entry has been superseded by a later retake within the
    /// same chapter window. Set by the reducer when a `.retake` is added (all
    /// preceding `.flub` entries since the most recent `.chapter` flip to
    /// true). Editor-export tasks should skip superseded entries by default.
    /// Older persisted entries decode without this field and default to false.
    var superseded: Bool

    init(id: UUID, timeSeconds: Double, line: String, note: String, kind: EntryKind = .flub, wallclock: Date = Date(), superseded: Bool = false) {
        self.id = id
        self.timeSeconds = timeSeconds
        self.line = line
        self.note = note
        self.kind = kind
        self.wallclock = wallclock
        self.superseded = superseded
    }

    private enum CodingKeys: String, CodingKey {
        case id, timeSeconds, line, note, kind, wallclock, superseded
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
        // Tolerant default for pre-supersede state.json files.
        self.superseded = try c.decodeIfPresent(Bool.self, forKey: .superseded) ?? false
    }
}

struct Script: Codable, Equatable, Identifiable {
    var id: UUID
    var name: String
    var content: String
    var cues: [CueMarker]
    var recordingLog: [RecordingLogEntry]

    init(id: UUID, name: String, content: String, cues: [CueMarker], recordingLog: [RecordingLogEntry]) {
        self.id = id
        self.name = name
        self.content = content
        self.cues = cues
        self.recordingLog = recordingLog
    }

    private enum CodingKeys: String, CodingKey {
        case id, name, content, cues, recordingLog
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try c.decode(UUID.self, forKey: .id)
        self.name = try c.decode(String.self, forKey: .name)
        self.content = try c.decode(String.self, forKey: .content)
        // Tolerant defaults: a state.json written by a build that predates
        // cues or recordingLog must not fail the snapshot decode — load()
        // treats a decode error as corruption and discards every script.
        self.cues = try c.decodeIfPresent([CueMarker].self, forKey: .cues) ?? []
        self.recordingLog = try c.decodeIfPresent([RecordingLogEntry].self, forKey: .recordingLog) ?? []
    }
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
}

struct DisplayInfo: Codable, Equatable {
    var id: UInt32
    var label: String
    var isPrimary: Bool
}

/// Recording-session timer phase. The active timer anchor is a
/// `CACurrentMediaTime` value — a process-relative monotonic clock — which is
/// why this state lives in-memory only and is never persisted to disk. A
/// stale `start` reloaded from a previous process would be meaningless.
enum RecPhase: Codable, Equatable {
    case idle
    case running(start: TimeInterval)
    case paused(elapsed: TimeInterval)
}

struct RecordingTimer: Codable, Equatable {
    var phase: RecPhase
    var countdownSeconds: Int

    static func initial() -> RecordingTimer {
        RecordingTimer(phase: .idle, countdownSeconds: 3)
    }

    /// Elapsed seconds since recording started, or `nil` if idle. Negative
    /// values indicate the countdown phase (e.g. -2.4 → 2.4 s remaining).
    func elapsedSeconds(now: TimeInterval) -> Double? {
        switch phase {
        case .idle: return nil
        case .running(let start): return now - start
        case .paused(let elapsed): return elapsed
        }
    }
}

struct AppState: Codable, Equatable {
    var scripts: [Script]
    var activeScriptId: UUID
    var appearance: Appearance
    var playback: Playback
    var displays: [DisplayInfo]
    var selectedDisplayId: UInt32?
    var teleprompterOpen: Bool
    var recordingTimer: RecordingTimer

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
                speed: 1.0
            ),
            displays: [],
            selectedDisplayId: nil,
            teleprompterOpen: false,
            recordingTimer: .initial()
        )
    }

    var activeScript: Script? {
        scripts.first(where: { $0.id == activeScriptId })
    }
}

extension Script {
    /// Picks the paragraph at a 0...1 scroll percent, weighted by character
    /// count so long paragraphs span proportionally more of the scroll. Used
    /// by both `TrackerView` and `TrackerHUDView` to auto-fill the "line"
    /// field on a logged entry from the live scroll position.
    func paragraph(atPosition percent: Double) -> String {
        let p = max(0, min(1, percent))
        let paragraphs = content
            .components(separatedBy: "\n")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        guard !paragraphs.isEmpty else { return "" }
        let total = paragraphs.reduce(0) { $0 + $1.count }
        if total == 0 { return paragraphs[0] }
        let target = Double(total) * p
        var cumulative = 0
        for para in paragraphs {
            cumulative += para.count
            if Double(cumulative) >= target { return para }
        }
        return paragraphs.last ?? ""
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

    /// Recording-timer state transitions. `now` is captured at dispatch time
    /// (`CACurrentMediaTime()`) so the reducer stays pure; likewise
    /// `wallclock` on reset, which stamps the session-divider entry the
    /// reducer may append to the active script's recording log.
    case recToggle(now: TimeInterval)
    case recReset(wallclock: Date)
    case recSetCountdown(seconds: Int)

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
             .recordingLogSetKind, .recordingLogRemove, .recordingLogClear,
             // recReset can append a synthetic `.session` divider to the log.
             .recReset:
            return true
        default:
            return false
        }
    }
}

/// Builds the label for a synthetic `.session` divider entry. The new session
/// number is `priorDividerCount + 2` because the implicit first session
/// (entries before any divider) is Session 1, so the first divider opens
/// Session 2.
func sessionDividerLabel(priorDividerCount: Int, wallclock: Date) -> String {
    let newSessionNumber = priorDividerCount + 2
    return "Session \(newSessionNumber) started \(sessionStartedFormatter.string(from: wallclock))"
}

private let sessionStartedFormatter: DateFormatter = {
    let f = DateFormatter()
    f.dateFormat = "yyyy-MM-dd HH:mm:ss"
    return f
}()
