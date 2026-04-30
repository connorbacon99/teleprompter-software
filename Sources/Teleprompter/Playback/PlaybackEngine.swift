import Foundation
import QuartzCore
import CoreVideo

/// Single source of truth for the live scroll position. Driven by a
/// vsync-locked CVDisplayLink so every frame advances the position exactly
/// once. All scroll views (teleprompter window, in-operator monitor preview)
/// subscribe and render the SAME position, written in the SAME CATransaction
/// each frame. Two views can't be out of sync with each other because there
/// is only one position value being read.
final class PlaybackEngine {
    /// Current animated position, range [0, 1].
    private(set) var currentPosition: Double = 0
    /// Speed multiplier (1.0 = base rate of `pixelsPerSecondAt1x`).
    var speed: Double = 1.0
    /// Total scrollable text height in points. Set by the renderers when
    /// content/font/width changes; used to convert pixel velocity into a
    /// percent-per-second rate.
    var totalDistance: Double = 1.0
    /// Base scroll rate in points per second at speed 1.0.
    var pixelsPerSecondAt1x: Double = 80.0

    /// Called when the position naturally hits 1.0 (script finished).
    var onPlaybackFinished: (() -> Void)?

    private var displayLink: CVDisplayLink?
    private var lastFrameTime: CFTimeInterval = 0
    private var observers: [(token: UUID, callback: (Double) -> Void)] = []
    private var isRunning: Bool = false

    @discardableResult
    func subscribe(_ callback: @escaping (Double) -> Void) -> UUID {
        let token = UUID()
        observers.append((token, callback))
        callback(currentPosition)
        return token
    }

    func unsubscribe(_ token: UUID) {
        observers.removeAll { $0.token == token }
    }

    /// Imperatively jump to a position. Notifies subscribers. Used for seeks
    /// (slider drag, scroll-to-rewind, cue jumps).
    func setPosition(_ pos: Double) {
        currentPosition = max(0, min(1, pos))
        notifyObservers()
    }

    /// Begin advancing the position each vsync. No-op if already running.
    func play() {
        guard !isRunning else { return }
        isRunning = true
        lastFrameTime = CACurrentMediaTime()
        startDisplayLink()
    }

    /// Stop advancing.
    func pause() {
        guard isRunning else { return }
        isRunning = false
        stopDisplayLink()
    }

    var isPlaying: Bool { isRunning }

    private func startDisplayLink() {
        var dl: CVDisplayLink?
        CVDisplayLinkCreateWithActiveCGDisplays(&dl)
        guard let displayLink = dl else { return }
        self.displayLink = displayLink

        let userInfo = Unmanaged.passUnretained(self).toOpaque()
        let callback: CVDisplayLinkOutputCallback = { (_, _, _, _, _, userInfo) -> CVReturn in
            guard let userInfo = userInfo else { return kCVReturnSuccess }
            let engine = Unmanaged<PlaybackEngine>.fromOpaque(userInfo).takeUnretainedValue()
            DispatchQueue.main.async {
                engine.tick()
            }
            return kCVReturnSuccess
        }
        CVDisplayLinkSetOutputCallback(displayLink, callback, userInfo)
        CVDisplayLinkStart(displayLink)
    }

    private func stopDisplayLink() {
        if let dl = displayLink {
            CVDisplayLinkStop(dl)
            displayLink = nil
        }
    }

    private func tick() {
        guard isRunning, totalDistance > 0 else { return }
        let now = CACurrentMediaTime()
        let dt = now - lastFrameTime
        lastFrameTime = now
        let pixelDelta = speed * pixelsPerSecondAt1x * dt
        let positionDelta = pixelDelta / totalDistance
        let newPos = min(1.0, currentPosition + positionDelta)
        currentPosition = newPos
        notifyObservers()
        if newPos >= 1.0 {
            pause()
            onPlaybackFinished?()
        }
    }

    private func notifyObservers() {
        // CATransaction wrapping ensures all subscribers' layer writes commit
        // together at end of runloop iteration — atomic across views.
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        for (_, callback) in observers {
            callback(currentPosition)
        }
        CATransaction.commit()
    }
}
