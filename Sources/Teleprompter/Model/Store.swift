import Foundation
import QuartzCore

final class Store {
    private(set) var state: AppState
    private var observers: [(token: UUID, callback: (AppState) -> Void)] = []
    private var actionObservers: [(token: UUID, callback: (AppState, Action) -> Void)] = []

    init(initialState: AppState) {
        self.state = initialState
    }

    @discardableResult
    func subscribe(_ callback: @escaping (AppState) -> Void) -> UUID {
        let token = UUID()
        observers.append((token, callback))
        callback(state)
        return token
    }

    func unsubscribe(_ token: UUID) {
        observers.removeAll { $0.token == token }
    }

    /// Subscribe to dispatched actions. Unlike `subscribe`, this is NOT
    /// invoked on subscription (there's no action yet) — only on subsequent
    /// `dispatch` calls. Use this when the persistence/side-effect behavior
    /// depends on which action fired (e.g. recording-log mutations save
    /// synchronously, other mutations debounce).
    @discardableResult
    func subscribeActions(_ callback: @escaping (AppState, Action) -> Void) -> UUID {
        let token = UUID()
        actionObservers.append((token, callback))
        return token
    }

    func unsubscribeActions(_ token: UUID) {
        actionObservers.removeAll { $0.token == token }
    }

    func dispatch(_ action: Action) {
        state = reduce(state: state, action: action)
        for (_, callback) in observers {
            callback(state)
        }
        for (_, callback) in actionObservers {
            callback(state, action)
        }
    }
}

private func clamp01(_ x: Double) -> Double { max(0, min(1, x)) }

private func clampSpeed(_ x: Double) -> Double { max(0.1, min(10, x)) }

func reduce(state: AppState, action: Action) -> AppState {
    var s = state
    switch action {
    case .scriptAdd(let name, let content):
        let script = Script(id: UUID(), name: name, content: content, cues: [], recordingLog: [])
        s.scripts.append(script)
        s.activeScriptId = script.id
        s.playback.playing = false
        s.playback.position = 0

    case .scriptRemove(let id):
        guard s.scripts.count > 1 else { break }
        s.scripts.removeAll { $0.id == id }
        if s.activeScriptId == id {
            s.activeScriptId = s.scripts[0].id
            s.playback.playing = false
            s.playback.position = 0
        }

    case .scriptRename(let id, let name):
        if let idx = s.scripts.firstIndex(where: { $0.id == id }) {
            s.scripts[idx].name = name
        }

    case .scriptSetContent(let id, let content):
        if let idx = s.scripts.firstIndex(where: { $0.id == id }) {
            s.scripts[idx].content = content
        }

    case .scriptSetActive(let id):
        if id != s.activeScriptId {
            s.activeScriptId = id
            s.playback.playing = false
            s.playback.position = 0
        }

    case .cueAdd(let scriptId, let label, let position):
        if let idx = s.scripts.firstIndex(where: { $0.id == scriptId }) {
            let cue = CueMarker(id: UUID(), label: label, position: clamp01(position))
            s.scripts[idx].cues.append(cue)
            s.scripts[idx].cues.sort { $0.position < $1.position }
        }

    case .cueRemove(let scriptId, let cueId):
        if let idx = s.scripts.firstIndex(where: { $0.id == scriptId }) {
            s.scripts[idx].cues.removeAll { $0.id == cueId }
        }

    case .recordingLogAdd(let scriptId, let entry):
        if let idx = s.scripts.firstIndex(where: { $0.id == scriptId }) {
            s.scripts[idx].recordingLog.append(entry)
            // Auto-supersede prior flubs in the current chapter window when a
            // retake is logged. The "chapter window" is from the most recent
            // `.chapter` (exclusive) to the new retake (exclusive); if no
            // chapter exists yet, the window is from the start of the log.
            // Only `.flub` entries flip — clean/chapter/note stay live, and
            // a previously-superseded flub stays superseded.
            if entry.kind == .retake {
                let log = s.scripts[idx].recordingLog
                let retakeIdx = log.count - 1
                let chapterIdx = log[..<retakeIdx].lastIndex(where: { $0.kind == .chapter })
                let windowStart = chapterIdx.map { $0 + 1 } ?? 0
                if windowStart < retakeIdx {
                    for i in windowStart..<retakeIdx where s.scripts[idx].recordingLog[i].kind == .flub {
                        s.scripts[idx].recordingLog[i].superseded = true
                    }
                }
            }
        }

    case .recordingLogUpdateLine(let scriptId, let entryId, let line):
        if let sIdx = s.scripts.firstIndex(where: { $0.id == scriptId }),
           let eIdx = s.scripts[sIdx].recordingLog.firstIndex(where: { $0.id == entryId }) {
            s.scripts[sIdx].recordingLog[eIdx].line = line
        }

    case .recordingLogUpdateNote(let scriptId, let entryId, let note):
        if let sIdx = s.scripts.firstIndex(where: { $0.id == scriptId }),
           let eIdx = s.scripts[sIdx].recordingLog.firstIndex(where: { $0.id == entryId }) {
            s.scripts[sIdx].recordingLog[eIdx].note = note
        }

    case .recordingLogSetKind(let scriptId, let entryId, let kind):
        if let sIdx = s.scripts.firstIndex(where: { $0.id == scriptId }),
           let eIdx = s.scripts[sIdx].recordingLog.firstIndex(where: { $0.id == entryId }) {
            s.scripts[sIdx].recordingLog[eIdx].kind = kind
        }

    case .recordingLogRemove(let scriptId, let entryId):
        if let idx = s.scripts.firstIndex(where: { $0.id == scriptId }) {
            s.scripts[idx].recordingLog.removeAll { $0.id == entryId }
        }

    case .recordingLogClear(let scriptId):
        if let idx = s.scripts.firstIndex(where: { $0.id == scriptId }) {
            s.scripts[idx].recordingLog.removeAll()
        }

    case .play:
        if !s.playback.playing {
            s.playback.playing = true
            s.playback.playSessionStartTime = CACurrentMediaTime()
            s.playback.playSessionStartPosition = s.playback.position
        }
    case .pause:
        s.playback.playing = false
    case .togglePlay:
        if s.playback.playing {
            s.playback.playing = false
        } else {
            s.playback.playing = true
            s.playback.playSessionStartTime = CACurrentMediaTime()
            s.playback.playSessionStartPosition = s.playback.position
        }
    case .reset:
        s.playback.playing = false
        s.playback.position = 0
        s.playback.playSessionStartTime = nil
        s.playback.playSessionStartPosition = 0
    case .setPosition(let pos):
        s.playback.position = clamp01(pos)
        if s.playback.playing {
            s.playback.playSessionStartTime = CACurrentMediaTime()
            s.playback.playSessionStartPosition = s.playback.position
        }
    case .setSpeed(let v):
        s.playback.speed = clampSpeed(v)
    case .changePlaySpeed(let v, let livePos):
        s.playback.speed = clampSpeed(v)
        if s.playback.playing {
            s.playback.position = clamp01(livePos)
            s.playback.playSessionStartTime = CACurrentMediaTime()
            s.playback.playSessionStartPosition = s.playback.position
        }
    case .setFontSize(let v):
        s.appearance.fontSizePt = max(12, min(300, v))
    case .setMirror(let m):
        s.appearance.mirror = m
    case .setFlip(let f):
        s.appearance.flip = f

    case .displaysRefreshed(let infos):
        s.displays = infos
        if let cur = s.selectedDisplayId, !infos.contains(where: { $0.id == cur }) {
            s.selectedDisplayId = nil
        }
        if s.selectedDisplayId == nil {
            if let secondary = infos.first(where: { !$0.isPrimary }) {
                s.selectedDisplayId = secondary.id
            } else {
                s.selectedDisplayId = infos.first?.id
            }
        }

    case .setSelectedDisplay(let id):
        s.selectedDisplayId = id

    case .setTeleprompterOpen(let open):
        s.teleprompterOpen = open

    case .projectLoad(let newState):
        s = newState
        s.playback.playing = false
    }
    return s
}
