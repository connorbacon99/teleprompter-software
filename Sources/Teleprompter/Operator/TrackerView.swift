import Cocoa
import QuartzCore

/// Recording-session tracker. Operator starts a (countdown-then-)timer at the
/// moment they hit record on the camera, then logs entries as the instructor
/// fumbles or restarts. Each entry captures the elapsed time, the paragraph
/// the instructor is on (auto-filled from the active script + current scroll
/// position, then editable), and a free-text note. Exports the log as CSV.
///
/// All recording session state (timer, countdown) lives locally in this view —
/// it doesn't touch the store or the rendering pipeline. Log entries persist
/// per-script in `Script.recordingLog`.
final class TrackerView: NSView, NSTableViewDataSource, NSTableViewDelegate {
    private let store: Store
    private let engine: PlaybackEngine
    private var subscriptionToken: UUID?

    private var entries: [RecordingLogEntry] = []
    private var activeScriptId: UUID?
    private var activeScriptName: String = ""
    private var activeScriptContent: String = ""

    /// Recording session state. Three phases:
    /// - `idle`: timer at 0:00, nothing scheduled.
    /// - `running(start)`: timer is live. `start` is the CACurrentMediaTime at
    ///   which elapsed=0, so during the countdown `start` is in the future
    ///   (and `now - start` is negative — that's how the display knows to show
    ///   the countdown counter).
    /// - `paused(elapsed)`: timer frozen at this many seconds. Resume sets
    ///   `start = now - elapsed` so elapsed continues from where it left off.
    private enum RecState {
        case idle
        case running(start: TimeInterval)
        case paused(elapsed: TimeInterval)
    }
    private var rec: RecState = .idle
    private var tickTimer: Timer?
    private var countdownSecondsConfig: Int = 3

    // UI elements.
    private let startStopButton = NSButton(title: "Start", target: nil, action: nil)
    private let resetButton = NSButton(title: "Reset", target: nil, action: nil)
    private let logButton = NSButton(title: "Log line", target: nil, action: nil)
    private let countdownStepper = NSStepper()
    private let countdownLabel = NSTextField(labelWithString: "Countdown: 3 s")
    private let timerLabel = NSTextField(labelWithString: "0:00")
    private let statusLabel = NSTextField(labelWithString: "Idle")
    private let exportButton = NSButton(title: "Export CSV…", target: nil, action: nil)
    private let clearButton = NSButton(title: "Clear log", target: nil, action: nil)
    private let tableView = NSTableView()
    private let tableScroll = NSScrollView()

    init(store: Store, engine: PlaybackEngine) {
        self.store = store
        self.engine = engine
        super.init(frame: .zero)
        wantsLayer = true
        layer?.backgroundColor = NSColor(white: 0.06, alpha: 1).cgColor
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
        startStopButton.bezelStyle = .rounded
        startStopButton.target = self
        startStopButton.action = #selector(startStopAction)

        resetButton.bezelStyle = .rounded
        resetButton.target = self
        resetButton.action = #selector(resetAction)

        logButton.bezelStyle = .rounded
        logButton.target = self
        logButton.action = #selector(logAction)
        logButton.keyEquivalent = "l"
        logButton.keyEquivalentModifierMask = []

        countdownStepper.minValue = 0
        countdownStepper.maxValue = 30
        countdownStepper.integerValue = countdownSecondsConfig
        countdownStepper.target = self
        countdownStepper.action = #selector(countdownChanged)

        countdownLabel.textColor = NSColor(white: 0.78, alpha: 1)
        countdownLabel.font = NSFont.systemFont(ofSize: 12)

        timerLabel.font = NSFont.monospacedDigitSystemFont(ofSize: 48, weight: .medium)
        timerLabel.textColor = .white
        timerLabel.alignment = .center

        statusLabel.textColor = NSColor(white: 0.6, alpha: 1)
        statusLabel.font = NSFont.systemFont(ofSize: 11)
        statusLabel.alignment = .center

        exportButton.bezelStyle = .rounded
        exportButton.target = self
        exportButton.action = #selector(exportAction)

        clearButton.bezelStyle = .rounded
        clearButton.target = self
        clearButton.action = #selector(clearAction)

        // Table columns.
        let timeCol = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("time"))
        timeCol.title = "Time"
        timeCol.width = 70
        timeCol.minWidth = 60
        timeCol.maxWidth = 100
        tableView.addTableColumn(timeCol)

        let kindCol = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("kind"))
        kindCol.title = "Kind"
        kindCol.width = 100
        kindCol.minWidth = 90
        kindCol.maxWidth = 140
        tableView.addTableColumn(kindCol)

        let lineCol = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("line"))
        lineCol.title = "Line"
        lineCol.width = 360
        lineCol.minWidth = 200
        tableView.addTableColumn(lineCol)

        let noteCol = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("note"))
        noteCol.title = "Note"
        noteCol.width = 180
        noteCol.minWidth = 100
        tableView.addTableColumn(noteCol)

        tableView.dataSource = self
        tableView.delegate = self
        tableView.usesAlternatingRowBackgroundColors = false
        tableView.gridStyleMask = [.solidHorizontalGridLineMask]
        tableView.gridColor = NSColor(white: 0.18, alpha: 1)
        tableView.backgroundColor = NSColor(white: 0.08, alpha: 1)
        tableView.headerView?.wantsLayer = true
        tableView.rowHeight = 24
        tableView.allowsMultipleSelection = false

        tableScroll.documentView = tableView
        tableScroll.hasVerticalScroller = true
        tableScroll.borderType = .noBorder
        tableScroll.drawsBackground = true
        tableScroll.backgroundColor = NSColor(white: 0.08, alpha: 1)

        // Top-bar row: start/stop, reset, log, countdown stepper, status text.
        let topRow = NSStackView(views: [startStopButton, resetButton, logButton])
        topRow.orientation = .horizontal
        topRow.spacing = 8

        let countdownRow = NSStackView(views: [countdownLabel, countdownStepper])
        countdownRow.orientation = .horizontal
        countdownRow.spacing = 6

        let footerRow = NSStackView(views: [clearButton, NSView(), exportButton])
        footerRow.orientation = .horizontal
        footerRow.spacing = 8
        footerRow.distribution = .fill

        let stack = NSStackView(views: [
            topRow,
            countdownRow,
            timerLabel,
            statusLabel,
            tableScroll,
            footerRow
        ])
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 8
        stack.edgeInsets = NSEdgeInsets(top: 14, left: 16, bottom: 14, right: 16)
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)

        tableScroll.translatesAutoresizingMaskIntoConstraints = false
        timerLabel.translatesAutoresizingMaskIntoConstraints = false
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        footerRow.translatesAutoresizingMaskIntoConstraints = false

        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: topAnchor),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor),

            timerLabel.leadingAnchor.constraint(equalTo: stack.leadingAnchor, constant: 16),
            timerLabel.trailingAnchor.constraint(equalTo: stack.trailingAnchor, constant: -16),
            statusLabel.leadingAnchor.constraint(equalTo: stack.leadingAnchor, constant: 16),
            statusLabel.trailingAnchor.constraint(equalTo: stack.trailingAnchor, constant: -16),
            tableScroll.leadingAnchor.constraint(equalTo: stack.leadingAnchor, constant: 16),
            tableScroll.trailingAnchor.constraint(equalTo: stack.trailingAnchor, constant: -16),
            tableScroll.heightAnchor.constraint(greaterThanOrEqualToConstant: 240),
            footerRow.leadingAnchor.constraint(equalTo: stack.leadingAnchor, constant: 16),
            footerRow.trailingAnchor.constraint(equalTo: stack.trailingAnchor, constant: -16)
        ])

        updateCountdownLabel()
        updateTimerDisplay()
        updateStartStopButton()
    }

    // MARK: - State sync

    private func applyState(_ state: AppState) {
        activeScriptId = state.activeScriptId
        activeScriptName = state.activeScript?.name ?? ""
        activeScriptContent = state.activeScript?.content ?? ""
        let newEntries = state.activeScript?.recordingLog ?? []
        if newEntries != entries {
            entries = newEntries
            tableView.reloadData()
        }
    }

    // MARK: - Timer

    private func startTickTimer() {
        tickTimer?.invalidate()
        tickTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            self?.updateTimerDisplay()
        }
    }

    /// Returns elapsed seconds since recording started, or `nil` if idle.
    /// Negative values indicate countdown (e.g. -2.4 → 2.4 s remaining).
    private func currentElapsedSeconds() -> Double? {
        switch rec {
        case .idle: return nil
        case .running(let start): return CACurrentMediaTime() - start
        case .paused(let elapsed): return elapsed
        }
    }

    private func updateTimerDisplay() {
        guard let elapsed = currentElapsedSeconds() else {
            timerLabel.stringValue = "0:00"
            statusLabel.stringValue = "Idle"
            timerLabel.textColor = .white
            return
        }
        if elapsed < 0 {
            // Counting down — show seconds remaining as a big "3 / 2 / 1".
            let remaining = max(0, Int(ceil(-elapsed)))
            timerLabel.stringValue = remaining > 0 ? "\(remaining)" : "0:00"
            statusLabel.stringValue = "Countdown — start camera now"
            timerLabel.textColor = NSColor.systemYellow
        } else {
            let total = Int(elapsed.rounded(.down))
            let mins = total / 60
            let secs = total % 60
            timerLabel.stringValue = String(format: "%d:%02d", mins, secs)
            switch rec {
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
        switch rec {
        case .idle: startStopButton.title = "Start"
        case .running(let start) where CACurrentMediaTime() < start: startStopButton.title = "Cancel"
        case .running: startStopButton.title = "Pause"
        case .paused: startStopButton.title = "Resume"
        }
    }

    private func updateCountdownLabel() {
        countdownLabel.stringValue = "Countdown: \(countdownSecondsConfig) s"
    }

    // MARK: - Actions

    @objc private func startStopAction() {
        let now = CACurrentMediaTime()
        switch rec {
        case .idle:
            let countdown = TimeInterval(max(0, countdownSecondsConfig))
            rec = .running(start: now + countdown)
        case .running(let start) where now < start:
            // Mid-countdown — cancel back to idle, no time captured.
            rec = .idle
        case .running(let start):
            // Active recording — pause, preserving elapsed.
            rec = .paused(elapsed: now - start)
        case .paused(let elapsed):
            // Resume from paused position. No new countdown.
            rec = .running(start: now - elapsed)
        }
        updateStartStopButton()
        updateTimerDisplay()
    }

    @objc private func resetAction() {
        // Reset is destructive — confirm if a session is in progress.
        let needsConfirm: Bool = {
            switch rec {
            case .idle: return false
            default: return true
            }
        }()
        guard needsConfirm else {
            rec = .idle
            updateStartStopButton()
            updateTimerDisplay()
            return
        }
        let alert = NSAlert()
        alert.messageText = "Reset timer?"
        alert.informativeText = "This zeroes the recording timer. Logged entries are kept — only the elapsed time goes back to 0:00."
        alert.alertStyle = .warning
        alert.addButton(withTitle: "Reset")
        alert.addButton(withTitle: "Cancel")
        let confirm: () -> Void = { [weak self] in
            self?.rec = .idle
            self?.updateStartStopButton()
            self?.updateTimerDisplay()
        }
        if let win = window {
            alert.beginSheetModal(for: win) { response in
                if response == .alertFirstButtonReturn { confirm() }
            }
        } else if alert.runModal() == .alertFirstButtonReturn {
            confirm()
        }
    }

    @objc private func countdownChanged() {
        countdownSecondsConfig = countdownStepper.integerValue
        updateCountdownLabel()
    }

    @objc private func logAction() {
        guard let scriptId = activeScriptId else { return }
        let elapsed = max(0, currentElapsedSeconds() ?? 0)
        let line = paragraphAtCurrentScrollPosition()
        let entry = RecordingLogEntry(id: UUID(), timeSeconds: elapsed, line: line, note: "", wallclock: Date())
        store.dispatch(.recordingLogAdd(scriptId: scriptId, entry: entry))
        // Scroll to the new row so the operator can immediately see it.
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            let row = self.entries.count - 1
            if row >= 0 {
                self.tableView.scrollRowToVisible(row)
            }
        }
    }

    @objc private func clearAction() {
        guard let scriptId = activeScriptId, !entries.isEmpty else { return }
        let alert = NSAlert()
        alert.messageText = "Clear recording log?"
        alert.informativeText = "This deletes all \(entries.count) entries for the active module. Cannot be undone."
        alert.alertStyle = .warning
        alert.addButton(withTitle: "Clear")
        alert.addButton(withTitle: "Cancel")
        if let win = window {
            alert.beginSheetModal(for: win) { [weak self] response in
                if response == .alertFirstButtonReturn {
                    self?.store.dispatch(.recordingLogClear(scriptId: scriptId))
                }
            }
        } else if alert.runModal() == .alertFirstButtonReturn {
            store.dispatch(.recordingLogClear(scriptId: scriptId))
        }
    }

    @objc private func exportAction() {
        guard !entries.isEmpty else { return }
        let panel = NSSavePanel()
        panel.allowedFileTypes = ["csv"]
        let scriptName = store.state.activeScript?.name ?? "recording"
        panel.nameFieldStringValue = "\(scriptName) - recording log.csv"
        panel.message = "Export the recording log as CSV."
        let writeCSV: (URL) -> Void = { [weak self] url in
            guard let self = self else { return }
            let csv = self.csvText(for: self.entries, moduleName: self.activeScriptName)
            do {
                try csv.write(to: url, atomically: true, encoding: .utf8)
            } catch {
                let err = NSAlert(error: error)
                err.runModal()
            }
        }
        if let win = window {
            panel.beginSheetModal(for: win) { response in
                guard response == .OK, let url = panel.url else { return }
                writeCSV(url)
            }
        } else {
            guard panel.runModal() == .OK, let url = panel.url else { return }
            writeCSV(url)
        }
    }

    // MARK: - Helpers

    /// Picks the paragraph at the engine's current scroll percent, weighted by
    /// character count so long paragraphs span proportionally more of the
    /// scroll. Approximate but matches what the operator would see at the
    /// reading-line indicator closely enough for v1; a future click-to-
    /// highlight pass will replace this with an exact y-to-character mapping.
    private func paragraphAtCurrentScrollPosition() -> String {
        let percent = max(0, min(1, engine.currentPosition))
        let paragraphs = activeScriptContent
            .components(separatedBy: "\n")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        guard !paragraphs.isEmpty else { return "" }
        let totalChars = paragraphs.reduce(0) { $0 + $1.count }
        if totalChars == 0 { return paragraphs[0] }
        let target = Double(totalChars) * percent
        var cumulative = 0
        for p in paragraphs {
            cumulative += p.count
            if Double(cumulative) >= target { return p }
        }
        return paragraphs.last ?? ""
    }

    static func csvText(for entries: [RecordingLogEntry], moduleName: String) -> String {
        var lines: [String] = ["Module,Time,Wallclock,Kind,Line,Note"]
        for e in entries {
            lines.append([
                csvField(moduleName),
                csvTime(e.timeSeconds),
                csvField(csvWallclock(e.wallclock)),
                csvField(kindTitle(e.kind)),
                csvField(e.line),
                csvField(e.note)
            ].joined(separator: ","))
        }
        return lines.joined(separator: "\n") + "\n"
    }

    private func csvText(for entries: [RecordingLogEntry], moduleName: String) -> String {
        return Self.csvText(for: entries, moduleName: moduleName)
    }

    private static func csvTime(_ seconds: Double) -> String {
        let total = Int(seconds.rounded(.down))
        return String(format: "%d:%02d", total / 60, total % 60)
    }

    /// ISO-8601 (UTC, "Z") rendering of an entry's wallclock. Legacy entries
    /// without a wallclock decode as `.distantPast` — we render those as the
    /// empty string so editors don't see year-0001 timestamps in the CSV.
    static func csvWallclock(_ date: Date) -> String {
        if date == .distantPast { return "" }
        return iso8601Formatter.string(from: date)
    }

    private static let iso8601Formatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    private static func csvField(_ value: String) -> String {
        if value.contains(",") || value.contains("\"") || value.contains("\n") {
            return "\"\(value.replacingOccurrences(of: "\"", with: "\"\""))\""
        }
        return value
    }

    // MARK: - NSTableViewDataSource / NSTableViewDelegate

    func numberOfRows(in tableView: NSTableView) -> Int {
        return entries.count
    }

    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        guard row < entries.count, let column = tableColumn else { return nil }
        let entry = entries[row]
        let cell = NSTableCellView()

        if column.identifier.rawValue == "kind" {
            let popup = NSPopUpButton(frame: .zero, pullsDown: false)
            popup.translatesAutoresizingMaskIntoConstraints = false
            popup.bezelStyle = .roundRect
            popup.isBordered = true
            popup.font = NSFont.systemFont(ofSize: 11)
            for k in EntryKind.allCases {
                popup.addItem(withTitle: Self.kindTitle(k))
                popup.lastItem?.representedObject = k.rawValue
            }
            if let idx = EntryKind.allCases.firstIndex(of: entry.kind) {
                popup.selectItem(at: idx)
            }
            popup.identifier = NSUserInterfaceItemIdentifier("kind:\(entry.id.uuidString)")
            popup.target = self
            popup.action = #selector(kindPopupChanged(_:))
            cell.addSubview(popup)
            NSLayoutConstraint.activate([
                popup.leadingAnchor.constraint(equalTo: cell.leadingAnchor, constant: 2),
                popup.trailingAnchor.constraint(equalTo: cell.trailingAnchor, constant: -2),
                popup.centerYAnchor.constraint(equalTo: cell.centerYAnchor)
            ])
            return cell
        }

        let field = NSTextField()
        field.translatesAutoresizingMaskIntoConstraints = false
        field.isBordered = false
        field.drawsBackground = false
        field.textColor = NSColor(white: 0.92, alpha: 1)
        field.font = NSFont.systemFont(ofSize: 12)
        switch column.identifier.rawValue {
        case "time":
            field.isEditable = false
            field.isSelectable = true
            field.stringValue = Self.csvTime(entry.timeSeconds)
        case "line":
            field.isEditable = true
            field.delegate = self
            field.stringValue = entry.line
            field.identifier = NSUserInterfaceItemIdentifier("line:\(entry.id.uuidString)")
        case "note":
            field.isEditable = true
            field.delegate = self
            field.stringValue = entry.note
            field.identifier = NSUserInterfaceItemIdentifier("note:\(entry.id.uuidString)")
        default:
            field.stringValue = ""
        }
        cell.addSubview(field)
        cell.textField = field
        NSLayoutConstraint.activate([
            field.leadingAnchor.constraint(equalTo: cell.leadingAnchor, constant: 4),
            field.trailingAnchor.constraint(equalTo: cell.trailingAnchor, constant: -4),
            field.centerYAnchor.constraint(equalTo: cell.centerYAnchor)
        ])
        return cell
    }

    @objc private func kindPopupChanged(_ sender: NSPopUpButton) {
        guard let scriptId = activeScriptId,
              let identifier = sender.identifier?.rawValue else { return }
        let parts = identifier.split(separator: ":", maxSplits: 1).map(String.init)
        guard parts.count == 2,
              parts[0] == "kind",
              let entryId = UUID(uuidString: parts[1]),
              let raw = sender.selectedItem?.representedObject as? String,
              let kind = EntryKind(rawValue: raw) else { return }
        store.dispatch(.recordingLogSetKind(scriptId: scriptId, entryId: entryId, kind: kind))
    }

    static func kindTitle(_ kind: EntryKind) -> String {
        switch kind {
        case .flub: return "Flub"
        case .clean: return "Clean"
        case .chapter: return "Chapter"
        case .retake: return "Retake"
        case .note: return "Note"
        }
    }
}

// MARK: - Inline editing

extension TrackerView: NSTextFieldDelegate {
    func controlTextDidEndEditing(_ obj: Notification) {
        guard let scriptId = activeScriptId,
              let field = obj.object as? NSTextField,
              let identifier = field.identifier?.rawValue else { return }
        let parts = identifier.split(separator: ":", maxSplits: 1).map(String.init)
        guard parts.count == 2,
              let entryId = UUID(uuidString: parts[1]) else { return }
        let value = field.stringValue
        switch parts[0] {
        case "line":
            store.dispatch(.recordingLogUpdateLine(scriptId: scriptId, entryId: entryId, line: value))
        case "note":
            store.dispatch(.recordingLogUpdateNote(scriptId: scriptId, entryId: entryId, note: value))
        default:
            break
        }
    }
}
