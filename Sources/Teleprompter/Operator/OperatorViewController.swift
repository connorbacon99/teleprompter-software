import Cocoa

final class OperatorViewController: NSViewController, NSTextViewDelegate, NSTextDelegate {
    private let store: Store
    private let engine: PlaybackEngine
    private var subscriptionToken: UUID?

    private let segmentedControl = NSSegmentedControl(
        labels: ["Editor", "Monitor", "Tracker"],
        trackingMode: .selectOne,
        target: nil,
        action: nil
    )

    private let editorScrollView = NSScrollView()
    private let editorTextView = NSTextView()
    private var monitorView: MonitorPreviewView!
    private var monitorContainer: NSView!
    private var trackerHUDView: TrackerHUDView!
    private var trackerView: TrackerView!
    private var tabBar: ScriptTabBar!

    private let playPauseButton = NSButton(title: "Play", target: nil, action: nil)
    private let resetButton = NSButton(title: "Reset", target: nil, action: nil)
    private let openTeleprompterButton = NSButton(title: "Launch teleprompter", target: nil, action: nil)
    private let displayPopup = NSPopUpButton(title: "", target: nil, action: nil)

    private let speedSlider = NSSlider(value: 1, minValue: 0.1, maxValue: 3, target: nil, action: nil)
    private let speedLabel = NSTextField(labelWithString: "Speed: 1.00×")
    private let positionSlider = NSSlider(value: 0, minValue: 0, maxValue: 1, target: nil, action: nil)
    private let positionLabel = NSTextField(labelWithString: "Position: 0.0%")
    private let progressLabel = NSTextField(labelWithString: "0% through script • ~0 min remaining at current speed")
    private let fontSizeSlider = NSSlider(value: 64, minValue: 24, maxValue: 200, target: nil, action: nil)
    private let fontSizeLabel = NSTextField(labelWithString: "Font: 64pt")
    private let mirrorCheckbox = NSButton(checkboxWithTitle: "Mirror (horizontal)", target: nil, action: nil)
    private let flipCheckbox = NSButton(checkboxWithTitle: "Flip (vertical)", target: nil, action: nil)

    private var lastSeenContent: String = ""
    private var suppressEditorUpdate = false
    private var keyMonitor: Any?
    private var lastPlayingState: Bool = false
    private var positionPollTimer: Timer?
    private var bookmarkFlashLabel: NSTextField?
    private var bookmarkFlashTimer: Timer?
    private var progressUpdateTimer: Timer?

    init(store: Store, engine: PlaybackEngine) {
        self.store = store
        self.engine = engine
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func loadView() {
        let root = NSView(frame: NSRect(x: 0, y: 0, width: 1280, height: 820))
        root.wantsLayer = true
        root.layer?.backgroundColor = NSColor(white: 0.06, alpha: 1).cgColor
        self.view = root

        // Tab bar (multi-script)
        tabBar = ScriptTabBar(store: store)
        tabBar.translatesAutoresizingMaskIntoConstraints = false

        let tabSeparator = NSBox()
        tabSeparator.boxType = .separator
        tabSeparator.translatesAutoresizingMaskIntoConstraints = false

        // View-mode top bar with segmented control
        let leftTopBar = NSView()
        leftTopBar.translatesAutoresizingMaskIntoConstraints = false
        leftTopBar.wantsLayer = true
        leftTopBar.layer?.backgroundColor = NSColor(white: 0.08, alpha: 1).cgColor

        segmentedControl.translatesAutoresizingMaskIntoConstraints = false
        segmentedControl.selectedSegment = 0
        segmentedControl.target = self
        segmentedControl.action = #selector(segmentChanged)
        leftTopBar.addSubview(segmentedControl)

        let topbarSeparator = NSBox()
        topbarSeparator.boxType = .separator
        topbarSeparator.translatesAutoresizingMaskIntoConstraints = false

        // Content swap area
        let contentContainer = NSView()
        contentContainer.translatesAutoresizingMaskIntoConstraints = false

        // Editor
        editorTextView.isRichText = false
        editorTextView.font = NSFont.monospacedSystemFont(ofSize: 14, weight: .regular)
        editorTextView.textColor = NSColor(white: 0.92, alpha: 1)
        editorTextView.backgroundColor = NSColor(white: 0.06, alpha: 1)
        editorTextView.insertionPointColor = .white
        editorTextView.allowsUndo = true
        editorTextView.isAutomaticQuoteSubstitutionEnabled = false
        editorTextView.isAutomaticDashSubstitutionEnabled = false
        editorTextView.isAutomaticTextReplacementEnabled = false
        editorTextView.isAutomaticSpellingCorrectionEnabled = false
        editorTextView.delegate = self
        editorTextView.autoresizingMask = [.width]

        editorScrollView.documentView = editorTextView
        editorScrollView.hasVerticalScroller = true
        editorScrollView.borderType = .noBorder
        editorScrollView.drawsBackground = true
        editorScrollView.backgroundColor = NSColor(white: 0.06, alpha: 1)
        editorScrollView.translatesAutoresizingMaskIntoConstraints = false

        // Monitor (preview on top + tracker HUD docked at the bottom). The
        // HUD shares timer state with TrackerView via the Store so the
        // operator can log mid-recording without leaving this tab.
        monitorView = MonitorPreviewView(store: store, engine: engine)
        monitorView.translatesAutoresizingMaskIntoConstraints = false

        trackerHUDView = TrackerHUDView(store: store, engine: engine)
        trackerHUDView.translatesAutoresizingMaskIntoConstraints = false

        monitorContainer = NSView()
        monitorContainer.translatesAutoresizingMaskIntoConstraints = false
        monitorContainer.isHidden = true
        monitorContainer.addSubview(monitorView)
        monitorContainer.addSubview(trackerHUDView)

        NSLayoutConstraint.activate([
            monitorView.topAnchor.constraint(equalTo: monitorContainer.topAnchor),
            monitorView.leadingAnchor.constraint(equalTo: monitorContainer.leadingAnchor),
            monitorView.trailingAnchor.constraint(equalTo: monitorContainer.trailingAnchor),
            monitorView.bottomAnchor.constraint(equalTo: trackerHUDView.topAnchor),

            trackerHUDView.leadingAnchor.constraint(equalTo: monitorContainer.leadingAnchor),
            trackerHUDView.trailingAnchor.constraint(equalTo: monitorContainer.trailingAnchor),
            trackerHUDView.bottomAnchor.constraint(equalTo: monitorContainer.bottomAnchor),
            trackerHUDView.heightAnchor.constraint(equalToConstant: 80)
        ])

        // Tracker
        trackerView = TrackerView(store: store, engine: engine)
        trackerView.translatesAutoresizingMaskIntoConstraints = false
        trackerView.isHidden = true

        contentContainer.addSubview(editorScrollView)
        contentContainer.addSubview(monitorContainer)
        contentContainer.addSubview(trackerView)

        // Sidebar controls
        playPauseButton.target = self
        playPauseButton.action = #selector(togglePlay)
        playPauseButton.bezelStyle = .rounded

        resetButton.target = self
        resetButton.action = #selector(reset)
        resetButton.bezelStyle = .rounded

        openTeleprompterButton.target = self
        openTeleprompterButton.action = #selector(openTeleprompter)
        openTeleprompterButton.bezelStyle = .rounded

        displayPopup.target = self
        displayPopup.action = #selector(displaySelectionChanged)

        speedSlider.target = self
        speedSlider.action = #selector(speedChanged)
        speedSlider.isContinuous = true

        positionSlider.target = self
        positionSlider.action = #selector(positionChanged)
        positionSlider.isContinuous = true

        fontSizeSlider.target = self
        fontSizeSlider.action = #selector(fontSizeChanged)
        fontSizeSlider.isContinuous = true

        mirrorCheckbox.target = self
        mirrorCheckbox.action = #selector(mirrorToggled)

        flipCheckbox.target = self
        flipCheckbox.action = #selector(flipToggled)

        for label in [speedLabel, positionLabel, fontSizeLabel] {
            label.textColor = NSColor(white: 0.78, alpha: 1)
            label.font = NSFont.systemFont(ofSize: 12)
        }
        progressLabel.textColor = NSColor(white: 0.62, alpha: 1)
        progressLabel.font = NSFont.systemFont(ofSize: 11)
        progressLabel.lineBreakMode = .byWordWrapping
        progressLabel.maximumNumberOfLines = 2
        progressLabel.preferredMaxLayoutWidth = 280
        for cb in [mirrorCheckbox, flipCheckbox] {
            cb.contentTintColor = NSColor(white: 0.92, alpha: 1)
        }

        let topRow = NSStackView(views: [playPauseButton, resetButton])
        topRow.orientation = .horizontal
        topRow.spacing = 8
        topRow.distribution = .fillEqually

        let sidebar = NSStackView(views: [
            sectionHeader("Display"),
            displayPopup,
            openTeleprompterButton,
            spacer(8),
            sectionHeader("Playback"),
            topRow,
            speedLabel, speedSlider,
            positionLabel, positionSlider,
            progressLabel,
            spacer(8),
            sectionHeader("Appearance"),
            fontSizeLabel, fontSizeSlider,
            mirrorCheckbox,
            flipCheckbox
        ])
        sidebar.orientation = .vertical
        sidebar.alignment = .leading
        sidebar.spacing = 6
        sidebar.translatesAutoresizingMaskIntoConstraints = false
        sidebar.edgeInsets = NSEdgeInsets(top: 12, left: 16, bottom: 12, right: 16)

        let divider = NSBox()
        divider.boxType = .separator
        divider.translatesAutoresizingMaskIntoConstraints = false

        root.addSubview(tabBar)
        root.addSubview(tabSeparator)
        root.addSubview(leftTopBar)
        root.addSubview(topbarSeparator)
        root.addSubview(contentContainer)
        root.addSubview(divider)
        root.addSubview(sidebar)

        NSLayoutConstraint.activate([
            // Tab bar
            tabBar.topAnchor.constraint(equalTo: root.topAnchor),
            tabBar.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            tabBar.trailingAnchor.constraint(equalTo: divider.leadingAnchor),
            tabBar.heightAnchor.constraint(equalToConstant: 38),

            tabSeparator.topAnchor.constraint(equalTo: tabBar.bottomAnchor),
            tabSeparator.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            tabSeparator.trailingAnchor.constraint(equalTo: divider.leadingAnchor),
            tabSeparator.heightAnchor.constraint(equalToConstant: 1),

            // View-mode top bar
            leftTopBar.topAnchor.constraint(equalTo: tabSeparator.bottomAnchor),
            leftTopBar.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            leftTopBar.trailingAnchor.constraint(equalTo: divider.leadingAnchor),
            leftTopBar.heightAnchor.constraint(equalToConstant: 40),

            segmentedControl.centerYAnchor.constraint(equalTo: leftTopBar.centerYAnchor),
            segmentedControl.leadingAnchor.constraint(equalTo: leftTopBar.leadingAnchor, constant: 16),

            topbarSeparator.topAnchor.constraint(equalTo: leftTopBar.bottomAnchor),
            topbarSeparator.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            topbarSeparator.trailingAnchor.constraint(equalTo: divider.leadingAnchor),
            topbarSeparator.heightAnchor.constraint(equalToConstant: 1),

            // Content swap
            contentContainer.topAnchor.constraint(equalTo: topbarSeparator.bottomAnchor),
            contentContainer.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            contentContainer.trailingAnchor.constraint(equalTo: divider.leadingAnchor),
            contentContainer.bottomAnchor.constraint(equalTo: root.bottomAnchor),

            editorScrollView.topAnchor.constraint(equalTo: contentContainer.topAnchor),
            editorScrollView.leadingAnchor.constraint(equalTo: contentContainer.leadingAnchor),
            editorScrollView.trailingAnchor.constraint(equalTo: contentContainer.trailingAnchor),
            editorScrollView.bottomAnchor.constraint(equalTo: contentContainer.bottomAnchor),

            monitorContainer.topAnchor.constraint(equalTo: contentContainer.topAnchor),
            monitorContainer.leadingAnchor.constraint(equalTo: contentContainer.leadingAnchor),
            monitorContainer.trailingAnchor.constraint(equalTo: contentContainer.trailingAnchor),
            monitorContainer.bottomAnchor.constraint(equalTo: contentContainer.bottomAnchor),

            trackerView.topAnchor.constraint(equalTo: contentContainer.topAnchor),
            trackerView.leadingAnchor.constraint(equalTo: contentContainer.leadingAnchor),
            trackerView.trailingAnchor.constraint(equalTo: contentContainer.trailingAnchor),
            trackerView.bottomAnchor.constraint(equalTo: contentContainer.bottomAnchor),

            // Enforce minimum width on the editor area so AppKit doesn't collapse it
            contentContainer.widthAnchor.constraint(greaterThanOrEqualToConstant: 600),

            // Vertical divider + sidebar
            divider.topAnchor.constraint(equalTo: root.topAnchor),
            divider.bottomAnchor.constraint(equalTo: root.bottomAnchor),
            divider.widthAnchor.constraint(equalToConstant: 1),
            divider.trailingAnchor.constraint(equalTo: sidebar.leadingAnchor),

            sidebar.topAnchor.constraint(equalTo: root.topAnchor),
            sidebar.bottomAnchor.constraint(equalTo: root.bottomAnchor),
            sidebar.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            sidebar.widthAnchor.constraint(equalToConstant: 320),

            speedSlider.widthAnchor.constraint(equalToConstant: 280),
            positionSlider.widthAnchor.constraint(equalToConstant: 280),
            fontSizeSlider.widthAnchor.constraint(equalToConstant: 280)
        ])
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        subscriptionToken = store.subscribe { [weak self] state in
            self?.applyState(state)
        }
    }

    override func viewDidAppear() {
        super.viewDidAppear()
        positionPollTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            guard self.engine.isPlaying else { return }
            let pos = self.engine.currentPosition
            if self.positionSlider.window?.firstResponder !== self.positionSlider {
                self.positionSlider.doubleValue = pos
            }
            self.positionLabel.stringValue = String(format: "Position: %.1f%%", pos * 100)
        }
        // Progress indicator refreshes 2× per second — capped per PRD so the
        // label doesn't churn the runloop. Runs whether playing or paused so
        // speed-slider drags update the remaining-time estimate too.
        progressUpdateTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            self?.updateProgressLabel()
        }
        updateProgressLabel()

        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self = self else { return event }
            guard event.window === self.view.window else { return event }
            // Don't fight with Cmd+key shortcuts (menu, undo, etc.)
            if event.modifierFlags.contains(.command) { return event }

            // Esc closes the teleprompter regardless of focus — it's the
            // panic shortcut and must work even when the cursor is in a
            // tracker cell or the script editor (where Esc would otherwise
            // just beep at the field editor).
            if event.keyCode == 53, self.store.state.teleprompterOpen {
                (NSApp.delegate as? AppDelegate)?.closeTeleprompter()
                return nil
            }

            // Don't intercept other keys when any text editor has focus. The
            // script editor, tracker table cells (line/note inline edit), and
            // the tab-bar rename field all use an NSText-derived field editor
            // as their first responder. Without this, spacebar in a tracker
            // cell would toggle playback mid-typing.
            if let resp = self.view.window?.firstResponder, resp is NSText { return event }

            switch event.keyCode {
            case 53: // Esc — no teleprompter open, fall through to system
                return event
            case 49: // Space
                self.store.dispatch(.togglePlay)
                return nil
            case 126: // ArrowUp — speed up
                let cur = self.store.state.playback.speed
                self.store.dispatch(.setSpeed(min(3.0, cur + 0.1)))
                return nil
            case 125: // ArrowDown — slow down
                let cur = self.store.state.playback.speed
                self.store.dispatch(.setSpeed(max(0.1, cur - 0.1)))
                return nil
            case 115: // Home
                self.store.dispatch(.setPosition(0))
                return nil
            case 119: // End
                self.store.dispatch(.setPosition(1))
                return nil
            case 11: // 'B' — bookmark current scroll position as a cue marker
                // Bookmark only on unmodified B (shift is fine — that's still
                // a literal 'B'). Control/Option may map to other shortcuts.
                // The top-level NSText guard already prevents stealing 'B'
                // from any text input.
                let blockers: NSEvent.ModifierFlags = [.control, .option]
                if !event.modifierFlags.intersection(blockers).isEmpty {
                    return event
                }
                self.addBookmarkAtCurrentPosition()
                return nil
            default:
                return event
            }
        }
    }

    override func viewDidDisappear() {
        super.viewDidDisappear()
        if let monitor = keyMonitor {
            NSEvent.removeMonitor(monitor)
            keyMonitor = nil
        }
        positionPollTimer?.invalidate()
        positionPollTimer = nil
        progressUpdateTimer?.invalidate()
        progressUpdateTimer = nil
    }

    deinit {
        if let token = subscriptionToken { store.unsubscribe(token) }
        if let monitor = keyMonitor { NSEvent.removeMonitor(monitor) }
        positionPollTimer?.invalidate()
        progressUpdateTimer?.invalidate()
        bookmarkFlashTimer?.invalidate()
    }

    /// Live animated position of the operator's monitor preview. AppDelegate
    /// reads this so a teleprompter window opened mid-play can join at the
    /// right scroll position instead of restarting from the play-start value.
    func currentMonitorVisualPosition() -> Double {
        return monitorView.currentVisualPosition()
    }

    @objc private func segmentChanged() {
        let idx = segmentedControl.selectedSegment
        editorScrollView.isHidden = idx != 0
        monitorContainer.isHidden = idx != 1
        trackerView.isHidden = idx != 2
    }

    private func applyState(_ state: AppState) {
        if let active = state.activeScript {
            if active.content != lastSeenContent && !suppressEditorUpdate {
                editorTextView.string = active.content
            }
            lastSeenContent = active.content
        }
        rebuildDisplayPopupIfNeeded(state)

        // When playback starts from a stopped state, swap the operator into
        // Monitor view so spacebar / arrows route to playback control instead
        // of editing the script.
        if state.playback.playing && !lastPlayingState && segmentedControl.selectedSegment == 0 {
            segmentedControl.selectedSegment = 1
            segmentChanged()
        }
        // When playback stops, capture the live animated position into state so
        // the operator slider doesn't snap back to a stale value.
        if !state.playback.playing && lastPlayingState {
            let visualPos = monitorView.currentVisualPosition()
            if abs(visualPos - state.playback.position) > 0.0001 {
                DispatchQueue.main.async { [weak self] in
                    self?.store.dispatch(.setPosition(visualPos))
                }
            }
        }
        lastPlayingState = state.playback.playing

        playPauseButton.title = state.playback.playing ? "Pause" : "Play"
        openTeleprompterButton.title = state.teleprompterOpen ? "Close teleprompter" : "Launch teleprompter"
        speedSlider.doubleValue = state.playback.speed
        speedLabel.stringValue = String(format: "Speed: %.2f×", state.playback.speed)
        if positionSlider.window?.firstResponder !== positionSlider {
            positionSlider.doubleValue = state.playback.position
        }
        positionLabel.stringValue = String(format: "Position: %.1f%%", state.playback.position * 100)
        fontSizeSlider.doubleValue = state.appearance.fontSizePt
        fontSizeLabel.stringValue = String(format: "Font: %.0fpt", state.appearance.fontSizePt)
        mirrorCheckbox.state = state.appearance.mirror ? .on : .off
        flipCheckbox.state = state.appearance.flip ? .on : .off
        updateProgressLabel()
    }

    /// Refreshes `progressLabel` from current engine state. Called from the
    /// 0.5s timer (during play and pause) and from `applyState` for snappy
    /// response to slider drags. The static formatter is exercised in tests.
    private func updateProgressLabel() {
        progressLabel.stringValue = OperatorViewController.progressIndicatorText(
            position: engine.currentPosition,
            totalDistance: engine.totalDistance,
            speed: engine.speed,
            pixelsPerSecondAt1x: engine.pixelsPerSecondAt1x
        )
    }

    /// Format the progress indicator string. Pure function — kept static so
    /// the test target can call it without spinning up an NSViewController.
    /// Returns "N% through script • ~M min remaining at current speed" when
    /// both speed and totalDistance are positive; falls back to "~? min" when
    /// the rate is undefined (paused-from-rest with no layout yet, or speed=0).
    static func progressIndicatorText(
        position: Double,
        totalDistance: Double,
        speed: Double,
        pixelsPerSecondAt1x: Double
    ) -> String {
        let clamped = max(0, min(1, position))
        let pct = Int((clamped * 100).rounded())
        let rate = speed * pixelsPerSecondAt1x
        guard rate > 0, totalDistance > 0 else {
            return "\(pct)% through script • ~? min remaining at current speed"
        }
        let remainingSeconds = totalDistance * (1.0 - clamped) / rate
        let remainingMin = max(0, Int((remainingSeconds / 60).rounded()))
        return "\(pct)% through script • ~\(remainingMin) min remaining at current speed"
    }

    private var renderedDisplayIds: [UInt32] = []
    private func rebuildDisplayPopupIfNeeded(_ state: AppState) {
        let ids = state.displays.map { $0.id }
        if ids != renderedDisplayIds {
            displayPopup.removeAllItems()
            for d in state.displays {
                let title = d.label + (d.isPrimary ? " (primary)" : "")
                displayPopup.addItem(withTitle: title)
                displayPopup.lastItem?.representedObject = d.id
            }
            renderedDisplayIds = ids
        }
        if let selected = state.selectedDisplayId,
           let idx = state.displays.firstIndex(where: { $0.id == selected }) {
            displayPopup.selectItem(at: idx)
        }
    }

    @objc private func displaySelectionChanged() {
        let selected = displayPopup.selectedItem?.representedObject as? UInt32
        store.dispatch(.setSelectedDisplay(selected))
    }

    @objc private func togglePlay() { store.dispatch(.togglePlay) }
    @objc private func reset() { store.dispatch(.reset) }
    @objc private func openTeleprompter() {
        guard let delegate = NSApp.delegate as? AppDelegate else { return }
        if store.state.teleprompterOpen {
            delegate.closeTeleprompter()
        } else {
            delegate.openTeleprompter()
        }
    }

    private func addBookmarkAtCurrentPosition() {
        guard let scriptId = store.state.activeScript?.id else { return }
        let elapsed = trackerView.currentRecordingElapsedSeconds()
        let label = TrackerView.bookmarkLabel(elapsedSeconds: elapsed, wallclock: Date())
        let position = engine.currentPosition
        store.dispatch(.cueAdd(scriptId: scriptId, label: label, position: position))
        flashBookmarkConfirmation(label: label)
    }

    /// Brief HUD-style overlay confirming a bookmark was added. Re-pressing
    /// 'B' before the 1.5s timer expires replaces the label and restarts the
    /// timer — so a flurry of bookmarks shows the most recent one for the
    /// configured dwell time instead of disappearing too fast.
    private func flashBookmarkConfirmation(label: String) {
        let field: NSTextField
        if let existing = bookmarkFlashLabel {
            field = existing
        } else {
            field = NSTextField(labelWithString: "")
            field.translatesAutoresizingMaskIntoConstraints = false
            field.font = NSFont.systemFont(ofSize: 13, weight: .medium)
            field.textColor = NSColor(white: 0.98, alpha: 1)
            field.drawsBackground = true
            field.backgroundColor = NSColor(white: 0.0, alpha: 0.78)
            field.isBezeled = false
            field.isEditable = false
            field.isSelectable = false
            field.alignment = .center
            field.wantsLayer = true
            field.layer?.cornerRadius = 6
            field.layer?.masksToBounds = true
            view.addSubview(field)
            NSLayoutConstraint.activate([
                field.centerXAnchor.constraint(equalTo: view.centerXAnchor),
                field.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -24),
                field.heightAnchor.constraint(equalToConstant: 28),
                field.widthAnchor.constraint(greaterThanOrEqualToConstant: 220)
            ])
            bookmarkFlashLabel = field
        }
        field.stringValue = "   Added: \(label)   "
        field.isHidden = false
        bookmarkFlashTimer?.invalidate()
        bookmarkFlashTimer = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: false) { [weak self] _ in
            self?.bookmarkFlashLabel?.isHidden = true
        }
    }

    @objc private func speedChanged() {
        store.dispatch(.setSpeed(speedSlider.doubleValue))
    }
    @objc private func positionChanged() { store.dispatch(.setPosition(positionSlider.doubleValue)) }
    @objc private func fontSizeChanged() { store.dispatch(.setFontSize(fontSizeSlider.doubleValue)) }
    @objc private func mirrorToggled() { store.dispatch(.setMirror(mirrorCheckbox.state == .on)) }
    @objc private func flipToggled() { store.dispatch(.setFlip(flipCheckbox.state == .on)) }

    func textDidChange(_ notification: Notification) {
        guard let active = store.state.activeScript else { return }
        let content = editorTextView.string
        suppressEditorUpdate = true
        store.dispatch(.scriptSetContent(id: active.id, content: content))
        suppressEditorUpdate = false
    }
}

private func sectionHeader(_ title: String) -> NSTextField {
    let label = NSTextField(labelWithString: title.uppercased())
    label.font = NSFont.systemFont(ofSize: 10, weight: .semibold)
    label.textColor = NSColor(white: 0.55, alpha: 1)
    return label
}

private func spacer(_ height: CGFloat) -> NSView {
    let v = NSView()
    v.translatesAutoresizingMaskIntoConstraints = false
    v.heightAnchor.constraint(equalToConstant: height).isActive = true
    return v
}
