import Cocoa
import Carbon.HIToolbox

/// Posted when the global ⌃⌥F hotkey fires. `TrackerView` observes this and
/// logs a flub at the current scroll position, the same way the in-app
/// "Log line" button does — letting the operator drop a flub marker from any
/// focused app (camera control, browser, etc.) without alt-tabbing.
public extension Notification.Name {
    static let teleprompterFlubHotkey = Notification.Name("TeleprompterFlubHotkey")
}

public final class AppDelegate: NSObject, NSApplicationDelegate {
    let store: Store
    let engine = PlaybackEngine()

    var operatorWindowController: OperatorWindowController?
    var teleprompterWindowController: TeleprompterWindowController?
    private var lastEngineApplied: (playing: Bool, speed: Double, position: Double)?
    private var persistenceSaveTimer: Timer?

    private var flubHotKeyRef: EventHotKeyRef?
    private var flubHotKeyHandler: EventHandlerRef?

    public override init() {
        // Load persisted scripts/appearance if present, otherwise use defaults.
        // Playback / display / teleprompter-window state always start clean.
        var initial = AppState.initial()
        if let snap = Persistence.load(), !snap.scripts.isEmpty {
            initial.scripts = snap.scripts
            if let id = snap.activeScriptId, snap.scripts.contains(where: { $0.id == id }) {
                initial.activeScriptId = id
            } else if let firstId = snap.scripts.first?.id {
                initial.activeScriptId = firstId
            }
            initial.appearance = snap.appearance
        }
        self.store = Store(initialState: initial)
        super.init()
    }

    public func applicationDidFinishLaunching(_ notification: Notification) {
        installMainMenu()

        engine.onPlaybackFinished = { [weak self] in
            self?.store.dispatch(.pause)
        }
        store.subscribe { [weak self] state in
            self?.applyEngineFromState(state)
        }
        store.subscribeActions { [weak self] state, action in
            self?.persistenceSaveAfter(action: action, state: state)
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

        registerFlubHotkey()

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

    public func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }

    public func applicationWillTerminate(_ notification: Notification) {
        unregisterFlubHotkey()
        // Force a final, non-debounced save before exit.
        persistenceSaveTimer?.invalidate()
        Persistence.save(.init(
            scripts: store.state.scripts,
            activeScriptId: store.state.activeScriptId,
            appearance: store.state.appearance
        ))
    }

    // MARK: - Global flub hotkey (⌃⌥F)

    /// Registers a Carbon `RegisterEventHotKey` for ⌃⌥F. Carbon hotkeys are
    /// in-process but route from the user's whole session, so the operator can
    /// hit the combo while the camera-control app (or any other) has focus
    /// and we still get the event. No accessibility entitlements required.
    /// On failure (combo already taken system-wide, handler install failure)
    /// we NSLog and return — never crash; the in-app "Log line" button is the
    /// fallback path.
    private func registerFlubHotkey() {
        var eventSpec = EventTypeSpec(
            eventClass: OSType(kEventClassKeyboard),
            eventKind: UInt32(kEventHotKeyPressed)
        )
        let handlerStatus = InstallEventHandler(
            GetApplicationEventTarget(),
            { (_, _, _) -> OSStatus in
                // The Carbon handler can fire on a non-main thread; hop back
                // to main before posting the notification so observers
                // (TrackerView, store dispatch) stay on AppKit's thread.
                DispatchQueue.main.async {
                    NotificationCenter.default.post(name: .teleprompterFlubHotkey, object: nil)
                }
                return noErr
            },
            1,
            &eventSpec,
            nil,
            &flubHotKeyHandler
        )
        if handlerStatus != noErr {
            NSLog("Teleprompter: InstallEventHandler for flub hotkey failed (status=\(handlerStatus)); ⌃⌥F will be inactive.")
            return
        }

        // Signature 'TELE' (0x54454C45) namespaces this hotkey so a future
        // second hotkey can use the same handler with a different id.
        let hotKeyID = EventHotKeyID(signature: OSType(0x54454C45), id: 1)
        let keyCode = UInt32(kVK_ANSI_F)
        let modifiers = UInt32(controlKey | optionKey)
        let regStatus = RegisterEventHotKey(
            keyCode,
            modifiers,
            hotKeyID,
            GetApplicationEventTarget(),
            0,
            &flubHotKeyRef
        )
        if regStatus != noErr {
            NSLog("Teleprompter: RegisterEventHotKey for ⌃⌥F failed (status=\(regStatus)); the combo may already be taken system-wide. Use the in-app Log line button instead.")
        }
    }

    private func unregisterFlubHotkey() {
        if let ref = flubHotKeyRef {
            UnregisterEventHotKey(ref)
            flubHotKeyRef = nil
        }
        if let handler = flubHotKeyHandler {
            RemoveEventHandler(handler)
            flubHotKeyHandler = nil
        }
    }

    private func persistenceSaveAfter(action: Action, state: AppState) {
        // Recording-log mutations save synchronously: a flub logged at hour 11
        // of a 12h shoot must survive an immediate process kill, so we can't
        // wait out the 500ms debounce window.
        if action.isRecordingLogMutation {
            persistenceSaveTimer?.invalidate()
            persistenceSaveTimer = nil
            Persistence.save(.init(
                scripts: state.scripts,
                activeScriptId: state.activeScriptId,
                appearance: state.appearance
            ))
            return
        }
        // Everything else (typing in the editor, appearance tweaks, etc.)
        // debounces so rapid edits don't thrash the disk. 500ms is short
        // enough that no realistic crash window loses meaningful work.
        persistenceSaveTimer?.invalidate()
        persistenceSaveTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: false) { [weak self] _ in
            guard let self = self else { return }
            Persistence.save(.init(
                scripts: self.store.state.scripts,
                activeScriptId: self.store.state.activeScriptId,
                appearance: self.store.state.appearance
            ))
        }
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
