// swift-tools-version: 6.0
import PackageDescription

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
            resources: [
                .process("Resources")
            ]
        )
    ]
)
