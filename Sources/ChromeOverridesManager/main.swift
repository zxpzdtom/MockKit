import AppKit
import WebKit

private let appName = "MockKit"
private let legacyAppNames = ["Overrides Studio", "Chrome Overrides Manager"]
private let appDisplayName = "MockKit"
private let defaultOverridesFolder = "/Users/tom/Desktop/mock"

struct Store: Codable {
    var overridesFolder: String
    var mockEnabled: Bool
    var chromeProfile: ChromeProfileState?
    var aiSettings: AiSettings?
    var uiSettings: UiSettings?
    var groupPaths: [String]?
    var endpoints: [Endpoint]
}

struct UiSettings: Codable {
    var theme: String
}

struct AiSettings: Codable {
    var enabled: Bool?
    var provider: String
    var model: String
    var models: [String: String]?
    var apiKey: String
    var apiKeys: [String: String]?
    var baseUrl: String
    var aiGroupingPrompt: String?
    var cliPresetId: String?
    var cliPresets: [AiCliPreset]?
}

struct AiCliPreset: Codable {
    var id: String
    var name: String
    var model: String?
    var command: String
    var streamMode: String
}

struct ChromeProfileState: Codable {
    var profileName: String
    var preferencesPath: String
    var localOverridesEnabled: String
    var overridesFolder: String?
    var detectedAt: String
}

struct Endpoint: Codable, Identifiable {
    var id: String
    var name: String
    var method: String
    var overridePath: String
    var groupPath: String?
    var description: String
    var tags: [String]
    var enabled: Bool?
    var activeCaseId: String?
    var cases: [MockCase]
}

struct MockCase: Codable, Identifiable {
    var id: String
    var name: String
    var body: String
    var status: Int
    var headers: String
}

struct AiGeneratedCase: Codable {
    var name: String
    var body: String
    var description: String?
}

struct CoreAiPreview: Codable {
    var mode: String
    var cases: [AiGeneratedCase]
}

struct AiGroupingAssignment: Codable {
    var endpointId: String
    var groupPath: String
    var reason: String?
}

struct CoreAiGroupingPreview: Codable {
    var groups: [AiGroupingAssignment]
}

struct CoreAiMetadataPreview: Codable {
    var endpointId: String
    var name: String
    var description: String
}

struct AiProgressPayload: Codable, Sendable {
    var stage: String
    var message: String
    var bytes: Int?
    var content: String?
}

struct AiMockCaseContext: Codable {
    var name: String
    var body: String
}

struct AiMockEndpointContext: Codable {
    var name: String
    var method: String
    var overridePath: String
    var description: String
    var activeCaseName: String
    var activeBody: String
    var cases: [AiMockCaseContext]
}

struct AiMockRequestPayload: Codable {
    var mode: String
    var instruction: String
    var endpoint: AiMockEndpointContext
}

struct AiMetadataEndpointContext: Codable {
    var id: String
    var name: String
    var method: String
    var overridePath: String
    var groupPath: String?
    var description: String
    var tags: [String]
    var activeCaseName: String
    var activeBody: String
    var cases: [AiMockCaseContext]
}

struct AiMetadataRequestPayload: Codable {
    var instruction: String
    var endpoint: AiMetadataEndpointContext
}

struct AiGroupingEndpointContext: Codable {
    var id: String
    var name: String
    var method: String
    var overridePath: String
    var groupPath: String?
    var description: String
    var tags: [String]
}

struct AiGroupingRequestPayload: Codable {
    var instruction: String
    var endpoints: [AiGroupingEndpointContext]
}

struct CoreRequest: Codable {
    var command: String
    var storePath: String
    var defaultOverridesFolder: String?
    var legacyStorePaths: [String]?
    var store: Store?
    var curl: String?
    var fetchResponse: Bool?
    var aiRequest: AiMockRequestPayload?
    var aiMetadataRequest: AiMetadataRequestPayload?
    var aiGroupingRequest: AiGroupingRequestPayload?

    init(
        command: String,
        storePath: String,
        defaultOverridesFolder: String? = nil,
        legacyStorePaths: [String]? = nil,
        store: Store? = nil,
        curl: String? = nil,
        fetchResponse: Bool? = nil,
        aiRequest: AiMockRequestPayload? = nil,
        aiMetadataRequest: AiMetadataRequestPayload? = nil,
        aiGroupingRequest: AiGroupingRequestPayload? = nil
    ) {
        self.command = command
        self.storePath = storePath
        self.defaultOverridesFolder = defaultOverridesFolder
        self.legacyStorePaths = legacyStorePaths
        self.store = store
        self.curl = curl
        self.fetchResponse = fetchResponse
        self.aiRequest = aiRequest
        self.aiMetadataRequest = aiMetadataRequest
        self.aiGroupingRequest = aiGroupingRequest
    }
}

struct CoreResponse: Codable {
    var store: Store?
    var imported: [String]
    var updated: Int
    var written: [String]
    var importedEndpointId: String?
    var importedCaseId: String?
    var aiPreview: CoreAiPreview?
    var aiMetadataPreview: CoreAiMetadataPreview?
    var aiGroupingPreview: CoreAiGroupingPreview?
}

final class AiProgressLineParser: @unchecked Sendable {
    private var buffer = Data()
    private let lock = NSLock()
    private let decoder = JSONDecoder()

    func append(_ data: Data) -> [AiProgressPayload] {
        lock.lock()
        defer { lock.unlock() }
        buffer.append(data)
        var payloads: [AiProgressPayload] = []
        while let newlineRange = buffer.firstRange(of: Data([0x0a])) {
            let lineData = buffer.subdata(in: 0..<newlineRange.lowerBound)
            buffer.removeSubrange(0..<newlineRange.upperBound)
            guard
                let line = String(data: lineData, encoding: .utf8)?
                    .trimmingCharacters(in: .whitespacesAndNewlines),
                line.hasPrefix("MOCKKIT_EVENT:")
            else { continue }
            let jsonText = String(line.dropFirst("MOCKKIT_EVENT:".count))
            guard
                let jsonData = jsonText.data(using: .utf8),
                let payload = try? decoder.decode(AiProgressPayload.self, from: jsonData)
            else { continue }
            payloads.append(payload)
        }
        return payloads
    }
}

final class RustCoreClient {
    private let encoder: JSONEncoder
    private let decoder = JSONDecoder()
    private let executableURL: URL
    typealias ProgressHandler = @Sendable (AiProgressPayload) -> Void

    init() {
        encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        executableURL = RustCoreClient.resolveExecutableURL()
    }

    func load(storePath: URL, legacyStorePaths: [URL]) throws -> CoreResponse {
        try run(CoreRequest(
            command: "load",
            storePath: storePath.path,
            defaultOverridesFolder: defaultOverridesFolder,
            legacyStorePaths: legacyStorePaths.map(\.path),
            store: nil
        ))
    }

    func save(store: Store, storePath: URL) throws -> CoreResponse {
        try run(CoreRequest(command: "save", storePath: storePath.path, defaultOverridesFolder: nil, legacyStorePaths: nil, store: store))
    }

    func sync(store: Store, storePath: URL) throws -> CoreResponse {
        try run(CoreRequest(command: "sync", storePath: storePath.path, defaultOverridesFolder: nil, legacyStorePaths: nil, store: store))
    }

    func publish(store: Store, storePath: URL) throws -> CoreResponse {
        try run(CoreRequest(command: "publish", storePath: storePath.path, defaultOverridesFolder: nil, legacyStorePaths: nil, store: store))
    }

    func disable(store: Store, storePath: URL) throws -> CoreResponse {
        try run(CoreRequest(command: "disable", storePath: storePath.path, defaultOverridesFolder: nil, legacyStorePaths: nil, store: store))
    }

    func refreshChromeProfile(store: Store, storePath: URL) throws -> CoreResponse {
        try run(CoreRequest(command: "refreshChromeProfile", storePath: storePath.path, store: store))
    }

    func importCurl(store: Store, storePath: URL, curl: String, fetchResponse: Bool) throws -> CoreResponse {
        try run(CoreRequest(command: "importCurl", storePath: storePath.path, store: store, curl: curl, fetchResponse: fetchResponse))
    }

    func generateAiMock(
        store: Store,
        storePath: URL,
        aiRequest: AiMockRequestPayload,
        progress: ProgressHandler? = nil
    ) throws -> CoreResponse {
        try run(
            CoreRequest(command: "generateAiMock", storePath: storePath.path, store: store, aiRequest: aiRequest),
            progress: progress
        )
    }

    func generateAiMetadata(
        store: Store,
        storePath: URL,
        aiRequest: AiMetadataRequestPayload,
        progress: ProgressHandler? = nil
    ) throws -> CoreResponse {
        try run(
            CoreRequest(command: "generateAiMetadata", storePath: storePath.path, store: store, aiMetadataRequest: aiRequest),
            progress: progress
        )
    }

    func generateAiGrouping(
        store: Store,
        storePath: URL,
        aiRequest: AiGroupingRequestPayload,
        progress: ProgressHandler? = nil
    ) throws -> CoreResponse {
        try run(
            CoreRequest(command: "generateAiGrouping", storePath: storePath.path, store: store, aiGroupingRequest: aiRequest),
            progress: progress
        )
    }

    private func run(_ request: CoreRequest, progress: ProgressHandler? = nil) throws -> CoreResponse {
        let requestURL = FileManager.default
            .temporaryDirectory
            .appendingPathComponent("mockkit-core-\(UUID().uuidString).json")
        let responseURL = FileManager.default
            .temporaryDirectory
            .appendingPathComponent("mockkit-core-\(UUID().uuidString)-response.json")
        try encoder.encode(request).write(to: requestURL, options: .atomic)
        defer {
            try? FileManager.default.removeItem(at: requestURL)
            try? FileManager.default.removeItem(at: responseURL)
        }

        let process = Process()
        process.executableURL = executableURL
        process.arguments = [requestURL.path, responseURL.path]
        if progress != nil {
            var environment = ProcessInfo.processInfo.environment
            environment["MOCKKIT_AI_PROGRESS"] = "1"
            process.environment = environment
        }

        let output = Pipe()
        let error = Pipe()
        process.standardOutput = output
        process.standardError = error
        if let progress {
            let parser = AiProgressLineParser()
            error.fileHandleForReading.readabilityHandler = { handle in
                let data = handle.availableData
                guard !data.isEmpty else { return }
                for payload in parser.append(data) {
                    progress(payload)
                }
            }
        }

        try process.run()
        let timeout: TimeInterval
        switch request.command {
        case "sync":
            timeout = 2.5
        case "generateAiMock", "generateAiMetadata", "generateAiGrouping":
            timeout = 180
        case "importCurl":
            timeout = request.fetchResponse == true ? 35 : 8
        default:
            timeout = 8
        }
        let deadline = Date().addingTimeInterval(timeout)
        while process.isRunning && Date() < deadline {
            Thread.sleep(forTimeInterval: 0.02)
        }
        if process.isRunning {
            process.terminate()
            throw NSError(domain: appName, code: 124, userInfo: [NSLocalizedDescriptionKey: "Rust core 执行超时：\(request.command)。"])
        }
        process.waitUntilExit()
        error.fileHandleForReading.readabilityHandler = nil

        let outputData = output.fileHandleForReading.readDataToEndOfFile()
        let errorData = error.fileHandleForReading.readDataToEndOfFile()
        if process.terminationStatus != 0 {
            if let object = try? JSONSerialization.jsonObject(with: outputData) as? [String: Any],
               let message = object["error"] as? String {
                throw NSError(domain: appName, code: Int(process.terminationStatus), userInfo: [NSLocalizedDescriptionKey: message])
            }
            let message = String(data: errorData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
            throw NSError(domain: appName, code: Int(process.terminationStatus), userInfo: [
                NSLocalizedDescriptionKey: message?.isEmpty == false ? message! : "Rust core 执行失败。"
            ])
        }

        return try decoder.decode(CoreResponse.self, from: Data(contentsOf: responseURL))
    }

    private static func resolveExecutableURL() -> URL {
        if let override = ProcessInfo.processInfo.environment["MOCKKIT_CORE_PATH"], !override.isEmpty {
            return URL(fileURLWithPath: override)
        }

        if let executableDirectory = Bundle.main.executableURL?.deletingLastPathComponent() {
            let bundled = executableDirectory.appendingPathComponent("mockkit-core")
            if FileManager.default.isExecutableFile(atPath: bundled.path) {
                return bundled
            }
        }

        let currentDirectory = URL(fileURLWithPath: FileManager.default.currentDirectoryPath, isDirectory: true)
        let debug = currentDirectory.appendingPathComponent("target/debug/mockkit-core")
        if FileManager.default.isExecutableFile(atPath: debug.path) {
            return debug
        }

        let release = currentDirectory.appendingPathComponent("target/release/mockkit-core")
        if FileManager.default.isExecutableFile(atPath: release.path) {
            return release
        }

        return URL(fileURLWithPath: "mockkit-core")
    }
}

final class StoreController {
    private let fileManager = FileManager.default
    private let storeURL: URL
    private let legacyStoreURLs: [URL]
    private let core = RustCoreClient()

    init() {
        let support = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let appDirectory = support.appendingPathComponent(appName, isDirectory: true)
        try? fileManager.createDirectory(at: appDirectory, withIntermediateDirectories: true)
        storeURL = appDirectory.appendingPathComponent("store.json")
        legacyStoreURLs = legacyAppNames.map { legacyAppName in
            support
                .appendingPathComponent(legacyAppName, isDirectory: true)
                .appendingPathComponent("store.json")
        }
    }

    func load() -> Store {
        do {
            return try core.load(storePath: storeURL, legacyStorePaths: legacyStoreURLs).store ?? defaultStore()
        } catch {
            NSLog("Rust core load failed: \(error.localizedDescription)")
            let store = defaultStore()
            save(store)
            return store
        }
    }

    func refreshChromeProfile(store: inout Store) throws {
        let result = try core.refreshChromeProfile(store: store, storePath: storeURL)
        if let nextStore = result.store {
            store = nextStore
        }
    }

    func save(_ store: Store) {
        do {
            _ = try core.save(store: store, storePath: storeURL)
        } catch {
            NSLog("Rust core save failed: \(error.localizedDescription)")
        }
    }

    func saveNormalized(store: inout Store) throws {
        let result = try core.save(store: store, storePath: storeURL)
        if let nextStore = result.store {
            store = nextStore
        }
    }

    func syncOverrides(store: inout Store) throws -> (imported: [String], updated: Int) {
        let result = try core.sync(store: store, storePath: storeURL)
        if let nextStore = result.store {
            store = nextStore
        }
        return (result.imported, result.updated)
    }

    func publish(store: Store) throws -> [String] {
        let result = try core.publish(store: store, storePath: storeURL)
        return result.written
    }

    func disable(store: inout Store) throws {
        let result = try core.disable(store: store, storePath: storeURL)
        if let nextStore = result.store {
            store = nextStore
        }
    }

    func importCurl(store: inout Store, curl: String, fetchResponse: Bool) throws -> CoreResponse {
        let result = try core.importCurl(store: store, storePath: storeURL, curl: curl, fetchResponse: fetchResponse)
        if let nextStore = result.store {
            store = nextStore
        }
        return result
    }

    func generateAiMock(
        store: Store,
        aiRequest: AiMockRequestPayload,
        progress: RustCoreClient.ProgressHandler? = nil
    ) throws -> CoreResponse {
        try core.generateAiMock(store: store, storePath: storeURL, aiRequest: aiRequest, progress: progress)
    }

    func generateAiMetadata(
        store: Store,
        aiRequest: AiMetadataRequestPayload,
        progress: RustCoreClient.ProgressHandler? = nil
    ) throws -> CoreResponse {
        try core.generateAiMetadata(store: store, storePath: storeURL, aiRequest: aiRequest, progress: progress)
    }

    func generateAiGrouping(
        store: Store,
        aiRequest: AiGroupingRequestPayload,
        progress: RustCoreClient.ProgressHandler? = nil
    ) throws -> CoreResponse {
        try core.generateAiGrouping(store: store, storePath: storeURL, aiRequest: aiRequest, progress: progress)
    }

    func revealOverridesFolder(store: Store, relativePath: String? = nil) {
        let root = URL(fileURLWithPath: store.overridesFolder, isDirectory: true)
        let cleanPath = sanitizedRelativePath(relativePath ?? "")
        let url = cleanPath.isEmpty ? root : root.appendingPathComponent(cleanPath, isDirectory: true)
        try? fileManager.createDirectory(at: url, withIntermediateDirectories: true)
        NSWorkspace.shared.open(url)
    }

    func defaultAiSettings() -> AiSettings {
        AiSettings(
            enabled: false,
            provider: "openrouter",
            model: "",
            models: [:],
            apiKey: "",
            apiKeys: [:],
            baseUrl: "",
            aiGroupingPrompt: nil,
            cliPresetId: "codex-cli",
            cliPresets: []
        )
    }

    func defaultUiSettings() -> UiSettings {
        UiSettings(theme: "mockkit")
    }

    private func defaultStore() -> Store {
        Store(
            overridesFolder: defaultOverridesFolder,
            mockEnabled: true,
            chromeProfile: nil,
            aiSettings: defaultAiSettings(),
            uiSettings: defaultUiSettings(),
            groupPaths: [],
            endpoints: []
        )
    }

    private func sanitizedRelativePath(_ path: String) -> String {
        path
            .split(separator: "/")
            .filter { $0 != "." && $0 != ".." && !$0.isEmpty }
            .joined(separator: "/")
    }
}

final class Bridge: NSObject, WKScriptMessageHandler {
    private let storeController = StoreController()
    private let aiQueue = DispatchQueue(label: "mockkit.ai.generate", qos: .userInitiated)
    private weak var webView: WKWebView?
    private var store: Store
    private var isSavingStore = false
    private var pendingStorePayload: Any?

    override init() {
        store = storeController.load()
        super.init()
    }

    func attach(webView: WKWebView) {
        self.webView = webView
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let payload = message.body as? [String: Any],
              let command = payload["command"] as? String else {
            sendError("收到无效的桥接命令。")
            return
        }

        do {
            switch command {
            case "ready":
                sendState()
            case "saveStore":
                try saveStore(payload["store"])
            case "scan":
                var nextStore = store
                let result = try storeController.syncOverrides(store: &nextStore)
                store = nextStore
                sendResult(message: "已同步：新增 \(result.imported.count) 个，更新 \(result.updated) 个。")
            case "syncFiles":
                var nextStore = store
                let result = try storeController.syncOverrides(store: &nextStore)
                store = nextStore
                if !result.imported.isEmpty || result.updated > 0 {
                    sendState()
                }
            case "publish":
                let written = try storeController.publish(store: store)
                sendResult(message: "已发布 \(written.count) 个托管 Override 文件。")
            case "disable":
                var nextStore = store
                try storeController.disable(store: &nextStore)
                store = nextStore
                sendResult(message: "Mock 已禁用，托管文件已移除。")
            case "revealFolder":
                storeController.revealOverridesFolder(store: store, relativePath: payload["path"] as? String)
            case "refreshChromeProfile":
                var nextStore = store
                try storeController.refreshChromeProfile(store: &nextStore)
                store = nextStore
                sendResult(message: "已重新检测 Chrome Profile。")
            case "importCurl":
                let curl = payload["curl"] as? String ?? ""
                let fetchResponse = payload["fetchResponse"] as? Bool ?? false
                try importCurl(curl, fetchResponse: fetchResponse)
            case "generateAiMock":
                let request = payload["aiRequest"] as? [String: Any] ?? [:]
                try startGenerateAiMock(request)
            case "generateAiMetadata":
                let request = payload["aiMetadataRequest"] as? [String: Any] ?? [:]
                try startGenerateAiMetadata(request)
            case "generateAiGrouping":
                let request = payload["aiGroupingRequest"] as? [String: Any] ?? [:]
                try startGenerateAiGrouping(request)
            case "installCli":
                let result = try installMockKitCli()
                let directory = URL(fileURLWithPath: result.path).deletingLastPathComponent().path
                let suffix = result.inPath
                    ? "新终端窗口中可直接运行 mockkit。"
                    : "请将 \(directory) 加入 PATH 后再使用 mockkit。"
                sendResult(message: "CLI 已安装到 \(result.path)。\(suffix)")
            case "startWindowDrag":
                startWindowDrag()
            case "toggleZoom":
                NSApp.keyWindow?.performZoom(nil)
            default:
                sendError("未知命令：\(command)")
            }
        } catch {
            sendError(error.localizedDescription)
        }
    }

    private func startGenerateAiMock(_ rawRequest: [String: Any]) throws {
        let data = try JSONSerialization.data(withJSONObject: rawRequest)
        let aiRequest = try JSONDecoder().decode(AiMockRequestPayload.self, from: data)
        let storeSnapshot = store
        sendAiProgress(stage: "starting", message: "AI 生成已开始，正在建立流式连接...")
        aiQueue.async { [weak self] in
            guard let self else { return }
            do {
                let backgroundStoreController = StoreController()
                let result = try backgroundStoreController.generateAiMock(
                    store: storeSnapshot,
                    aiRequest: aiRequest,
                    progress: { [weak self] payload in
                        DispatchQueue.main.async {
                            self?.sendAiProgress(payload)
                        }
                    }
                )
                DispatchQueue.main.async { [weak self] in
                    guard let self else { return }
                    if let nextStore = result.store {
                        self.store = nextStore
                    }
                    var extra: [String: Any] = [:]
                    if let preview = result.aiPreview {
                        extra["aiPreview"] = self.dictionary(from: preview)
                    }
                    extra["aiProgress"] = [
                        "stage": "complete",
                        "message": "AI 已生成 Mock 预览。"
                    ]
                    self.sendState(message: "AI 已生成 Mock 预览。", extra: extra)
                }
            } catch {
                DispatchQueue.main.async { [weak self] in
                    self?.sendState(
                        error: error.localizedDescription,
                        extra: [
                            "aiProgress": [
                                "stage": "error",
                                "message": error.localizedDescription
                            ]
                        ]
                    )
                }
            }
        }
    }

    private func startGenerateAiMetadata(_ rawRequest: [String: Any]) throws {
        let data = try JSONSerialization.data(withJSONObject: rawRequest)
        let aiRequest = try JSONDecoder().decode(AiMetadataRequestPayload.self, from: data)
        let storeSnapshot = store
        sendAiProgress(stage: "starting", message: "AI 命名已开始，正在建立流式连接...")
        aiQueue.async { [weak self] in
            guard let self else { return }
            do {
                let backgroundStoreController = StoreController()
                let result = try backgroundStoreController.generateAiMetadata(
                    store: storeSnapshot,
                    aiRequest: aiRequest,
                    progress: { [weak self] payload in
                        DispatchQueue.main.async {
                            self?.sendAiProgress(payload)
                        }
                    }
                )
                DispatchQueue.main.async { [weak self] in
                    guard let self else { return }
                    if let nextStore = result.store {
                        self.store = nextStore
                    }
                    var extra: [String: Any] = [:]
                    if let preview = result.aiMetadataPreview {
                        extra["aiMetadataPreview"] = self.dictionary(from: preview)
                    }
                    extra["aiProgress"] = [
                        "stage": "complete",
                        "message": "AI 已生成命名建议。"
                    ]
                    self.sendState(extra: extra)
                }
            } catch {
                DispatchQueue.main.async { [weak self] in
                    self?.sendState(
                        error: error.localizedDescription,
                        extra: [
                            "aiProgress": [
                                "stage": "error",
                                "message": error.localizedDescription
                            ],
                            "aiMetadataEndpointId": aiRequest.endpoint.id
                        ]
                    )
                }
            }
        }
    }

    private func startGenerateAiGrouping(_ rawRequest: [String: Any]) throws {
        let data = try JSONSerialization.data(withJSONObject: rawRequest)
        let aiRequest = try JSONDecoder().decode(AiGroupingRequestPayload.self, from: data)
        let storeSnapshot = store
        sendAiProgress(stage: "starting", message: "AI 自动分组已开始，正在建立流式连接...")
        aiQueue.async { [weak self] in
            guard let self else { return }
            do {
                let backgroundStoreController = StoreController()
                let result = try backgroundStoreController.generateAiGrouping(
                    store: storeSnapshot,
                    aiRequest: aiRequest,
                    progress: { [weak self] payload in
                        DispatchQueue.main.async {
                            self?.sendAiProgress(payload)
                        }
                    }
                )
                DispatchQueue.main.async { [weak self] in
                    guard let self else { return }
                    if let nextStore = result.store {
                        self.store = nextStore
                    }
                    var extra: [String: Any] = [:]
                    if let preview = result.aiGroupingPreview {
                        extra["aiGroupingPreview"] = self.dictionary(from: preview)
                    }
                    extra["aiProgress"] = [
                        "stage": "complete",
                        "message": "AI 已生成分组建议。"
                    ]
                    self.sendState(message: "AI 已生成分组建议。", extra: extra)
                }
            } catch {
                DispatchQueue.main.async { [weak self] in
                    self?.sendState(
                        error: error.localizedDescription,
                        extra: [
                            "aiProgress": [
                                "stage": "error",
                                "message": error.localizedDescription
                            ]
                        ]
                    )
                }
            }
        }
    }

    private func sendAiProgress(stage: String, message: String) {
        sendAiProgress(AiProgressPayload(stage: stage, message: message, bytes: nil, content: nil))
    }

    private func sendAiProgress(_ progress: AiProgressPayload) {
        sendState(extra: ["aiProgress": dictionary(from: progress)])
    }

    private func importCurl(_ curl: String, fetchResponse: Bool) throws {
        var nextStore = store
        let result = try storeController.importCurl(store: &nextStore, curl: curl, fetchResponse: fetchResponse)
        store = nextStore
        let suffix = fetchResponse ? "，已保存响应场景。" : "。"
        sendState(
            message: "已导入 cURL\(suffix)",
            extra: [
                "importedEndpointId": result.importedEndpointId ?? "",
                "importedCaseId": result.importedCaseId ?? ""
            ]
        )
    }

    private func saveStore(_ rawStore: Any?) throws {
        if isSavingStore {
            pendingStorePayload = rawStore
            return
        }

        isSavingStore = true
        defer {
            isSavingStore = false
        }

        var currentPayload = rawStore
        while true {
            try saveStoreNow(currentPayload)
            guard let pendingPayload = pendingStorePayload else {
                break
            }
            pendingStorePayload = nil
            currentPayload = pendingPayload
        }
    }

    private func saveStoreNow(_ rawStore: Any?) throws {
        let requestedAiEnabled = ((rawStore as? [String: Any])?["aiSettings"] as? [String: Any])?["enabled"] as? Bool
        let data = try JSONSerialization.data(withJSONObject: rawStore ?? [:])
        var nextStore = try JSONDecoder().decode(Store.self, from: data)
        if nextStore.aiSettings == nil {
            nextStore.aiSettings = storeController.defaultAiSettings()
        }
        if nextStore.uiSettings == nil {
            nextStore.uiSettings = storeController.defaultUiSettings()
        }
        if nextStore.aiSettings?.enabled == nil {
            nextStore.aiSettings?.enabled = requestedAiEnabled ?? false
        }
        try storeController.saveNormalized(store: &nextStore)
        if let requestedAiEnabled {
            if nextStore.aiSettings == nil {
                nextStore.aiSettings = storeController.defaultAiSettings()
            }
            nextStore.aiSettings?.enabled = requestedAiEnabled
        }
        _ = try storeController.publish(store: nextStore)
        store = nextStore
        sendState()
    }

    private func sendState(message: String? = nil, error: String? = nil, extra: [String: Any] = [:]) {
        guard let webView else { return }
        var payload: [String: Any] = [
            "store": dictionary(from: store)
        ]
        for (key, value) in extra {
            payload[key] = value
        }
        if let message {
            payload["message"] = message
        }
        if let error {
            payload["error"] = error
        }
        guard let json = jsonString(payload) else { return }
        webView.evaluateJavaScript("window.__receiveNativeState(\(json));")
    }

    private func sendResult(message: String) {
        storeController.save(store)
        sendState(message: message)
    }

    private func sendError(_ error: String) {
        sendState(error: error)
    }

    private func dictionary<T: Encodable>(from value: T) -> Any {
        let data = (try? JSONEncoder().encode(value)) ?? Data()
        return (try? JSONSerialization.jsonObject(with: data)) ?? [:]
    }

    private func jsonString(_ value: Any) -> String? {
        guard JSONSerialization.isValidJSONObject(value),
              let data = try? JSONSerialization.data(withJSONObject: value),
              let json = String(data: data, encoding: .utf8) else {
            return nil
        }
        return json
    }

    private func startWindowDrag() {
        guard let window = webView?.window ?? NSApp.keyWindow ?? NSApp.mainWindow,
              let event = NSApp.currentEvent else {
            return
        }
        window.performDrag(with: event)
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    private var window: NSWindow!
    private var bridge: Bridge!
    private weak var webView: WKWebView?
    private var keyDownMonitor: Any?

    func applicationDidFinishLaunching(_ notification: Notification) {
        bridge = Bridge()
        configureMainMenu()
        installKeyboardShortcuts()

        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.preferences.setValue(true, forKey: "developerExtrasEnabled")
        configuration.userContentController.add(bridge, name: "native")

        let webView = WKWebView(frame: .zero, configuration: configuration)
        self.webView = webView
        webView.navigationDelegate = self
        webView.isInspectable = true
        webView.setValue(false, forKey: "drawsBackground")
        bridge.attach(webView: webView)

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1180, height: 760),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = appDisplayName
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.isMovableByWindowBackground = false
        window.isReleasedWhenClosed = false
        window.minSize = NSSize(width: 940, height: 620)
        window.contentView = webView
        window.center()
        window.makeKeyAndOrderFront(nil)

        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)

        if let indexURL = resourceURL(named: "index", extension: "html") {
            webView.loadFileURL(indexURL, allowingReadAccessTo: indexURL.deletingLastPathComponent())
        }
    }

    private func configureMainMenu() {
        let mainMenu = NSMenu()

        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        let quitItem = appMenu.addItem(
            withTitle: "Quit \(appDisplayName)",
            action: #selector(NSApplication.terminate(_:)),
            keyEquivalent: "q"
        )
        quitItem.target = NSApp
        appMenu.insertItem(.separator(), at: 0)
        let settingsItem = appMenu.insertItem(
            withTitle: "Settings...",
            action: #selector(openSettings(_:)),
            keyEquivalent: ",",
            at: 0
        )
        settingsItem.target = self
        settingsItem.keyEquivalentModifierMask = [.command]
        let installCliItem = appMenu.insertItem(
            withTitle: "Install Command Line Tool",
            action: #selector(installCommandLineTool(_:)),
            keyEquivalent: "",
            at: 1
        )
        installCliItem.target = self
        appItem.submenu = appMenu
        mainMenu.addItem(appItem)

        let editItem = NSMenuItem()
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = editMenu
        mainMenu.addItem(editItem)

        let developItem = NSMenuItem()
        let developMenu = NSMenu(title: "Develop")
        let inspectorItem = developMenu.addItem(
            withTitle: "Show Web Inspector",
            action: #selector(openWebInspector(_:)),
            keyEquivalent: "i"
        )
        inspectorItem.target = self
        inspectorItem.keyEquivalentModifierMask = [.command, .option]
        developItem.submenu = developMenu
        mainMenu.addItem(developItem)

        NSApp.mainMenu = mainMenu
    }

    private func installKeyboardShortcuts() {
        keyDownMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
            if event.modifierFlags.intersection(.deviceIndependentFlagsMask) == .command,
               event.charactersIgnoringModifiers?.lowercased() == "q" {
                NSApp.terminate(nil)
                return nil
            }
            if event.modifierFlags.intersection(.deviceIndependentFlagsMask) == .command,
               event.charactersIgnoringModifiers == "," {
                self.openSettings(nil)
                return nil
            }
            if event.modifierFlags.intersection(.deviceIndependentFlagsMask) == [.command, .option],
               event.charactersIgnoringModifiers?.lowercased() == "i" {
                self.openWebInspector(nil)
                return nil
            }
            return event
        }
    }

    @objc private func openSettings(_ sender: Any?) {
        webView?.evaluateJavaScript("window.__openMockKitSettings?.()")
    }

    @objc private func installCommandLineTool(_ sender: Any?) {
        do {
            let result = try installMockKitCli()
            let pathNote = result.inPath
                ? "Try `mockkit status` in a new terminal window."
                : "Add \(URL(fileURLWithPath: result.path).deletingLastPathComponent().path) to your shell PATH, then try `mockkit status`."
            showAlert(
                title: "MockKit CLI Installed",
                message: "The `mockkit` command was installed at:\n\(result.path)\n\n\(pathNote)"
            )
        } catch {
            showAlert(title: "Could Not Install CLI", message: error.localizedDescription)
        }
    }

    @objc private func openWebInspector(_ sender: Any?) {
        guard let webView else { return }
        webView.isInspectable = true

        let showInspector = Selector(("_showInspector:"))
        if webView.responds(to: showInspector) {
            webView.perform(showInspector, with: sender)
        } else {
            NSSound.beep()
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        if let keyDownMonitor {
            NSEvent.removeMonitor(keyDownMonitor)
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        NSLog("WebView navigation failed: \(error.localizedDescription)")
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        NSLog("WebView provisional navigation failed: \(error.localizedDescription)")
    }

    private func resourceURL(named name: String, extension fileExtension: String) -> URL? {
        if let url = Bundle.module.url(forResource: name, withExtension: fileExtension) {
            return url
        }

        let bundleNames = [
            "ChromeOverridesManager_ChromeOverridesManager.bundle",
            "Chrome Overrides Manager_ChromeOverridesManager.bundle"
        ]

        for bundleName in bundleNames {
            let candidate = Bundle.main.bundleURL
                .appendingPathComponent("Contents/Resources", isDirectory: true)
                .appendingPathComponent(bundleName, isDirectory: true)
            if let bundle = Bundle(url: candidate),
               let url = bundle.url(forResource: name, withExtension: fileExtension) {
                return url
            }
        }

        return nil
    }

    private func showAlert(title: String, message: String) {
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = message
        alert.alertStyle = .informational
        alert.addButton(withTitle: "OK")
        alert.beginSheetModal(for: window)
    }
}

private func installMockKitCli() throws -> (path: String, inPath: Bool) {
    let fileManager = FileManager.default
    let bundledCli = resolveBundledCli()
    guard fileManager.isExecutableFile(atPath: bundledCli.path) else {
        throw NSError(domain: appName, code: 2, userInfo: [NSLocalizedDescriptionKey: "The bundled `mockkit` command was not found. Rebuild the app and try again."])
    }

    let pathDirectories = shellPathDirectories()
    let destinations = cliInstallDestinations(pathDirectories: pathDirectories)
    if let destination = destinations.first(where: { destination in
        let directory = destination.deletingLastPathComponent()
        return pathDirectories.contains(directory.path)
            && fileManager.fileExists(atPath: directory.path)
            && fileManager.isWritableFile(atPath: directory.path)
    }) {
        return try installCliSymlink(from: bundledCli, to: destination, pathDirectories: pathDirectories)
    }

    let privilegedDestination = URL(fileURLWithPath: "/usr/local/bin/mockkit")
    try installCliSymlinkWithAdministratorPrivileges(from: bundledCli, to: privilegedDestination)
    return (privilegedDestination.path, shellPathDirectories().contains(privilegedDestination.deletingLastPathComponent().path))
}

private func installCliSymlink(
    from bundledCli: URL,
    to destination: URL,
    pathDirectories: Set<String>
) throws -> (path: String, inPath: Bool) {
    let fileManager = FileManager.default
    let directory = destination.deletingLastPathComponent()
    try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
    if fileManager.fileExists(atPath: destination.path) {
        if destination.resolvingSymlinksInPath() == bundledCli.resolvingSymlinksInPath() {
            return (destination.path, pathDirectories.contains(directory.path))
        }
        let values = try destination.resourceValues(forKeys: [.isSymbolicLinkKey])
        guard values.isSymbolicLink == true else {
            throw NSError(domain: appName, code: 4, userInfo: [NSLocalizedDescriptionKey: "`\(destination.path)` already exists and is not a symlink. Move it first, then install the MockKit CLI again."])
        }
        try fileManager.removeItem(at: destination)
    }
    try fileManager.createSymbolicLink(at: destination, withDestinationURL: bundledCli)

    return (destination.path, pathDirectories.contains(directory.path))
}

private func installCliSymlinkWithAdministratorPrivileges(from bundledCli: URL, to destination: URL) throws {
    let command = """
    set -e
    mkdir -p \(shellQuote(destination.deletingLastPathComponent().path))
    if [ -e \(shellQuote(destination.path)) ] && [ ! -L \(shellQuote(destination.path)) ]; then
      echo "\(destination.path) already exists and is not a symlink." >&2
      exit 4
    fi
    ln -sfn \(shellQuote(bundledCli.path)) \(shellQuote(destination.path))
    """
    try runAppleScript(command: "do shell script \(appleScriptStringLiteral(command)) with administrator privileges")
}

private func resolveBundledCli() -> URL {
    let bundled = Bundle.main.bundleURL
        .appendingPathComponent("Contents/Resources/CLI", isDirectory: true)
        .appendingPathComponent("mockkit")
    if FileManager.default.isExecutableFile(atPath: bundled.path) {
        return bundled
    }

    let currentDirectory = URL(fileURLWithPath: FileManager.default.currentDirectoryPath, isDirectory: true)
    let debug = currentDirectory.appendingPathComponent("target/debug/mockkit")
    if FileManager.default.isExecutableFile(atPath: debug.path) {
        return debug
    }

    let release = currentDirectory.appendingPathComponent("target/release/mockkit")
    if FileManager.default.isExecutableFile(atPath: release.path) {
        return release
    }

    return bundled
}

private func cliInstallDestinations(pathDirectories: Set<String>) -> [URL] {
    var destinations = [
        URL(fileURLWithPath: "/opt/homebrew/bin/mockkit"),
        URL(fileURLWithPath: "/usr/local/bin/mockkit")
    ]
    if let home = ProcessInfo.processInfo.environment["HOME"], !home.isEmpty,
       pathDirectories.contains(URL(fileURLWithPath: home).appendingPathComponent(".local/bin").path) {
        destinations.append(URL(fileURLWithPath: home).appendingPathComponent(".local/bin/mockkit"))
    }
    return destinations
}

private func shellPathDirectories() -> Set<String> {
    if let path = loginShellPath(), !path.isEmpty {
        return Set(path.split(separator: ":").map(String.init))
    }
    return Set(
        (ProcessInfo.processInfo.environment["PATH"] ?? "")
        .split(separator: ":")
        .map(String.init)
    )
}

private func loginShellPath() -> String? {
    let shell = ProcessInfo.processInfo.environment["SHELL"].flatMap { $0.isEmpty ? nil : $0 } ?? "/bin/zsh"
    let process = Process()
    process.executableURL = URL(fileURLWithPath: shell)
    process.arguments = ["-ilc", "printf %s \"$PATH\""]
    let output = Pipe()
    process.standardOutput = output
    process.standardError = Pipe()
    do {
        try process.run()
        process.waitUntilExit()
        guard process.terminationStatus == 0 else { return nil }
        let data = output.fileHandleForReading.readDataToEndOfFile()
        return String(data: data, encoding: .utf8)
    } catch {
        return nil
    }
}

private func runAppleScript(command: String) throws {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
    process.arguments = ["-e", command]
    let errorPipe = Pipe()
    process.standardError = errorPipe
    try process.run()
    process.waitUntilExit()
    if process.terminationStatus != 0 {
        let data = errorPipe.fileHandleForReading.readDataToEndOfFile()
        let message = String(data: data, encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        throw NSError(domain: appName, code: Int(process.terminationStatus), userInfo: [
            NSLocalizedDescriptionKey: message?.isEmpty == false ? message! : "Command-line tool installation was cancelled or failed."
        ])
    }
}

private func shellQuote(_ value: String) -> String {
    "'\(value.replacingOccurrences(of: "'", with: "'\"'\"'"))'"
}

private func appleScriptStringLiteral(_ value: String) -> String {
    "\"\(value.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\""))\""
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
