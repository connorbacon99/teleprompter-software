import Cocoa

final class TeleprompterWindowController: NSWindowController {
    init(store: Store, engine: PlaybackEngine, screen: NSScreen?) {
        let target = screen ?? NSScreen.main ?? NSScreen.screens.first!
        let frame = target.frame

        let window = NSWindow(
            contentRect: frame,
            styleMask: [.borderless],
            backing: .buffered,
            defer: false,
            screen: target
        )
        window.title = "Teleprompter"
        window.backgroundColor = .black
        window.isReleasedWhenClosed = false
        // Stay at normal level so Mission Control / Cmd+Tab still work.
        // The borderless frame already covers the entire chosen screen; the
        // menu bar sliver at the top sits within the gradient fade region.
        window.level = .normal
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        window.hasShadow = false
        window.isOpaque = true
        window.setFrame(frame, display: true)

        NSLog("[Teleprompter] target screen frame=\(frame)")
        NSLog("[Teleprompter] available screens: \(NSScreen.screens.map { $0.frame })")

        let vc = TeleprompterViewController(store: store, engine: engine)
        window.contentViewController = vc
        // Re-pin the frame after attaching the VC, in case Auto Layout shrunk it.
        window.setFrame(frame, display: true)

        super.init(window: window)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func showWindow(_ sender: Any?) {
        super.showWindow(sender)
        // Re-pin frame after window order; AppKit can shift borderless windows
        // toward the focused screen on first display.
        if let win = window, let target = win.screen {
            win.setFrame(target.frame, display: true)
        }
        window?.makeKeyAndOrderFront(nil)
        if let win = window {
            NSLog("[Teleprompter] final window frame=\(win.frame), on screen=\(String(describing: win.screen?.frame))")
        }
    }
}
