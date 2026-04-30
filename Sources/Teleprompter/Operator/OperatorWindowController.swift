import Cocoa

final class OperatorWindowController: NSWindowController {
    init(store: Store, engine: PlaybackEngine) {
        let window = NSWindow(
            contentRect: NSRect(x: 100, y: 100, width: 1280, height: 820),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Teleprompter — Operator"
        window.minSize = NSSize(width: 1000, height: 600)
        window.backgroundColor = NSColor(white: 0.06, alpha: 1)
        window.isRestorable = false
        window.contentViewController = OperatorViewController(store: store, engine: engine)
        window.setContentSize(NSSize(width: 1280, height: 820))
        window.center()
        super.init(window: window)
    }

    required init?(coder: NSCoder) { fatalError() }
}
