import Cocoa

final class TeleprompterViewController: NSViewController {
    private let store: Store
    private let engine: PlaybackEngine
    private var subscriptionToken: UUID?
    private var engineToken: UUID?

    private let scrollView = ScrollingTextView()

    private var lastState: AppState?
    private var keyMonitor: Any?

    init(store: Store, engine: PlaybackEngine) {
        self.store = store
        self.engine = engine
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func loadView() {
        scrollView.frame = NSRect(x: 0, y: 0, width: 1280, height: 800)
        self.view = scrollView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        subscriptionToken = store.subscribe { [weak self] state in
            self?.applyState(state)
        }
        // Subscribe to the engine — every frame the engine ticks, this VC's
        // scroll view's transform is updated alongside the monitor's. Same
        // value, same CATransaction commit, no synchronization needed.
        engineToken = engine.subscribe { [weak self] pos in
            self?.scrollView.applyStaticPosition(pos)
        }
    }

    override func viewDidLayout() {
        super.viewDidLayout()
        guard let state = lastState else { return }
        scrollView.relayout(script: state.activeScript, appearance: state.appearance)
        scrollView.applyStaticPosition(engine.currentPosition)
        // Tell the engine the canonical scroll distance for rate calculations.
        engine.totalDistance = Double(scrollView.cachedTextHeight)
    }

    override func viewDidAppear() {
        super.viewDidAppear()
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self = self else { return event }
            guard event.window === self.view.window else { return event }
            if event.keyCode == 53 { // Esc
                self.view.window?.close()
                return nil
            }
            if event.keyCode == 49 { // Space
                self.store.dispatch(.togglePlay)
                return nil
            }
            return event
        }
    }

    override func viewDidDisappear() {
        super.viewDidDisappear()
        if let monitor = keyMonitor {
            NSEvent.removeMonitor(monitor)
            keyMonitor = nil
        }
    }

    deinit {
        if let token = subscriptionToken { store.unsubscribe(token) }
        if let token = engineToken { engine.unsubscribe(token) }
    }

    private func applyState(_ newState: AppState) {
        let previous = lastState
        lastState = newState

        let scriptChanged =
            previous?.activeScript?.id != newState.activeScript?.id ||
            previous?.activeScript?.content != newState.activeScript?.content
        let appearanceChanged = previous?.appearance != newState.appearance

        if scriptChanged || appearanceChanged {
            scrollView.relayout(script: newState.activeScript, appearance: newState.appearance)
            engine.totalDistance = Double(scrollView.cachedTextHeight)
            // Re-apply current engine position with new layout dimensions.
            scrollView.applyStaticPosition(engine.currentPosition)
        }
        if appearanceChanged {
            scrollView.applyMirrorFlip(newState.appearance)
        }
    }
}
