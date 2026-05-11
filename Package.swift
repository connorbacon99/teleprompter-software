// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Teleprompter",
    platforms: [.macOS(.v10_15)],
    products: [
        .executable(name: "Teleprompter", targets: ["TeleprompterApp"])
    ],
    targets: [
        .target(
            name: "Teleprompter",
            path: "Sources/Teleprompter"
        ),
        .executableTarget(
            name: "TeleprompterApp",
            dependencies: ["Teleprompter"],
            path: "Sources/TeleprompterApp"
        ),
        .testTarget(
            name: "TeleprompterTests",
            dependencies: ["Teleprompter"],
            path: "Tests/TeleprompterTests"
        )
    ]
)
