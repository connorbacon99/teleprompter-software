import Cocoa
import QuartzCore

/// Shared text+scroll renderer used by the fullscreen teleprompter window
/// and the in-operator monitor preview. Owns a `CATextLayer`, measures
/// content, and drives scrolling via `CABasicAnimation` on the compositor
/// thread (vsync-locked). Two instances driven by the same store + same
/// state transitions stay visually synced because they receive the same
/// animation parameters at the same media time.
final class ScrollingTextView: NSView {
    private let textLayer = CATextLayer()
    private let readingGuide = CALayer()
    private let leftTriangle = CAShapeLayer()
    private let rightTriangle = CAShapeLayer()
    private let gradientTop = CAGradientLayer()
    private let gradientBottom = CAGradientLayer()

    private(set) var cachedTextHeight: CGFloat = 0

    private var currentMirror = false
    private var currentFlip = false

    var horizontalPadding: CGFloat = 80
    var pixelsPerSecondAt1x: CGFloat = 80
    var showGuides: Bool = true {
        didSet { applyGuideVisibility() }
    }

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        commonInit()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        commonInit()
    }

    override var isFlipped: Bool { true }

    override func makeBackingLayer() -> CALayer {
        let layer = CALayer()
        layer.isGeometryFlipped = true
        return layer
    }

    private func commonInit() {
        wantsLayer = true
        layer?.backgroundColor = NSColor.black.cgColor
        layer?.masksToBounds = true

        textLayer.alignmentMode = .center
        textLayer.isWrapped = true
        textLayer.contentsScale = NSScreen.main?.backingScaleFactor ?? 2.0
        textLayer.anchorPoint = CGPoint(x: 0, y: 0)
        // Hard-disable implicit animations on the properties we drive each
        // frame. This prevents subtle layer-time-tree differences between
        // independently-created CATextLayers from producing different visual
        // states despite identical commanded values.
        textLayer.actions = [
            "transform": NSNull(),
            "position": NSNull(),
            "bounds": NSNull(),
            "frame": NSNull(),
            "contents": NSNull(),
            "string": NSNull()
        ]
        layer?.addSublayer(textLayer)

        // Reading guide line was visually distracting; the yellow triangles
        // serve the same purpose unambiguously.
        readingGuide.isHidden = true
        layer?.addSublayer(readingGuide)

        leftTriangle.fillColor = NSColor.systemYellow.cgColor
        rightTriangle.fillColor = NSColor.systemYellow.cgColor
        layer?.addSublayer(leftTriangle)
        layer?.addSublayer(rightTriangle)

        gradientTop.colors = [NSColor.black.withAlphaComponent(0.85).cgColor, NSColor.black.withAlphaComponent(0).cgColor]
        gradientTop.startPoint = CGPoint(x: 0.5, y: 0)
        gradientTop.endPoint = CGPoint(x: 0.5, y: 1)
        layer?.addSublayer(gradientTop)

        gradientBottom.colors = [NSColor.black.withAlphaComponent(0).cgColor, NSColor.black.withAlphaComponent(0.85).cgColor]
        gradientBottom.startPoint = CGPoint(x: 0.5, y: 0)
        gradientBottom.endPoint = CGPoint(x: 0.5, y: 1)
        layer?.addSublayer(gradientBottom)
    }

    override func layout() {
        super.layout()
        layoutDecorations()
        textLayer.contentsScale = window?.backingScaleFactor ?? 2.0
        // Re-apply mirror/flip with current bounds so the center pivot is
        // up-to-date if the window resized.
        applyMirrorFlipTransform()
    }

    private func layoutDecorations() {
        let b = bounds
        readingGuide.frame = CGRect(x: 0, y: b.height * 0.5 - 0.5, width: b.width, height: 1)
        gradientTop.frame = CGRect(x: 0, y: 0, width: b.width, height: b.height * 0.25)
        gradientBottom.frame = CGRect(x: 0, y: b.height * 0.75, width: b.width, height: b.height * 0.25)

        // Yellow reading-line indicators: triangles on each side pointing inward.
        let triangleSize: CGFloat = max(40, min(b.width, b.height) * 0.06)
        let cy = b.height * 0.5

        let leftPath = CGMutablePath()
        leftPath.move(to: CGPoint(x: 0, y: cy - triangleSize * 0.6))
        leftPath.addLine(to: CGPoint(x: triangleSize, y: cy))
        leftPath.addLine(to: CGPoint(x: 0, y: cy + triangleSize * 0.6))
        leftPath.closeSubpath()
        leftTriangle.path = leftPath

        let rightPath = CGMutablePath()
        rightPath.move(to: CGPoint(x: b.width, y: cy - triangleSize * 0.6))
        rightPath.addLine(to: CGPoint(x: b.width - triangleSize, y: cy))
        rightPath.addLine(to: CGPoint(x: b.width, y: cy + triangleSize * 0.6))
        rightPath.closeSubpath()
        rightTriangle.path = rightPath

        // Triangles bypass the gradient overlays' z-order so they stay visible.
        leftTriangle.zPosition = 5
        rightTriangle.zPosition = 5
    }

    private func applyGuideVisibility() {
        readingGuide.isHidden = !showGuides
        gradientTop.isHidden = !showGuides
        gradientBottom.isHidden = !showGuides
        leftTriangle.isHidden = !showGuides
        rightTriangle.isHidden = !showGuides
    }

    // MARK: - Public API

    func relayout(script: Script?, appearance: Appearance) {
        let baseFont = NSFont(name: appearance.fontFamily, size: CGFloat(appearance.fontSizePt))
            ?? NSFont.systemFont(ofSize: CGFloat(appearance.fontSizePt))

        let paragraph = NSMutableParagraphStyle()
        paragraph.alignment = .center
        paragraph.lineHeightMultiple = CGFloat(appearance.lineHeight)

        let attrs: [NSAttributedString.Key: Any] = [
            .font: baseFont,
            .foregroundColor: nsColor(fromHex: appearance.textColorHex),
            .paragraphStyle: paragraph
        ]
        let content = (script?.content.isEmpty ?? true) ? "— empty script —" : script!.content
        let attributed = NSAttributedString(string: content, attributes: attrs)

        let textWidth = max(1, bounds.width - horizontalPadding * 2)
        let measured = attributed.boundingRect(
            with: NSSize(width: textWidth, height: .greatestFiniteMagnitude),
            options: [.usesLineFragmentOrigin, .usesFontLeading]
        )
        let textHeight = max(1, ceil(measured.height))

        CATransaction.begin()
        CATransaction.setDisableActions(true)
        textLayer.string = attributed
        // Set bounds + position explicitly. Using frame= relied on CALayer's
        // frame setter, which on a geometryFlipped parent layer was producing
        // different position values for two equally-configured layers.
        textLayer.bounds = CGRect(x: 0, y: 0, width: textWidth, height: textHeight)
        textLayer.position = CGPoint(x: horizontalPadding, y: 0)
        cachedTextHeight = textHeight
        layer?.backgroundColor = nsColor(fromHex: appearance.bgColorHex).cgColor
        CATransaction.commit()
    }

    func applyMirrorFlip(_ appearance: Appearance) {
        currentMirror = appearance.mirror
        currentFlip = appearance.flip
        applyMirrorFlipTransform()
    }

    private func applyMirrorFlipTransform() {
        // Scale around the bounds center so the flipped content stays on screen.
        // CA uses row-vector convention (v' = v * M), and CATransform3DTranslate/
        // Scale produce t' = op * t — i.e. the newly-added op becomes the
        // INNERMOST (applied first to the vector). For a centered scale we want
        // M = T(-cx,-cy) * S * T(cx,cy), so we build it right-to-left: T(cx,cy)
        // first, then S, then T(-cx,-cy).
        let cx = bounds.width * 0.5
        let cy = bounds.height * 0.5
        let sx: CGFloat = currentMirror ? -1 : 1
        let sy: CGFloat = currentFlip ? -1 : 1
        var t = CATransform3DIdentity
        t = CATransform3DTranslate(t, cx, cy, 0)
        t = CATransform3DScale(t, sx, sy, 1)
        t = CATransform3DTranslate(t, -cx, -cy, 0)
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        layer?.sublayerTransform = t
        CATransaction.commit()
    }

    func ty(forPosition percent: Double) -> CGFloat {
        return bounds.height * 0.5 - cachedTextHeight * CGFloat(percent)
    }

    func applyStaticPosition(_ percent: Double) {
        textLayer.removeAnimation(forKey: "scroll")
        // Half-pixel snap on the y-translation prevents fractional sub-pixel
        // differences between layer instances on different displays.
        let tyValue = (ty(forPosition: percent) * 2).rounded() / 2
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        textLayer.transform = CATransform3DMakeTranslation(0, tyValue, 0)
        CATransaction.commit()
    }

    func startScrolling(
        from startPercent: Double,
        speed: Double,
        beginTime: TimeInterval? = nil,
        onFinish: @escaping () -> Void
    ) {
        guard cachedTextHeight > 0, bounds.height > 0 else { return }
        textLayer.removeAnimation(forKey: "scroll")

        let startTy = ty(forPosition: startPercent)
        let endTy = ty(forPosition: 1.0)
        applyStaticPosition(startPercent)

        let remaining = startTy - endTy
        guard remaining > 0 else { onFinish(); return }

        let duration = TimeInterval(remaining / (pixelsPerSecondAt1x * CGFloat(speed)))
        let animation = CABasicAnimation(keyPath: "transform.translation.y")
        animation.fromValue = startTy
        animation.toValue = endTy
        animation.duration = duration
        animation.timingFunction = CAMediaTimingFunction(name: .linear)
        animation.fillMode = .forwards
        animation.isRemovedOnCompletion = false
        // beginTime in the past makes CA render the animation already-partially-
        // elapsed when added — that's how a teleprompter VC added later catches
        // up to a monitor that has been animating since play began.
        if let bt = beginTime {
            animation.beginTime = bt
        }
        animation.delegate = AnimationFinishDelegate { finished in
            if finished { onFinish() }
        }
        textLayer.add(animation, forKey: "scroll")
    }

    func stopScrolling() {
        textLayer.removeAnimation(forKey: "scroll")
    }

    func hasActiveAnimation() -> Bool {
        return textLayer.animation(forKey: "scroll") != nil
    }

    func visualPosition() -> Double {
        guard cachedTextHeight > 0 else { return 0 }
        if let pres = textLayer.presentation() {
            let currentTy = pres.transform.m42
            let percent = (bounds.height * 0.5 - currentTy) / cachedTextHeight
            return max(0, min(1, Double(percent)))
        }
        let currentTy = textLayer.transform.m42
        let percent = (bounds.height * 0.5 - currentTy) / cachedTextHeight
        return max(0, min(1, Double(percent)))
    }
}

private final class AnimationFinishDelegate: NSObject, CAAnimationDelegate {
    let onFinish: (Bool) -> Void
    init(_ onFinish: @escaping (Bool) -> Void) { self.onFinish = onFinish }
    func animationDidStop(_ anim: CAAnimation, finished flag: Bool) { onFinish(flag) }
}

func nsColor(fromHex hex: String) -> NSColor {
    var s = hex
    if s.hasPrefix("#") { s.removeFirst() }
    guard s.count == 6, let value = UInt32(s, radix: 16) else { return .white }
    let r = CGFloat((value >> 16) & 0xff) / 255
    let g = CGFloat((value >> 8) & 0xff) / 255
    let b = CGFloat(value & 0xff) / 255
    return NSColor(srgbRed: r, green: g, blue: b, alpha: 1)
}
