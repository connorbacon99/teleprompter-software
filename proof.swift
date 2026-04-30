import Cocoa
import QuartzCore

// Smoothness proof: a single window with a long block of text scrolling smoothly
// via Core Animation (CABasicAnimation). If this is buttery smooth on this Mac,
// native AppKit + Core Animation is the right path for the rebuild.
//
// Press Space to toggle play/pause.
// Press R to reset to start.
// Press Esc / Cmd+Q to quit.

final class ScrollView: NSView {
    let textLayer = CATextLayer()
    private var paused = false
    private var pausedTime: CFTimeInterval = 0

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        layer?.backgroundColor = NSColor.black.cgColor

        let lines = (1...80)
            .map { "Line \($0)  —  The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog." }
            .joined(separator: "\n\n")
        textLayer.string = lines
        textLayer.fontSize = 48
        textLayer.foregroundColor = NSColor.white.cgColor
        textLayer.alignmentMode = .center
        textLayer.isWrapped = true
        textLayer.contentsScale = NSScreen.main?.backingScaleFactor ?? 2.0
        textLayer.frame = CGRect(x: 40, y: 0, width: frameRect.width - 80, height: 8000)
        layer?.addSublayer(textLayer)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func layout() {
        super.layout()
        textLayer.frame = CGRect(x: 40, y: textLayer.frame.origin.y, width: bounds.width - 80, height: 8000)
        textLayer.contentsScale = window?.backingScaleFactor ?? 2.0
    }

    func startScroll() {
        textLayer.removeAnimation(forKey: "scroll")
        let anim = CABasicAnimation(keyPath: "position.y")
        anim.fromValue = -bounds.height * 0.5
        anim.toValue = textLayer.frame.height + bounds.height * 0.5
        anim.duration = 90.0
        anim.timingFunction = CAMediaTimingFunction(name: .linear)
        anim.fillMode = .forwards
        anim.isRemovedOnCompletion = false
        textLayer.add(anim, forKey: "scroll")
        paused = false
    }

    func togglePause() {
        guard let layer = textLayer.presentation()?.superlayer ?? textLayer.superlayer else { return }
        if paused {
            let pausedTimeNow = textLayer.timeOffset
            textLayer.speed = 1.0
            textLayer.timeOffset = 0.0
            textLayer.beginTime = 0.0
            let timeSincePause = layer.convertTime(CACurrentMediaTime(), from: nil) - pausedTimeNow
            textLayer.beginTime = timeSincePause
            paused = false
        } else {
            let pausedTimeNow = layer.convertTime(CACurrentMediaTime(), from: nil)
            textLayer.speed = 0.0
            textLayer.timeOffset = pausedTimeNow
            paused = true
        }
    }

    func reset() {
        textLayer.speed = 1.0
        textLayer.timeOffset = 0.0
        textLayer.beginTime = 0.0
        startScroll()
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    var scrollView: ScrollView!

    func applicationDidFinishLaunching(_ notification: Notification) {
        let frame = NSRect(x: 200, y: 200, width: 1100, height: 700)
        window = NSWindow(
            contentRect: frame,
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Native Smoothness Proof"
        window.backgroundColor = .black

        scrollView = ScrollView(frame: frame)
        window.contentView = scrollView

        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        scrollView.startScroll()

        NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self = self else { return event }
            if event.keyCode == 49 { // Space
                self.scrollView.togglePause()
                return nil
            } else if event.charactersIgnoringModifiers?.lowercased() == "r" {
                self.scrollView.reset()
                return nil
            } else if event.keyCode == 53 { // Esc
                NSApp.terminate(nil)
                return nil
            }
            return event
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
