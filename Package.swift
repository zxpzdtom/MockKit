// swift-tools-version: 6.0
import Foundation
import PackageDescription

let chromeOverridesResources: [Resource] = FileManager.default.fileExists(
    atPath: "Sources/ChromeOverridesManager/Resources"
) ? [.process("Resources")] : []

let package = Package(
    name: "ChromeOverridesManager",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "ChromeOverridesManager", targets: ["ChromeOverridesManager"])
    ],
    targets: [
        .executableTarget(
            name: "ChromeOverridesManager",
            resources: chromeOverridesResources
        )
    ]
)
