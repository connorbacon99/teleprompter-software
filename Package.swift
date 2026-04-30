// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Teleprompter",
    platforms: [.macOS(.v10_15)],
    products: [
        .executable(name: "Teleprompter", targets: ["Teleprompter"])
    ],
    targets: [
        .executableTarget(
            name: "Teleprompter",
            path: "Sources/Teleprompter"
        )
    ]
)
