import Foundation

enum PowerPointImportError: LocalizedError {
    case unzipFailed(String)
    case missingFile(String)
    case parseFailed(String)

    var errorDescription: String? {
        switch self {
        case .unzipFailed(let detail): return "Could not unzip the .pptx file. \(detail)"
        case .missingFile(let path): return "The .pptx is missing a required part: \(path)"
        case .parseFailed(let path): return "Failed to parse XML inside the .pptx: \(path)"
        }
    }
}

/// Parses speaker notes out of a .pptx file and returns a teleprompter-friendly
/// script body with `[SLIDE N]` markers. Slides without notes are skipped — no
/// orphan markers. Slide numbering follows the deck's actual order (via
/// `ppt/presentation.xml`), not the on-disk filename, so reordered or deleted
/// slides don't desync the index.
enum PowerPointImporter {
    static func extractNotes(from pptxURL: URL) throws -> String {
        let tempDir = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("pptx-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: tempDir) }

        try unzip(pptxURL, to: tempDir)

        let pptDir = tempDir.appendingPathComponent("ppt", isDirectory: true)
        let presentationURL = pptDir.appendingPathComponent("presentation.xml")
        let presentationRelsURL = pptDir
            .appendingPathComponent("_rels", isDirectory: true)
            .appendingPathComponent("presentation.xml.rels")

        guard FileManager.default.fileExists(atPath: presentationURL.path) else {
            throw PowerPointImportError.missingFile("ppt/presentation.xml")
        }
        guard FileManager.default.fileExists(atPath: presentationRelsURL.path) else {
            throw PowerPointImportError.missingFile("ppt/_rels/presentation.xml.rels")
        }

        let slideRelIds = try parseSlideOrder(presentationURL)
        let presentationRels = try parseRelationships(presentationRelsURL)

        var blocks: [String] = []
        for (index, relId) in slideRelIds.enumerated() {
            let slideNumber = index + 1
            guard let slideTarget = presentationRels[relId] else { continue }

            // slideTarget is relative to ppt/, e.g. "slides/slide1.xml"
            let slideURL = pptDir.appendingPathComponent(slideTarget).standardizedFileURL
            let slideDir = slideURL.deletingLastPathComponent()
            let slideRelsURL = slideDir
                .appendingPathComponent("_rels", isDirectory: true)
                .appendingPathComponent(slideURL.lastPathComponent + ".rels")

            guard FileManager.default.fileExists(atPath: slideRelsURL.path) else { continue }

            let slideRels = try parseRelationships(slideRelsURL)
            // Find the relationship pointing to the notesSlide for this slide.
            guard let notesTarget = slideRels.values.first(where: { $0.contains("notesSlide") }) else {
                continue
            }
            // notesTarget is relative to the slide file's directory.
            let notesURL = slideDir.appendingPathComponent(notesTarget).standardizedFileURL
            guard FileManager.default.fileExists(atPath: notesURL.path) else { continue }

            let notesText = try extractNotesBodyText(from: notesURL)
            let cleaned = sanitize(notesText)
            if cleaned.isEmpty { continue }

            blocks.append("[SLIDE \(slideNumber)]\n\(cleaned)")
        }

        return blocks.joined(separator: "\n\n")
    }

    /// Normalize the raw text from PowerPoint so it renders cleanly at 64pt.
    /// PowerPoint exports often contain stray Unicode line separators (LS,
    /// PS, NEL), vertical tabs from soft-breaks, and runs of empty paragraphs
    /// that look fine at 14pt in the editor but become massive black gaps at
    /// teleprompter size. We normalize all those to plain `\n`, strip trailing
    /// whitespace per line, and cap runs of blank lines at one.
    private static func sanitize(_ text: String) -> String {
        var t = text
        t = t.replacingOccurrences(of: "\r\n", with: "\n")
        t = t.replacingOccurrences(of: "\r", with: "\n")
        t = t.replacingOccurrences(of: "\u{2028}", with: "\n")
        t = t.replacingOccurrences(of: "\u{2029}", with: "\n")
        t = t.replacingOccurrences(of: "\u{0085}", with: "\n")
        t = t.replacingOccurrences(of: "\u{000B}", with: "\n")
        t = t.replacingOccurrences(of: "\u{000C}", with: "\n")

        let inlineWhitespace = CharacterSet(charactersIn: " \t")
        t = t.split(separator: "\n", omittingEmptySubsequences: false)
            .map { String($0).trimmingCharacters(in: inlineWhitespace) }
            .joined(separator: "\n")

        // Collapse 3+ consecutive newlines down to 2 (i.e. at most one blank
        // line between paragraphs). Done iteratively rather than via regex to
        // avoid pulling in NSRegularExpression for one call.
        while t.contains("\n\n\n") {
            t = t.replacingOccurrences(of: "\n\n\n", with: "\n\n")
        }

        return t.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // MARK: - Unzip

    private static func unzip(_ zipURL: URL, to destinationURL: URL) throws {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/unzip")
        process.arguments = ["-q", "-o", zipURL.path, "-d", destinationURL.path]

        let stderr = Pipe()
        process.standardError = stderr
        process.standardOutput = Pipe()

        do {
            try process.run()
        } catch {
            throw PowerPointImportError.unzipFailed(error.localizedDescription)
        }
        process.waitUntilExit()

        if process.terminationStatus != 0 {
            let data = stderr.fileHandleForReading.readDataToEndOfFile()
            let detail = String(data: data, encoding: .utf8)?
                .trimmingCharacters(in: .whitespacesAndNewlines) ?? "exit \(process.terminationStatus)"
            throw PowerPointImportError.unzipFailed(detail.isEmpty ? "exit \(process.terminationStatus)" : detail)
        }
    }

    // MARK: - XML parsing

    private static func parseSlideOrder(_ url: URL) throws -> [String] {
        let parser = XMLParser(contentsOf: url) ?? XMLParser()
        parser.shouldProcessNamespaces = false
        let delegate = SlideOrderDelegate()
        parser.delegate = delegate
        guard parser.parse() else {
            throw PowerPointImportError.parseFailed(url.lastPathComponent)
        }
        return delegate.relIds
    }

    private static func parseRelationships(_ url: URL) throws -> [String: String] {
        let parser = XMLParser(contentsOf: url) ?? XMLParser()
        parser.shouldProcessNamespaces = false
        let delegate = RelationshipsDelegate()
        parser.delegate = delegate
        guard parser.parse() else {
            throw PowerPointImportError.parseFailed(url.lastPathComponent)
        }
        return delegate.rels
    }

    private static func extractNotesBodyText(from url: URL) throws -> String {
        let parser = XMLParser(contentsOf: url) ?? XMLParser()
        parser.shouldProcessNamespaces = false
        let delegate = NotesBodyDelegate()
        parser.delegate = delegate
        guard parser.parse() else {
            throw PowerPointImportError.parseFailed(url.lastPathComponent)
        }
        return delegate.assemble()
    }
}

// MARK: - XMLParser delegates

private final class SlideOrderDelegate: NSObject, XMLParserDelegate {
    var relIds: [String] = []
    private var insideSldIdLst = false

    func parser(_ parser: XMLParser,
                didStartElement elementName: String,
                namespaceURI: String?,
                qualifiedName qName: String?,
                attributes attributeDict: [String: String] = [:]) {
        if elementName == "p:sldIdLst" {
            insideSldIdLst = true
        } else if elementName == "p:sldId", insideSldIdLst {
            if let rid = attributeDict["r:id"] {
                relIds.append(rid)
            }
        }
    }

    func parser(_ parser: XMLParser,
                didEndElement elementName: String,
                namespaceURI: String?,
                qualifiedName qName: String?) {
        if elementName == "p:sldIdLst" {
            insideSldIdLst = false
        }
    }
}

private final class RelationshipsDelegate: NSObject, XMLParserDelegate {
    var rels: [String: String] = [:]

    func parser(_ parser: XMLParser,
                didStartElement elementName: String,
                namespaceURI: String?,
                qualifiedName qName: String?,
                attributes attributeDict: [String: String] = [:]) {
        if elementName == "Relationship" {
            if let id = attributeDict["Id"], let target = attributeDict["Target"] {
                rels[id] = target
            }
        }
    }
}

/// Walks a notesSlide XML and collects text only from the body placeholder
/// (or shapes with no placeholder type), skipping slide-number / date / footer
/// fields that would otherwise pollute the script.
private final class NotesBodyDelegate: NSObject, XMLParserDelegate {
    private var paragraphs: [String] = []
    private var currentParagraph: String = ""
    private var currentTextRun: String = ""

    private var spDepth = 0
    private var phTypeStack: [String?] = []
    private var sawPhStack: [Bool] = []
    private var insideTxBody = false
    private var insideParagraph = false
    private var insideTextRun = false

    func parser(_ parser: XMLParser,
                didStartElement elementName: String,
                namespaceURI: String?,
                qualifiedName qName: String?,
                attributes attributeDict: [String: String] = [:]) {
        switch elementName {
        case "p:sp":
            spDepth += 1
            phTypeStack.append(nil)
            sawPhStack.append(false)
        case "p:ph":
            if spDepth > 0 {
                sawPhStack[sawPhStack.count - 1] = true
                phTypeStack[phTypeStack.count - 1] = attributeDict["type"]
            }
        case "p:txBody":
            // Include text from this shape's body if: no <p:ph> at all (custom
            // text box), placeholder type missing (defaults to body), or
            // placeholder type is "body". Skip everything else (sldNum, dt,
            // ftr, sldImg, hdr, etc.).
            if spDepth > 0 {
                let sawPh = sawPhStack.last ?? false
                let phType = phTypeStack.last ?? nil
                let include = !sawPh || phType == nil || phType == "body"
                if include {
                    insideTxBody = true
                }
            }
        case "a:p":
            if insideTxBody {
                insideParagraph = true
                currentParagraph = ""
            }
        case "a:t":
            if insideParagraph {
                insideTextRun = true
                currentTextRun = ""
            }
        case "a:br":
            if insideParagraph {
                currentParagraph += "\n"
            }
        default:
            break
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        if insideTextRun {
            currentTextRun += string
        }
    }

    func parser(_ parser: XMLParser,
                didEndElement elementName: String,
                namespaceURI: String?,
                qualifiedName qName: String?) {
        switch elementName {
        case "a:t":
            if insideTextRun {
                currentParagraph += currentTextRun
                insideTextRun = false
            }
        case "a:p":
            if insideParagraph {
                paragraphs.append(currentParagraph)
                insideParagraph = false
            }
        case "p:txBody":
            insideTxBody = false
        case "p:sp":
            if spDepth > 0 {
                spDepth -= 1
                if !phTypeStack.isEmpty { phTypeStack.removeLast() }
                if !sawPhStack.isEmpty { sawPhStack.removeLast() }
            }
        default:
            break
        }
    }

    func assemble() -> String {
        // One paragraph per line. Empty paragraphs preserved as blank lines so
        // intentional spacing in the speaker notes survives, but the outer
        // import call trims leading/trailing whitespace on each slide block.
        return paragraphs.joined(separator: "\n")
    }
}
