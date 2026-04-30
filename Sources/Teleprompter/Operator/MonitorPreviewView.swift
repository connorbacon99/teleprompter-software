import Cocoa

/// In-operator scaled-down preview of the teleprompter content. Renders the
/// inner ScrollingTextView at the teleprompter's actual screen dimensions and
/// scales via `layer.sublayerTransform` to fit. Subscribes to the same
/// `PlaybackEngine` as the teleprompter window — each engine tick writes the
/// same position to both views in the same CATransaction, so they're aligned
/// by construction.
final class MonitorPreviewView: NSView {
    private let store: Store
    private let engine: PlaybackEngine
    private var subscriptionToken: UUID?
    private var engineToken: UUID?
    private let scrollView = ScrollingTextView()

    private var lastState: AppState?
    private var renderSize: CGSize = CGSize(width: 1920, height: 1080)

    init(store: Store, engine: PlaybackEngine) {
        self.store = store
        self.engine = engine
        super.init(frame: .zero)
        wantsLayer = true
        layer?.backgroundColor = NSColor.black.cgColor
        layer?.masksToBounds = true

        addSubview(scrollView)
        scrollView.frame = CGRect(origin: .zero, size: renderSize)

        subscriptionToken = store.subscribe { [weak self] state in
            self?.applyState(state)
        }
        engineToken = engine.subscribe { [weak self] pos in
            self?.scrollView.applyStaticPosition(pos)
        }
    }

    required init?(coder: NSCoder) { fatalError() }

    deinit {
        if let token = subscriptionToken { store.unsubscribe(token) }
        if let token = engineToken { engine.unsubscribe(token) }
    }

    func currentVisualPosition() -> Double {
        return engine.currentPosition
    }

    override func scrollWheel(with event: NSEvent) {
        guard let state = lastState else { super.scrollWheel(with: event); return }
        let dy = event.hasPreciseScrollingDeltas ? event.scrollingDeltaY : event.deltaY * 4
        let pixelsPerUnit: CGFloat = max(renderSize.height, 1)
        let positionDelta = -Double(dy) / Double(pixelsPerUnit) * 0.6
        let newPos = max(0, min(1, engine.currentPosition + positionDelta))
        if abs(newPos - engine.currentPosition) > 0.0001 {
            store.dispatch(.setPosition(newPos))
        }
        _ = state // silence unused
    }

    override func layout() {
        super.layout()
        applyScaleTransform()
        if let state = lastState {
            scrollView.relayout(script: state.activeScript, appearance: state.appearance)
            engine.totalDistance = Double(scrollView.cachedTextHeight)
            scrollView.applyStaticPosition(engine.currentPosition)
        }
    }

    private func applyScaleTransform() {
        guard renderSize.width > 0, renderSize.height > 0,
              bounds.width > 0, bounds.height > 0 else { return }
        let s = min(bounds.width / renderSize.width, bounds.height / renderSize.height)
        let scaledW = renderSize.width * s
        let scaledH = renderSize.height * s
        let dx = (bounds.width - scaledW) * 0.5
        let dy = (bounds.height - scaledH) * 0.5

        scrollView.frame = CGRect(origin: .zero, size: renderSize)

        CATransaction.begin()
        CATransaction.setDisableActions(true)
        var t = CATransform3DIdentity
        t = CATransform3DTranslate(t, dx, dy, 0)
        t = CATransform3DScale(t, s, s, 1)
        layer?.sublayerTransform = t
        CATransaction.commit()
    }

    private func applyState(_ newState: AppState) {
        let previous = lastState
        lastState = newState

        let newRenderSize = renderSizeForCurrentTarget(newState)
        let renderSizeChanged = newRenderSize != renderSize
        if renderSizeChanged {
            renderSize = newRenderSize
            needsLayout = true
        }

        let scriptChanged =
            previous?.activeScript?.id != newState.activeScript?.id ||
            previous?.activeScript?.content != newState.activeScript?.content
        let appearanceChanged = previous?.appearance != newState.appearance

        if scriptChanged || appearanceChanged || renderSizeChanged {
            scrollView.relayout(script: newState.activeScript, appearance: newState.appearance)
            engine.totalDistance = Double(scrollView.cachedTextHeight)
            scrollView.applyStaticPosition(engine.currentPosition)
        }
        // Mirror/flip are intentionally NOT applied here — the operator's preview
        // stays readable while the fullscreen teleprompter is reflected through
        // the beam-splitter glass.
    }

    private func renderSizeForCurrentTarget(_ state: AppState) -> CGSize {
        if let id = state.selectedDisplayId,
           let screen = NSScreen.screens.first(where: { displayId(for: $0) == id }) {
            return screen.frame.size
        }
        if let main = NSScreen.main {
            return main.frame.size
        }
        return CGSize(width: 1920, height: 1080)
    }

    private func displayId(for screen: NSScreen) -> UInt32? {
        guard let n = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber else { return nil }
        return n.uint32Value
    }
}
