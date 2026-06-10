import Cocoa
import QuartzCore

/// Compact recording-tracker HUD that docks beneath the Monitor preview in
/// the operator window. Shares timer state with `TrackerView` via the Store,
/// so starting/pausing the timer here keeps the Tracker tab in sync (and
/// vice versa). Exists so the operator can log flubs/cleans/chapters/retakes
/// while still watching the Monitor preview — no more tab-switching mid
/// recording.
final class TrackerHUDView: NSView {
    private let store: Store
    private let engine: PlaybackEngine
    private var subscriptionToken: UUID?
    private var tickTimer: Timer?

    private var recordingTimer: RecordingTimer = .initial()
    private var lastEntry: RecordingLogEntry?

    private let timerLabel = NSTextField(labelWithString: "0:00")
    private let statusLabel = NSTextField(labelWithString: "Idle")
    private let startStopButton = NSButton(title: "Start", target: nil, action: nil)
    private let resetButton = NSButton(title: "Reset", target: nil, action: nil)
    private let lastEntryLabel = NSTextField(labelWithString: "")

    // Per-kind log buttons. Order mirrors the most-common-first ergonomic the
    // operator hits during a recording: flub > clean > retake > chapter > note.
    private let flubButton = NSButton(title: "Flub", target: nil, action: nil)
    private let cleanButton = NSButton(title: "Clean", target: nil, action: nil)
    private let retakeButton = NSButton(title: "Retake", target: nil, action: nil)
    private let chapterButton = NSButton(title: "Chapter", target: nil, action: nil)
    private let noteButton = NSButton(title: "Note", target: nil, action: nil)

    init(store: Store, engine: PlaybackEngine) {
        self.store = store
        self.engine = engine
        super.init(frame: .zero)
        wantsLayer = true
        layer?.backgroundColor = NSColor(white: 0.09, alpha: 1).cgColor
        buildUI()
        subscriptionToken = store.subscribe { [weak self] state in
            self?.applyState(state)
        }
        startTickTimer()
    }

    required init?(coder: NSCoder) { fatalError() }

    deinit {
        tickTimer?.invalidate()
        if let token = subscriptionToken { store.unsubscribe(token) }
    }

    // MARK: - Layout

    private func buildUI() {
        timerLabel.font = NSFont.monospacedDigitSystemFont(ofSize: 26, weight: .medium)
        timerLabel.textColor = .white
        timerLabel.alignment = .left

        statusLabel.textColor = NSColor(white: 0.6, alpha: 1)
        statusLabel.font = NSFont.systemFont(ofSize: 11)
        statusLabel.alignment = .left

        for btn in [startStopButton, resetButton, flubButton, cleanButton, retakeButton, chapterButton, noteButton] {
            btn.bezelStyle = .rounded
            btn.target = self
        }
        startStopButton.action = #selector(startStopAction)
        resetButton.action = #selector(resetAction)
        flubButton.action = #selector(logFlub)
        cleanButton.action = #selector(logClean)
        retakeButton.action = #selector(logRetake)
        chapterButton.action = #selector(logChapter)
        noteButton.action = #selector(logNote)

        let timerStack = NSStackView(views: [timerLabel, statusLabel])
        timerStack.orientation = .vertical
        timerStack.alignment = .leading
        timerStack.spacing = 0

        let timerControls = NSStackView(views: [startStopButton, resetButton])
        timerControls.orientation = .horizontal
        timerControls.spacing = 6

        let logControls = NSStackView(views: [flubButton, cleanButton, retakeButton, chapterButton, noteButton])
        logControls.orientation = .horizontal
        logControls.spacing = 6

        let separator = NSBox()
        separator.boxType = .separator
        separator.translatesAutoresizingMaskIntoConstraints = false

        let topRow = NSStackView(views: [timerStack, timerControls, separator, logControls])
        topRow.orientation = .horizontal
        topRow.spacing = 12
        topRow.alignment = .centerY
        topRow.translatesAutoresizingMaskIntoConstraints = false

        lastEntryLabel.textColor = NSColor(white: 0.55, alpha: 1)
        lastEntryLabel.font = NSFont.systemFont(ofSize: 11)
        lastEntryLabel.lineBreakMode = .byTruncatingTail
        lastEntryLabel.maximumNumberOfLines = 1
        lastEntryLabel.translatesAutoresizingMaskIntoConstraints = false

        let topSeparator = NSBox()
        topSeparator.boxType = .separator
        topSeparator.translatesAutoresizingMaskIntoConstraints = false

        addSubview(topSeparator)
        addSubview(topRow)
        addSubview(lastEntryLabel)

        NSLayoutConstraint.activate([
            topSeparator.topAnchor.constraint(equalTo: topAnchor),
            topSeparator.leadingAnchor.constraint(equalTo: leadingAnchor),
            topSeparator.trailingAnchor.constraint(equalTo: trailingAnchor),
            topSeparator.heightAnchor.constraint(equalToConstant: 1),

            topRow.topAnchor.constraint(equalTo: topSeparator.bottomAnchor, constant: 8),
            topRow.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
            topRow.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -16),

            separator.widthAnchor.constraint(equalToConstant: 1),
            separator.heightAnchor.constraint(equalToConstant: 28),

            lastEntryLabel.topAnchor.constraint(equalTo: topRow.bottomAnchor, constant: 6),
            lastEntryLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
            lastEntryLabel.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -16),
            lastEntryLabel.bottomAnchor.constraint(lessThanOrEqualTo: bottomAnchor, constant: -8)
        ])

        updateTimerDisplay()
        updateStartStopButton()
        updateLastEntryLabel()
    }

    // MARK: - State sync

    private func applyState(_ state: AppState) {
        if recordingTimer != state.recordingTimer {
            recordingTimer = state.recordingTimer
            updateTimerDisplay()
            updateStartStopButton()
        }
        let newLast = state.activeScript?.recordingLog.last
        if newLast != lastEntry {
            lastEntry = newLast
            updateLastEntryLabel()
        }
    }

    private func startTickTimer() {
        tickTimer?.invalidate()
        tickTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            self?.updateTimerDisplay()
            self?.updateStartStopButton()
        }
    }

    private func updateTimerDisplay() {
        guard let elapsed = recordingTimer.elapsedSeconds(now: CACurrentMediaTime()) else {
            timerLabel.stringValue = "0:00"
            statusLabel.stringValue = "Idle"
            timerLabel.textColor = .white
            return
        }
        if elapsed < 0 {
            let remaining = max(0, Int(ceil(-elapsed)))
            timerLabel.stringValue = remaining > 0 ? "\(remaining)" : "0:00"
            statusLabel.stringValue = "Countdown"
            timerLabel.textColor = NSColor.systemYellow
        } else {
            let total = Int(elapsed.rounded(.down))
            timerLabel.stringValue = String(format: "%d:%02d", total / 60, total % 60)
            switch recordingTimer.phase {
            case .paused:
                statusLabel.stringValue = "Paused"
                timerLabel.textColor = NSColor(white: 0.7, alpha: 1)
            default:
                statusLabel.stringValue = "Recording"
                timerLabel.textColor = .white
            }
        }
    }

    private func updateStartStopButton() {
        switch recordingTimer.phase {
        case .idle:
            startStopButton.title = "Start"
        case .running(let start) where CACurrentMediaTime() < start:
            startStopButton.title = "Cancel"
        case .running:
            startStopButton.title = "Pause"
        case .paused:
            startStopButton.title = "Resume"
        }
    }

    private func updateLastEntryLabel() {
        guard let entry = lastEntry else {
            lastEntryLabel.stringValue = "No entries yet"
            return
        }
        let mins = Int(entry.timeSeconds) / 60
        let secs = Int(entry.timeSeconds) % 60
        let timeStr = String(format: "%d:%02d", mins, secs)
        let truncatedLine = entry.line.prefix(60)
        let ellipsis = entry.line.count > 60 ? "…" : ""
        lastEntryLabel.stringValue = "Last: \(timeStr) — \(entry.kind.rawValue) — \(truncatedLine)\(ellipsis)"
    }

    // MARK: - Actions

    @objc private func startStopAction() {
        store.dispatch(.recToggle(now: CACurrentMediaTime()))
    }

    @objc private func resetAction() {
        // Same confirm flow as the Tracker tab; the session-divider logic
        // lives in the reducer so both surfaces behave identically.
        TrackerView.confirmTimerReset(store: store, window: window)
    }

    @objc private func logFlub() { logEntry(kind: .flub) }
    @objc private func logClean() { logEntry(kind: .clean) }
    @objc private func logRetake() { logEntry(kind: .retake) }
    @objc private func logChapter() { logEntry(kind: .chapter) }
    @objc private func logNote() { logEntry(kind: .note) }

    private func logEntry(kind: EntryKind) {
        let state = store.state
        guard let script = state.activeScript else { return }
        let elapsed: Double = {
            guard let e = recordingTimer.elapsedSeconds(now: CACurrentMediaTime()) else { return 0 }
            return max(0, e)
        }()
        let line = script.paragraph(atPosition: engine.currentPosition)
        let entry = RecordingLogEntry(
            id: UUID(),
            timeSeconds: elapsed,
            line: line,
            note: "",
            kind: kind,
            wallclock: Date()
        )
        store.dispatch(.recordingLogAdd(scriptId: script.id, entry: entry))
    }
}
