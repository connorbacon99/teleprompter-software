import Cocoa

private final class TabButton: NSButton {
    var scriptId: UUID = UUID()
    var onClick: (() -> Void)?
    var onRename: (() -> Void)?

    init(title: String, active: Bool) {
        super.init(frame: .zero)
        self.title = title
        self.bezelStyle = .recessed
        self.setButtonType(.pushOnPushOff)
        self.state = active ? .on : .off
        self.target = self
        self.action = #selector(performAction)

        let menu = NSMenu()
        let rename = NSMenuItem(title: "Rename…", action: #selector(menuRename), keyEquivalent: "")
        rename.target = self
        menu.addItem(rename)
        self.menu = menu
    }

    required init?(coder: NSCoder) { fatalError() }

    @objc private func performAction() { onClick?() }
    @objc private func menuRename() { onRename?() }
}

final class ScriptTabBar: NSView {
    private let store: Store
    private var subscriptionToken: UUID?
    private let stackView = NSStackView()

    init(store: Store) {
        self.store = store
        super.init(frame: .zero)
        wantsLayer = true
        layer?.backgroundColor = NSColor(white: 0.08, alpha: 1).cgColor

        stackView.orientation = .horizontal
        stackView.spacing = 4
        stackView.alignment = .centerY
        stackView.edgeInsets = NSEdgeInsets(top: 6, left: 12, bottom: 6, right: 12)
        stackView.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stackView)

        NSLayoutConstraint.activate([
            stackView.topAnchor.constraint(equalTo: topAnchor),
            stackView.leadingAnchor.constraint(equalTo: leadingAnchor),
            stackView.bottomAnchor.constraint(equalTo: bottomAnchor),
            stackView.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor)
        ])

        subscriptionToken = store.subscribe { [weak self] state in
            self?.applyState(state)
        }
    }

    required init?(coder: NSCoder) { fatalError() }

    deinit {
        if let token = subscriptionToken { store.unsubscribe(token) }
    }

    private func applyState(_ state: AppState) {
        stackView.arrangedSubviews.forEach { $0.removeFromSuperview() }

        for script in state.scripts {
            let active = script.id == state.activeScriptId
            let pair = NSStackView()
            pair.orientation = .horizontal
            pair.spacing = 0

            let tab = TabButton(title: script.name.isEmpty ? "Untitled" : script.name, active: active)
            tab.scriptId = script.id
            tab.onClick = { [weak self] in
                self?.store.dispatch(.scriptSetActive(id: script.id))
            }
            tab.onRename = { [weak self] in
                self?.promptRename(scriptId: script.id, currentName: script.name)
            }
            pair.addArrangedSubview(tab)

            if state.scripts.count > 1 {
                let close = NSButton(title: "×", target: nil, action: nil)
                close.bezelStyle = .recessed
                close.font = NSFont.systemFont(ofSize: 11, weight: .bold)
                close.target = self
                close.action = #selector(removeScriptAction(_:))
                close.identifier = NSUserInterfaceItemIdentifier(script.id.uuidString)
                pair.addArrangedSubview(close)
            }

            stackView.addArrangedSubview(pair)
        }

        let add = NSButton(title: "+ Module", target: self, action: #selector(addScriptAction))
        add.bezelStyle = .recessed
        stackView.addArrangedSubview(add)
    }

    @objc private func addScriptAction() {
        let count = store.state.scripts.count + 1
        store.dispatch(.scriptAdd(name: "Module \(count)", content: ""))
    }

    @objc private func removeScriptAction(_ sender: NSButton) {
        guard let raw = sender.identifier?.rawValue, let id = UUID(uuidString: raw) else { return }
        store.dispatch(.scriptRemove(id: id))
    }

    private func promptRename(scriptId: UUID, currentName: String) {
        let alert = NSAlert()
        alert.messageText = "Rename module"
        alert.informativeText = "Enter a new name."
        alert.addButton(withTitle: "Save")
        alert.addButton(withTitle: "Cancel")

        let field = NSTextField(string: currentName)
        field.frame = NSRect(x: 0, y: 0, width: 240, height: 24)
        alert.accessoryView = field

        if let win = window {
            alert.beginSheetModal(for: win) { [weak self] response in
                guard response == .alertFirstButtonReturn else { return }
                let name = field.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !name.isEmpty else { return }
                self?.store.dispatch(.scriptRename(id: scriptId, name: name))
            }
        }
    }
}
