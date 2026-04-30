import Cocoa

final class AppDelegate: NSObject, NSApplicationDelegate {
    let store = Store(initialState: AppState.initial())
    let engine = PlaybackEngine()

    var operatorWindowController: OperatorWindowController?
    var teleprompterWindowController: TeleprompterWindowController?
    private var lastEngineApplied: (playing: Bool, speed: Double, position: Double)?

    func applicationDidFinishLaunching(_ notification: Notification) {
        installMainMenu()

        engine.onPlaybackFinished = { [weak self] in
            self?.store.dispatch(.pause)
        }
        store.subscribe { [weak self] state in
            self?.applyEngineFromState(state)
        }

        refreshDisplays()
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleScreenChange),
            name: NSApplication.didChangeScreenParametersNotification,
            object: nil
        )

        operatorWindowController = OperatorWindowController(store: store, engine: engine)
        operatorWindowController?.showWindow(nil)

        if let opWin = operatorWindowController?.window {
            NotificationCenter.default.addObserver(
                self,
                selector: #selector(handleOperatorClose),
                name: NSWindow.willCloseNotification,
                object: opWin
            )
        }

        NSApp.activate(ignoringOtherApps: true)
    }

    @objc private func handleOperatorClose() {
        teleprompterWindowController?.close()
        teleprompterWindowController = nil
        NSApp.presentationOptions = []
    }

    private func applyEngineFromState(_ state: AppState) {
        let playing = state.playback.playing
        let speed = state.playback.speed
        let position = state.playback.position
        let prev = lastEngineApplied
        lastEngineApplied = (playing, speed, position)

        engine.speed = speed

        if !playing && (prev?.playing ?? false) {
            engine.pause()
            // Capture the live position into state so the operator slider
            // shows where we paused.
            let livePos = engine.currentPosition
            if abs(livePos - position) > 0.0001 {
                DispatchQueue.main.async { [weak self] in
                    self?.store.dispatch(.setPosition(livePos))
                }
            }
        } else if playing && !(prev?.playing ?? false) {
            engine.setPosition(position)
            engine.play()
        } else if let p = prev, abs(position - p.position) > 0.0001 {
            // Position changed (seek) regardless of playing state.
            engine.setPosition(position)
        }
    }

    @objc private func handleScreenChange() { refreshDisplays() }

    private func refreshDisplays() {
        let primaryId = displayId(for: NSScreen.main)
        let infos: [DisplayInfo] = NSScreen.screens.enumerated().compactMap { (idx, screen) in
            guard let id = displayId(for: screen) else { return nil }
            let label = "Display \(idx + 1) (\(Int(screen.frame.width))×\(Int(screen.frame.height)))"
            return DisplayInfo(id: id, label: label, isPrimary: id == primaryId)
        }
        store.dispatch(.displaysRefreshed(infos))
    }

    private func displayId(for screen: NSScreen?) -> UInt32? {
        guard let n = screen?.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber else {
            return nil
        }
        return n.uint32Value
    }

    private func screen(forDisplayId id: UInt32) -> NSScreen? {
        return NSScreen.screens.first { displayId(for: $0) == id }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }

    func openTeleprompter() {
        if let existing = teleprompterWindowController, existing.window?.isVisible == true {
            existing.window?.makeKeyAndOrderFront(nil)
            return
        }
        let target: NSScreen? = {
            if let id = store.state.selectedDisplayId, let s = screen(forDisplayId: id) { return s }
            return NSScreen.screens.first { displayId(for: $0) != displayId(for: NSScreen.main) }
                ?? NSScreen.main
                ?? NSScreen.screens.first
        }()

        // The PlaybackEngine already holds the live position; the new
        // teleprompter VC will subscribe and pick up the current value on
        // its first callback. No state-shuffle needed.

        let controller = TeleprompterWindowController(store: store, engine: engine, screen: target)
        controller.showWindow(nil)
        teleprompterWindowController = controller
        store.dispatch(.setTeleprompterOpen(true))

        NSApp.presentationOptions = [.autoHideMenuBar, .autoHideDock]

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleTeleprompterClose(_:)),
            name: NSWindow.willCloseNotification,
            object: controller.window
        )
    }

    func closeTeleprompter() {
        teleprompterWindowController?.close()
    }

    @objc private func handleTeleprompterClose(_ notification: Notification) {
        if let win = notification.object as? NSWindow {
            NotificationCenter.default.removeObserver(self, name: NSWindow.willCloseNotification, object: win)
        }
        teleprompterWindowController = nil
        store.dispatch(.setTeleprompterOpen(false))
        NSApp.presentationOptions = []
    }

    private func installMainMenu() {
        let mainMenu = NSMenu()
        let appMenuItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(NSMenuItem(title: "Quit Teleprompter", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        appMenuItem.submenu = appMenu

        let editMenuItem = NSMenuItem()
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(NSMenuItem(title: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x"))
        editMenu.addItem(NSMenuItem(title: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c"))
        editMenu.addItem(NSMenuItem(title: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v"))
        editMenu.addItem(NSMenuItem(title: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a"))
        editMenu.addItem(.separator())
        editMenu.addItem(NSMenuItem(title: "Undo", action: Selector(("undo:")), keyEquivalent: "z"))
        editMenu.addItem(NSMenuItem(title: "Redo", action: Selector(("redo:")), keyEquivalent: "Z"))
        editMenuItem.submenu = editMenu

        mainMenu.addItem(appMenuItem)
        mainMenu.addItem(editMenuItem)
        NSApp.mainMenu = mainMenu
    }
}
