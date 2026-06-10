import Cocoa
import QuartzCore

/// Shared text+scroll renderer used by the fullscreen teleprompter window
/// and the in-operator monitor preview. Owns the text page layers, measures
/// content, and renders whatever position it is given — it does NOT advance
/// the scroll itself. `PlaybackEngine` (CVDisplayLink-driven) is the single
/// scroll driver: each vsync it pushes the same position to every instance
/// via `applyStaticPosition(_:)` inside one CATransaction, so all surfaces
/// stay visually synced by construction.
final class ScrollingTextView: NSView {
    /// Container layer that owns all visible text. Animation drives this layer's
    /// transform, scrolling the entire script as one unit. We split the text
    /// into multiple stacked CATextLayer "pages" because a single CATextLayer
    /// silently fails to render when its bounds exceed the GPU's max 2D
    /// texture size (~8192px on older Intel Macs ≈ 4096pt at 2× backing).
    /// One container, many pages, one animation source — sync stays trivial.
    private let scrollContainer = CALayer()
    private var pageLayers: [CATextLayer] = []

    private let readingGuide = CALayer()
    private let leftTriangle = CAShapeLayer()
    private let rightTriangle = CAShapeLayer()
    private let gradientTop = CAGradientLayer()
    private let gradientBottom = CAGradientLayer()

    private(set) var cachedTextHeight: CGFloat = 0

    private var currentMirror = false
    private var currentFlip = false
    /// Last-applied scroll percent. Tracked so a flip toggle (which inverts
    /// the y-axis used by `ty(forPosition:)`) can re-apply the current
    /// position with the new sign without losing the user's place.
    private var cachedPercent: Double = 0

    /// Hard cap on each text-page layer's height in points. Kept well under
    /// 4096 (the per-side limit at 2× backing on an 8192-pixel-max GPU) so we
    /// don't have to query the GPU's actual capabilities.
    private let maxPageHeightPts: CGFloat = 3500

    var horizontalPadding: CGFloat = 80
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

        scrollContainer.anchorPoint = CGPoint(x: 0, y: 0)
        // Hard-disable implicit animations on the properties we drive each
        // frame. This prevents subtle layer-time-tree differences between
        // independently-created instances from producing different visual
        // states despite identical commanded values.
        scrollContainer.actions = [
            "transform": NSNull(),
            "position": NSNull(),
            "bounds": NSNull(),
            "frame": NSNull(),
            "sublayers": NSNull()
        ]
        layer?.addSublayer(scrollContainer)

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
        let scale = window?.backingScaleFactor ?? 2.0
        for pageLayer in pageLayers {
            pageLayer.contentsScale = scale
        }
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

        // No paragraph style: CATextLayer renders attributed strings using its
        // own internal CoreText configuration that doesn't reliably honor
        // paragraph-style line-spacing properties (lineHeightMultiple,
        // min/maximumLineHeight). Any mismatch between paragraph-style-aware
        // measurement and the layer's rendering shows up as black gaps below
        // the text in each page. Sticking to font + color attributes only
        // means both `boundingRect` and CATextLayer use the font's natural
        // line metrics, so measurement matches rendering. Horizontal
        // centering moves to the layer via alignmentMode.
        let attrs: [NSAttributedString.Key: Any] = [
            .font: baseFont,
            .foregroundColor: nsColor(fromHex: appearance.textColorHex)
        ]
        let content = (script?.content.isEmpty ?? true) ? "— empty script —" : script!.content
        let attributed = NSAttributedString(string: content, attributes: attrs)

        let textWidth = max(1, bounds.width - horizontalPadding * 2)

        // TextKit lays out the entire script once so we know the precise y of
        // every line, then we slice into pages at line boundaries below
        // `maxPageHeightPts`. Using the same line breaks for both slicing and
        // CATextLayer rendering keeps page seams invisible — each page holds a
        // contiguous range of characters that wraps the same way it did during
        // measurement.
        let storage = NSTextStorage(attributedString: attributed)
        let layoutManager = NSLayoutManager()
        let textContainer = NSTextContainer(size: NSSize(width: textWidth, height: .greatestFiniteMagnitude))
        textContainer.lineFragmentPadding = 0
        storage.addLayoutManager(layoutManager)
        layoutManager.addTextContainer(textContainer)
        layoutManager.ensureLayout(for: textContainer)

        // First pass: walk lines via NSLayoutManager to pick character break
        // points only. We don't trust its y values for layout — CATextLayer
        // uses CoreText, which can wrap and lay out slightly differently. The
        // line breaks themselves are stable enough across both engines that
        // breaking at one of NSLayoutManager's line starts won't split a
        // visible word in the CATextLayer rendering.
        var pageRanges: [NSRange] = []
        var pageStartChar = 0
        var pageStartY: CGFloat = 0

        let glyphRange = layoutManager.glyphRange(for: textContainer)
        layoutManager.enumerateLineFragments(forGlyphRange: glyphRange) { rect, _, _, lineGlyphRange, _ in
            // If this line would push the page past the cap, close the page
            // at the START of this line. First line of any page always fits,
            // to avoid an infinite loop on a single very-tall paragraph.
            if rect.maxY - pageStartY > self.maxPageHeightPts && pageStartY < rect.minY {
                let charRange = layoutManager.characterRange(forGlyphRange: lineGlyphRange, actualGlyphRange: nil)
                let pageEndChar = charRange.location
                pageRanges.append(NSRange(location: pageStartChar, length: pageEndChar - pageStartChar))
                pageStartChar = pageEndChar
                pageStartY = rect.minY
            }
        }
        // Final page
        let finalLength = storage.length - pageStartChar
        if finalLength > 0 || pageRanges.isEmpty {
            pageRanges.append(NSRange(location: pageStartChar, length: max(0, finalLength)))
        }

        let scale = window?.backingScaleFactor ?? NSScreen.main?.backingScaleFactor ?? 2.0
        let pageActions: [String: CAAction] = [
            "transform": NSNull(),
            "position": NSNull(),
            "bounds": NSNull(),
            "frame": NSNull(),
            "contents": NSNull(),
            "string": NSNull()
        ]

        CATransaction.begin()
        CATransaction.setDisableActions(true)

        for old in pageLayers { old.removeFromSuperlayer() }
        pageLayers.removeAll()

        // Second pass: measure each page substring with boundingRect using
        // the same font-only attributes CATextLayer renders with, so the
        // measured height matches the drawn height and page seams stay
        // invisible (see the no-paragraph-style note above).
        var yOffset: CGFloat = 0
        for range in pageRanges {
            let pageString = range.length > 0
                ? attributed.attributedSubstring(from: range)
                : NSAttributedString(string: "")
            let measured = pageString.boundingRect(
                with: NSSize(width: textWidth, height: .greatestFiniteMagnitude),
                options: [.usesLineFragmentOrigin]
            )
            let layerHeight = max(1, ceil(measured.height))

            let pageLayer = CATextLayer()
            pageLayer.alignmentMode = .center
            pageLayer.isWrapped = true
            pageLayer.contentsScale = scale
            pageLayer.anchorPoint = CGPoint(x: 0, y: 0)
            pageLayer.actions = pageActions
            pageLayer.string = pageString
            pageLayer.bounds = CGRect(x: 0, y: 0, width: textWidth, height: layerHeight)
            pageLayer.position = CGPoint(x: horizontalPadding, y: yOffset)
            scrollContainer.addSublayer(pageLayer)
            pageLayers.append(pageLayer)

            yOffset += layerHeight
        }

        let totalHeight = max(1, yOffset)
        scrollContainer.bounds = CGRect(x: 0, y: 0, width: bounds.width, height: totalHeight)
        scrollContainer.position = CGPoint(x: 0, y: 0)
        cachedTextHeight = totalHeight
        layer?.backgroundColor = nsColor(fromHex: appearance.bgColorHex).cgColor
        CATransaction.commit()
    }

    func applyMirrorFlip(_ appearance: Appearance) {
        currentMirror = appearance.mirror
        currentFlip = appearance.flip
        applyMirrorFlipTransform()
    }

    private func applyMirrorFlipTransform() {
        // Reflect the whole scrollContainer (positions + content of every
        // page) as a single visual unit — the camera/glass setup expects the
        // entire on-screen image to be flipped as one. The container-wide
        // approach also reverses the y-axis used for scroll translation, so
        // we compensate in `ty(forPosition:)` below: when flip is on, the
        // scroll-position formula is negated so playback still reads forward
        // through the script.
        //
        // CA uses row-vector convention (v' = v * M); CATransform3DTranslate /
        // Scale produce t' = op * t — the newly-added op is INNERMOST. To get
        // M = T(-cx,-cy) * S * T(cx,cy), build right-to-left.
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
        scrollContainer.sublayerTransform = t
        // Re-apply the scroll position so its sign matches the new flip state.
        let tyValue = (ty(forPosition: cachedPercent) * 2).rounded() / 2
        scrollContainer.transform = CATransform3DMakeTranslation(0, tyValue, 0)
        CATransaction.commit()
    }

    func ty(forPosition percent: Double) -> CGFloat {
        // Vertical flip reflects scrollContainer's y-axis, so the scroll
        // translation must be negated for forward playback to still read
        // forward through the script.
        let normal = bounds.height * 0.5 - cachedTextHeight * CGFloat(percent)
        return currentFlip ? -normal : normal
    }

    func applyStaticPosition(_ percent: Double) {
        cachedPercent = percent
        // Half-pixel snap on the y-translation prevents fractional sub-pixel
        // differences between layer instances on different displays.
        let tyValue = (ty(forPosition: percent) * 2).rounded() / 2
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        scrollContainer.transform = CATransform3DMakeTranslation(0, tyValue, 0)
        CATransaction.commit()
    }

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
