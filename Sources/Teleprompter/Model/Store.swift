import Foundation
import QuartzCore

final class Store {
    private(set) var state: AppState
    private var observers: [(token: UUID, callback: (AppState) -> Void)] = []

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

    func dispatch(_ action: Action) {
        state = reduce(state: state, action: action)
        for (_, callback) in observers {
            callback(state)
        }
    }
}

private func clamp01(_ x: Double) -> Double { max(0, min(1, x)) }

private func clampSpeed(_ x: Double) -> Double { max(0.1, min(10, x)) }

func reduce(state: AppState, action: Action) -> AppState {
    var s = state
    switch action {
    case .scriptAdd(let name, let content):
        let script = Script(id: UUID(), name: name, content: content, cues: [])
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
