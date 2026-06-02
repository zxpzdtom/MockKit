import AppKit
import WebKit

private let appName = "MockKit"
private let legacyAppNames = ["Overrides Studio", "Chrome Overrides Manager"]
private let appDisplayName = "MockKit"
private let latestReleaseFeedURL = URL(string: "https://github.com/zxpzdtom/MockKit/releases.atom")!
private let lastBackgroundUpdateCheckKey = "MockKit.lastBackgroundUpdateCheck"
private let skippedUpdateTagKey = "MockKit.skippedUpdateTagName"
private let menuLanguageDidChangeNotification = Notification.Name("MockKit.menuLanguageDidChange")

private enum MockKitPaths {
    static var applicationSupportDirectory: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(
                "Library/Application Support",
                isDirectory: true
            )
    }

    static var defaultOverridesFolder: String {
        applicationSupportDirectory
            .appendingPathComponent(appName, isDirectory: true)
            .appendingPathComponent("Overrides", isDirectory: true)
            .path
    }

    static var legacyDefaultOverridesFolder: String {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Desktop", isDirectory: true)
            .appendingPathComponent("mock", isDirectory: true)
            .path
    }

    static var updateDownloadDirectory: URL {
        applicationSupportDirectory
            .appendingPathComponent(appName, isDirectory: true)
            .appendingPathComponent("Updates", isDirectory: true)
    }
}

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
    var language: String?
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

struct GitHubRelease: Decodable {
    var tagName: String
    var htmlURL: String
    var assets: [GitHubReleaseAsset]

    enum CodingKeys: String, CodingKey {
        case tagName = "tag_name"
        case htmlURL = "html_url"
        case assets
    }
}

struct GitHubReleaseAsset: Decodable {
    var name: String
    var browserDownloadURL: String

    enum CodingKeys: String, CodingKey {
        case name
        case browserDownloadURL = "browser_download_url"
    }
}

final class ReleaseFeedParser: NSObject, XMLParserDelegate {
    private var currentElement = ""
    private var currentTitle = ""
    private var currentReleaseURL = ""
    private var isInsideEntry = false
    private var didCaptureLatestEntry = false

    func parse(data: Data) -> (tagName: String, releaseURL: URL)? {
        let parser = XMLParser(data: data)
        parser.delegate = self
        guard parser.parse(), !currentTitle.isEmpty, let releaseURL = URL(string: currentReleaseURL) else {
            return nil
        }
        return (currentTitle, releaseURL)
    }

    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?, qualifiedName qName: String?, attributes attributeDict: [String: String] = [:]) {
        currentElement = elementName
        guard !didCaptureLatestEntry else { return }
        if elementName == "entry" {
            isInsideEntry = true
            currentTitle = ""
            currentReleaseURL = ""
        } else if isInsideEntry,
                  elementName == "link",
                  attributeDict["rel"] == "alternate",
                  attributeDict["type"] == "text/html",
                  let href = attributeDict["href"] {
            currentReleaseURL = href
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        guard isInsideEntry, !didCaptureLatestEntry, currentElement == "title" else { return }
        currentTitle += string
    }

    func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?, qualifiedName qName: String?) {
        if elementName == "entry", isInsideEntry {
            isInsideEntry = false
            didCaptureLatestEntry = !currentTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            currentTitle = currentTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        currentElement = ""
    }
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

final class CancellationToken: @unchecked Sendable {
    private let lock = NSLock()
    private var cancelled = false
    private weak var process: Process?

    var isCancelled: Bool {
        lock.lock()
        defer { lock.unlock() }
        return cancelled
    }

    func setProcess(_ process: Process) {
        lock.lock()
        self.process = process
        let shouldTerminate = cancelled
        lock.unlock()
        if shouldTerminate, process.isRunning {
            process.terminate()
        }
    }

    func cancel() {
        lock.lock()
        cancelled = true
        let process = process
        lock.unlock()
        if process?.isRunning == true {
            process?.terminate()
        }
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
            defaultOverridesFolder: MockKitPaths.defaultOverridesFolder,
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
        progress: ProgressHandler? = nil,
        cancellation: CancellationToken? = nil
    ) throws -> CoreResponse {
        try run(
            CoreRequest(command: "generateAiGrouping", storePath: storePath.path, store: store, aiGroupingRequest: aiRequest),
            progress: progress,
            cancellation: cancellation
        )
    }

    private func run(
        _ request: CoreRequest,
        progress: ProgressHandler? = nil,
        cancellation: CancellationToken? = nil
    ) throws -> CoreResponse {
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
        cancellation?.setProcess(process)
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
        defer {
            error.fileHandleForReading.readabilityHandler = nil
        }

        if cancellation?.isCancelled == true {
            throw NSError(domain: appName, code: 125, userInfo: [NSLocalizedDescriptionKey: "AI 分组已取消。"])
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
            if cancellation?.isCancelled == true {
                process.terminate()
                process.waitUntilExit()
                throw NSError(domain: appName, code: 125, userInfo: [NSLocalizedDescriptionKey: "AI 分组已取消。"])
            }
            Thread.sleep(forTimeInterval: 0.02)
        }
        if cancellation?.isCancelled == true {
            if process.isRunning {
                process.terminate()
                process.waitUntilExit()
            }
            throw NSError(domain: appName, code: 125, userInfo: [NSLocalizedDescriptionKey: "AI 分组已取消。"])
        }
        if process.isRunning {
            process.terminate()
            throw NSError(domain: appName, code: 124, userInfo: [NSLocalizedDescriptionKey: "操作超时：\(request.command)。"])
        }
        process.waitUntilExit()

        let outputData = output.fileHandleForReading.readDataToEndOfFile()
        let errorData = error.fileHandleForReading.readDataToEndOfFile()
        if process.terminationStatus != 0 {
            if let object = try? JSONSerialization.jsonObject(with: outputData) as? [String: Any],
               let message = object["error"] as? String {
                throw NSError(domain: appName, code: Int(process.terminationStatus), userInfo: [NSLocalizedDescriptionKey: message])
            }
            let message = String(data: errorData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
            throw NSError(domain: appName, code: Int(process.terminationStatus), userInfo: [
                NSLocalizedDescriptionKey: message?.isEmpty == false ? message! : "操作执行失败。"
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
            var store = try core.load(storePath: storeURL, legacyStorePaths: legacyStoreURLs).store ?? defaultStore()
            migrateLegacyDefaultOverridesFolderIfNeeded(store: &store)
            return store
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
        progress: RustCoreClient.ProgressHandler? = nil,
        cancellation: CancellationToken? = nil
    ) throws -> CoreResponse {
        try core.generateAiGrouping(
            store: store,
            storePath: storeURL,
            aiRequest: aiRequest,
            progress: progress,
            cancellation: cancellation
        )
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
        UiSettings(theme: "mockkit", language: "zh-CN")
    }

    private func defaultStore() -> Store {
        Store(
            overridesFolder: MockKitPaths.defaultOverridesFolder,
            mockEnabled: true,
            chromeProfile: nil,
            aiSettings: defaultAiSettings(),
            uiSettings: defaultUiSettings(),
            groupPaths: [],
            endpoints: []
        )
    }

    private func migrateLegacyDefaultOverridesFolderIfNeeded(store: inout Store) {
        let currentPath = URL(fileURLWithPath: store.overridesFolder, isDirectory: true).standardizedFileURL.path
        let legacyPath = URL(fileURLWithPath: MockKitPaths.legacyDefaultOverridesFolder, isDirectory: true).standardizedFileURL.path
        let chromePath = store.chromeProfile?.overridesFolder.map {
            URL(fileURLWithPath: $0, isDirectory: true).standardizedFileURL.path
        }
        guard currentPath == legacyPath else { return }
        guard chromePath != legacyPath else { return }

        store.overridesFolder = MockKitPaths.defaultOverridesFolder
        try? fileManager.createDirectory(
            at: URL(fileURLWithPath: store.overridesFolder, isDirectory: true),
            withIntermediateDirectories: true
        )
        save(store)
    }

    private func sanitizedRelativePath(_ path: String) -> String {
        path
            .split(separator: "/")
            .filter { $0 != "." && $0 != ".." && !$0.isEmpty }
            .joined(separator: "/")
    }
}

final class Bridge: NSObject, WKScriptMessageHandler, @preconcurrency URLSessionDownloadDelegate {
    private let storeController = StoreController()
    private let importQueue = DispatchQueue(label: "mockkit.import-curl", qos: .userInitiated)
    private let aiQueue = DispatchQueue(label: "mockkit.ai.generate", qos: .userInitiated)
    private weak var webView: WKWebView?
    private var store: Store
    private var isSavingStore = false
    private var pendingStorePayload: Any?
    private var aiGroupingCancellation: CancellationToken?
    private var aiGroupingRequestId: String?
    private var pendingUpdateRelease: GitHubRelease?
    private var downloadedUpdateURL: URL?
    private var updateDownloadTask: URLSessionDownloadTask?
    private var updateDownloadAssetName: String?
    private var updateDownloadCompleted = false
    private var updateDownloadWasCancelled = false
    private lazy var updateSession = URLSession(
        configuration: .default,
        delegate: self,
        delegateQueue: OperationQueue.main
    )

    override init() {
        store = storeController.load()
        super.init()
    }

    func attach(webView: WKWebView) {
        self.webView = webView
    }

    func checkForUpdatesFromMenu() {
        checkForUpdates(interactive: true)
    }

    func currentLanguage() -> String {
        store.uiSettings?.language ?? "zh-CN"
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
                checkForUpdates(interactive: false)
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
            case "openExternal":
                guard let urlString = payload["url"] as? String,
                      let url = URL(string: urlString),
                      ["http", "https"].contains(url.scheme?.lowercased() ?? "") else {
                    sendError("无法打开链接。")
                    return
                }
                NSWorkspace.shared.open(url)
            case "refreshChromeProfile":
                var nextStore = store
                try storeController.refreshChromeProfile(store: &nextStore)
                store = nextStore
                sendResult(message: "已重新检测 Chrome Profile。")
            case "importCurl":
                let curl = payload["curl"] as? String ?? ""
                let fetchResponse = payload["fetchResponse"] as? Bool ?? false
                startImportCurl(curl, fetchResponse: fetchResponse)
            case "generateAiMock":
                let request = payload["aiRequest"] as? [String: Any] ?? [:]
                try startGenerateAiMock(request)
            case "generateAiMetadata":
                let request = payload["aiMetadataRequest"] as? [String: Any] ?? [:]
                try startGenerateAiMetadata(request)
            case "generateAiGrouping":
                let request = payload["aiGroupingRequest"] as? [String: Any] ?? [:]
                try startGenerateAiGrouping(request, requestId: payload["aiGroupingRequestId"] as? String)
            case "cancelAiGrouping":
                cancelAiGrouping(requestId: payload["aiGroupingRequestId"] as? String)
            case "installCli":
                let result = try installMockKitCli()
                let directory = URL(fileURLWithPath: result.path).deletingLastPathComponent().path
                let suffix = result.inPath
                    ? "新终端窗口中可直接运行 mockkit。"
                    : "请将 \(directory) 加入 PATH 后再使用 mockkit。"
                sendResult(message: "CLI 已安装到 \(result.path)。\(suffix)")
            case "checkForUpdates":
                checkForUpdates(interactive: true)
            case "downloadUpdate":
                startUpdateDownload()
            case "cancelUpdateDownload":
                cancelUpdateDownload()
            case "installDownloadedUpdate":
                installDownloadedUpdate()
            case "skipUpdateVersion":
                skipPendingUpdateVersion()
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

    private func checkForUpdates(interactive: Bool) {
        if !interactive {
            if isRunningDevelopmentFrontend() {
                return
            }
            let lastCheck = UserDefaults.standard.object(forKey: lastBackgroundUpdateCheckKey) as? Date
            if let lastCheck, Calendar.current.isDateInToday(lastCheck) {
                return
            }
        } else {
            sendUpdateState(stage: "checking", message: "正在检查更新...")
        }

        if interactive, let downloadedUpdateURL {
            sendDownloadedUpdateReady(downloadedUpdateURL: downloadedUpdateURL)
            return
        }

        let currentVersion = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.1.0"
        var request = URLRequest(url: latestReleaseFeedURL)
        request.setValue("application/atom+xml,application/xml,text/xml", forHTTPHeaderField: "Accept")
        request.setValue("MockKit", forHTTPHeaderField: "User-Agent")

        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            if let error {
                DispatchQueue.main.async {
                    if !interactive {
                        UserDefaults.standard.set(Date(), forKey: lastBackgroundUpdateCheckKey)
                        return
                    }
                    self?.sendUpdateState(stage: "error", message: "检查更新失败：\(error.localizedDescription)")
                }
                return
            }
            guard
                let httpResponse = response as? HTTPURLResponse,
                let data
            else {
                DispatchQueue.main.async {
                    if !interactive {
                        UserDefaults.standard.set(Date(), forKey: lastBackgroundUpdateCheckKey)
                        return
                    }
                    self?.sendUpdateState(stage: "error", message: "检查更新失败：无法读取 GitHub Release。")
                }
                return
            }
            guard (200..<300).contains(httpResponse.statusCode) else {
                DispatchQueue.main.async {
                    if !interactive {
                        UserDefaults.standard.set(Date(), forKey: lastBackgroundUpdateCheckKey)
                        return
                    }
                    if httpResponse.statusCode == 404 {
                        self?.sendUpdateState(stage: "notAvailable", message: "还没有发布 GitHub Release，暂时无法检查更新。")
                    } else {
                        self?.sendUpdateState(stage: "error", message: "检查更新失败：GitHub 返回 \(httpResponse.statusCode)。")
                    }
                }
                return
            }
            guard
                let latest = ReleaseFeedParser().parse(data: data)
            else {
                DispatchQueue.main.async {
                    if !interactive {
                        UserDefaults.standard.set(Date(), forKey: lastBackgroundUpdateCheckKey)
                        return
                    }
                    self?.sendUpdateState(stage: "notAvailable", message: "还没有发布 GitHub Release，暂时无法检查更新。")
                }
                return
            }

            let latestVersion = normalizedVersion(latest.tagName)
            let release = githubReleaseFromRedirect(tagName: latest.tagName, releaseURL: latest.releaseURL)
            DispatchQueue.main.async {
                if !interactive {
                    UserDefaults.standard.set(Date(), forKey: lastBackgroundUpdateCheckKey)
                }
                if compareVersions(latestVersion, currentVersion) == .orderedDescending {
                    if !interactive,
                       UserDefaults.standard.string(forKey: skippedUpdateTagKey) == latest.tagName {
                        return
                    }
                    self?.pendingUpdateRelease = release
                    self?.downloadedUpdateURL = nil
                    self?.sendUpdateAvailable(release: release, currentVersion: currentVersion, latestVersion: latestVersion)
                } else if interactive {
                    self?.sendUpdateState(
                        stage: "notAvailable",
                        message: "当前已是最新版本。",
                        currentVersion: currentVersion,
                        latestVersion: latestVersion,
                        tagName: latest.tagName
                    )
                }
            }
        }.resume()
    }

    private func startUpdateDownload() {
        guard let release = pendingUpdateRelease else {
            sendUpdateState(stage: "error", message: "没有可下载的更新。")
            return
        }
        guard
            let asset = preferredReleaseAsset(from: release),
            let downloadURL = URL(string: asset.browserDownloadURL)
        else {
            if let fallbackURL = URL(string: release.htmlURL) {
                NSWorkspace.shared.open(fallbackURL)
            }
            sendUpdateState(stage: "error", message: "发现新版本 \(release.tagName)，未找到适合当前设备的 DMG，已打开下载页面。")
            return
        }

        updateDownloadTask?.cancel()
        downloadedUpdateURL = nil
        updateDownloadAssetName = asset.name
        updateDownloadCompleted = false
        updateDownloadWasCancelled = false

        sendUpdateState(
            stage: "downloading",
            message: "正在下载 \(asset.name)...",
            latestVersion: normalizedVersion(release.tagName),
            tagName: release.tagName,
            assetName: asset.name,
            progress: 0
        )
        let task = updateSession.downloadTask(with: downloadURL)
        updateDownloadTask = task
        task.resume()
    }

    private func cancelUpdateDownload() {
        guard let updateDownloadTask else {
            sendUpdateState(stage: "cancelled", message: "下载已停止，可稍后重新检查。")
            return
        }
        updateDownloadWasCancelled = true
        updateDownloadTask.cancel()
    }

    private func skipPendingUpdateVersion() {
        guard let release = pendingUpdateRelease else {
            return
        }
        updateDownloadWasCancelled = true
        updateDownloadTask?.cancel()
        updateDownloadTask = nil
        updateDownloadAssetName = nil
        updateDownloadCompleted = false
        downloadedUpdateURL = nil
        pendingUpdateRelease = nil
        UserDefaults.standard.set(release.tagName, forKey: skippedUpdateTagKey)
    }

    private func installDownloadedUpdate() {
        guard let downloadedUpdateURL else {
            sendUpdateState(stage: "error", message: "更新还没有下载完成。")
            return
        }
        sendUpdateState(stage: "installing", message: "MockKit 将退出并安装更新。", progress: 100)
        installDownloadedUpdate(from: downloadedUpdateURL)
    }

    private func preferredReleaseAsset(from release: GitHubRelease) -> GitHubReleaseAsset? {
        let arch = currentMachineArchitecture()
        let dmgAssets = release.assets.filter { $0.name.lowercased().hasSuffix(".dmg") }
        return dmgAssets.first { asset in
            let name = asset.name.lowercased()
            return name.contains("macos") && name.contains(arch)
        } ?? dmgAssets.first { asset in
            asset.name.lowercased().contains("macos")
        } ?? dmgAssets.first
    }

    private func updateDownloadDirectory() throws -> URL {
        let directory = MockKitPaths.updateDownloadDirectory
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }

    private func installDownloadedUpdate(from dmgURL: URL) {
        do {
            let mountedVolumeURL = try attachDiskImage(dmgURL)
            let sourceAppURL = try findAppBundle(in: mountedVolumeURL)
            let targetAppURL = Bundle.main.bundleURL
            guard targetAppURL.pathExtension == "app" else {
                NSWorkspace.shared.open(dmgURL)
                sendState(message: "更新已下载，当前不是 App Bundle 运行，已打开安装包。", includeStore: false)
                return
            }
            let scriptURL = try createUpdateInstallerScript(
                sourceAppURL: sourceAppURL,
                targetAppURL: targetAppURL,
                mountedVolumeURL: mountedVolumeURL
            )
            try launchUpdateInstaller(scriptURL)
            sendState(message: "更新已下载，MockKit 将退出并自动安装重启。", includeStore: false)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                NSApp.terminate(nil)
            }
        } catch {
            NSWorkspace.shared.open(dmgURL)
            sendState(error: "自动安装更新失败：\(error.localizedDescription)。已打开安装包。", includeStore: false)
        }
    }

    func urlSession(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        didWriteData bytesWritten: Int64,
        totalBytesWritten: Int64,
        totalBytesExpectedToWrite: Int64
    ) {
        guard downloadTask == updateDownloadTask else { return }
        let progress: Double? = totalBytesExpectedToWrite > 0
            ? min(99, max(0, Double(totalBytesWritten) / Double(totalBytesExpectedToWrite) * 100))
            : nil
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.sendUpdateState(
                stage: "downloading",
                message: "正在下载更新...",
                latestVersion: self.pendingUpdateRelease.map { normalizedVersion($0.tagName) },
                tagName: self.pendingUpdateRelease?.tagName,
                assetName: self.updateDownloadAssetName,
                progress: progress,
                bytesReceived: totalBytesWritten,
                bytesExpected: totalBytesExpectedToWrite > 0 ? totalBytesExpectedToWrite : nil
            )
        }
    }

    func urlSession(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        didFinishDownloadingTo location: URL
    ) {
        guard downloadTask == updateDownloadTask else { return }
        if let httpResponse = downloadTask.response as? HTTPURLResponse,
           !(200..<300).contains(httpResponse.statusCode) {
            DispatchQueue.main.async { [weak self] in
                self?.sendUpdateState(stage: "error", message: "下载更新失败：GitHub 返回 \(httpResponse.statusCode)。")
            }
            return
        }

        let destinationURL: URL
        do {
            let downloadDirectory = try updateDownloadDirectory()
            destinationURL = uniqueDownloadURL(
                in: downloadDirectory,
                filename: updateDownloadAssetName ?? "MockKit.dmg"
            )
            try? FileManager.default.removeItem(at: destinationURL)
            try FileManager.default.moveItem(at: location, to: destinationURL)
        } catch {
            DispatchQueue.main.async { [weak self] in
                self?.sendUpdateState(stage: "error", message: "保存更新失败：\(error.localizedDescription)")
            }
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.downloadedUpdateURL = destinationURL
            self.updateDownloadCompleted = true
            self.sendUpdateState(
                stage: "downloaded",
                message: "更新已下载，点击完成更新后将重启 MockKit。",
                latestVersion: self.pendingUpdateRelease.map { normalizedVersion($0.tagName) },
                tagName: self.pendingUpdateRelease?.tagName,
                assetName: self.updateDownloadAssetName,
                progress: 100
            )
        }
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didCompleteWithError error: Error?
    ) {
        guard task == updateDownloadTask else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            defer {
                self.updateDownloadTask = nil
                self.updateDownloadWasCancelled = false
            }
            if self.updateDownloadCompleted {
                return
            }
            if let error {
                let nsError = error as NSError
                if self.updateDownloadWasCancelled || nsError.code == NSURLErrorCancelled {
                    self.sendUpdateState(stage: "cancelled", message: "下载已停止，可稍后重新检查。")
                } else {
                    self.sendUpdateState(stage: "error", message: "下载更新失败：\(error.localizedDescription)")
                }
            }
        }
    }

    private func attachDiskImage(_ dmgURL: URL) throws -> URL {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/hdiutil")
        process.arguments = ["attach", dmgURL.path, "-nobrowse", "-readonly", "-plist"]
        let outputPipe = Pipe()
        let errorPipe = Pipe()
        process.standardOutput = outputPipe
        process.standardError = errorPipe
        try process.run()
        process.waitUntilExit()
        let outputData = outputPipe.fileHandleForReading.readDataToEndOfFile()
        if process.terminationStatus != 0 {
            let errorData = errorPipe.fileHandleForReading.readDataToEndOfFile()
            let message = String(data: errorData, encoding: .utf8)?
                .trimmingCharacters(in: .whitespacesAndNewlines)
            throw NSError(domain: appName, code: Int(process.terminationStatus), userInfo: [
                NSLocalizedDescriptionKey: message?.isEmpty == false ? message! : "无法挂载更新安装包。"
            ])
        }

        guard
            let plist = try PropertyListSerialization.propertyList(
                from: outputData,
                options: [],
                format: nil
            ) as? [String: Any],
            let entities = plist["system-entities"] as? [[String: Any]],
            let mountPoint = entities.compactMap({ $0["mount-point"] as? String }).first
        else {
            throw NSError(domain: appName, code: 1, userInfo: [
                NSLocalizedDescriptionKey: "无法读取更新安装包挂载位置。"
            ])
        }
        return URL(fileURLWithPath: mountPoint, isDirectory: true)
    }

    private func findAppBundle(in mountedVolumeURL: URL) throws -> URL {
        let contents = try FileManager.default.contentsOfDirectory(
            at: mountedVolumeURL,
            includingPropertiesForKeys: nil
        )
        if let match = contents.first(where: { $0.lastPathComponent == "\(appDisplayName).app" }) {
            return match
        }
        if let match = contents.first(where: { $0.pathExtension == "app" }) {
            return match
        }
        throw NSError(domain: appName, code: 1, userInfo: [
            NSLocalizedDescriptionKey: "更新安装包中没有找到 App。"
        ])
    }

    private func createUpdateInstallerScript(
        sourceAppURL: URL,
        targetAppURL: URL,
        mountedVolumeURL: URL
    ) throws -> URL {
        let scriptURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("mockkit-update-\(UUID().uuidString).sh")
        let pid = ProcessInfo.processInfo.processIdentifier
        let script = """
        #!/bin/zsh
        set -euo pipefail
        source_app=\(shellQuote(sourceAppURL.path))
        target_app=\(shellQuote(targetAppURL.path))
        mount_point=\(shellQuote(mountedVolumeURL.path))
        app_pid=\(pid)

        while kill -0 "$app_pid" 2>/dev/null; do
          sleep 0.2
        done

        tmp_target="${target_app}.update"
        rm -rf "$tmp_target"
        /usr/bin/ditto "$source_app" "$tmp_target"
        /usr/bin/codesign --verify --deep --strict "$tmp_target"
        rm -rf "$target_app"
        mv "$tmp_target" "$target_app"
        /usr/bin/xattr -dr com.apple.quarantine "$target_app" 2>/dev/null || true
        /usr/bin/hdiutil detach "$mount_point" -quiet || true
        /usr/bin/open "$target_app"
        rm -f "$0"
        """
        try script.write(to: scriptURL, atomically: true, encoding: .utf8)
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: scriptURL.path)
        return scriptURL
    }

    private func launchUpdateInstaller(_ scriptURL: URL) throws {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/zsh")
        process.arguments = [scriptURL.path]
        process.standardOutput = nil
        process.standardError = nil
        try process.run()
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
                    var extra: [String: Any] = [:]
                    if let preview = result.aiPreview {
                        extra["aiPreview"] = self.dictionary(from: preview)
                    }
                    extra["aiProgress"] = [
                        "stage": "complete",
                        "message": "AI 已生成 Mock 预览。"
                    ]
                    self.sendState(message: "AI 已生成 Mock 预览。", extra: extra, includeStore: false)
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
                        ],
                        includeStore: false
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
                    var extra: [String: Any] = [:]
                    if let preview = result.aiMetadataPreview {
                        extra["aiMetadataPreview"] = self.dictionary(from: preview)
                    }
                    extra["aiProgress"] = [
                        "stage": "complete",
                        "message": "AI 已生成命名建议。"
                    ]
                    self.sendState(extra: extra, includeStore: false)
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
                        ],
                        includeStore: false
                    )
                }
            }
        }
    }

    private func startGenerateAiGrouping(_ rawRequest: [String: Any], requestId: String?) throws {
        let data = try JSONSerialization.data(withJSONObject: rawRequest)
        let aiRequest = try JSONDecoder().decode(AiGroupingRequestPayload.self, from: data)
        let storeSnapshot = store
        aiGroupingCancellation?.cancel()
        let cancellation = CancellationToken()
        aiGroupingCancellation = cancellation
        aiGroupingRequestId = requestId
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
                            if !cancellation.isCancelled {
                                self?.sendAiProgress(payload)
                            }
                        }
                    },
                    cancellation: cancellation
                )
                DispatchQueue.main.async { [weak self] in
                    guard let self else { return }
                    if self.aiGroupingRequestId == requestId {
                        self.aiGroupingCancellation = nil
                        self.aiGroupingRequestId = nil
                    }
                    var extra: [String: Any] = [:]
                    if let preview = result.aiGroupingPreview {
                        extra["aiGroupingPreview"] = self.dictionary(from: preview)
                    }
                    if let requestId {
                        extra["aiGroupingRequestId"] = requestId
                    }
                    extra["aiProgress"] = [
                        "stage": "complete",
                        "message": "AI 已生成分组建议。"
                    ]
                    self.sendState(message: "AI 已生成分组建议。", extra: extra, includeStore: false)
                }
            } catch {
                DispatchQueue.main.async { [weak self] in
                    if self?.aiGroupingRequestId == requestId {
                        self?.aiGroupingCancellation = nil
                        self?.aiGroupingRequestId = nil
                    }
                    self?.sendState(
                        error: error.localizedDescription,
                        extra: [
                            "aiProgress": [
                                "stage": "error",
                                "message": error.localizedDescription
                            ],
                            "aiGroupingRequestId": requestId ?? ""
                        ],
                        includeStore: false
                    )
                }
            }
        }
    }

    private func cancelAiGrouping(requestId: String?) {
        if let requestId, let currentRequestId = aiGroupingRequestId, requestId != currentRequestId {
            return
        }
        aiGroupingCancellation?.cancel()
        aiGroupingCancellation = nil
        aiGroupingRequestId = nil
    }

    private func sendAiProgress(stage: String, message: String) {
        sendAiProgress(AiProgressPayload(stage: stage, message: message, bytes: nil, content: nil))
    }

    private func sendAiProgress(_ progress: AiProgressPayload) {
        sendState(extra: ["aiProgress": dictionary(from: progress)], includeStore: false)
    }

    private func startImportCurl(_ curl: String, fetchResponse: Bool) {
        let storeSnapshot = store
        importQueue.async { [weak self] in
            guard let self else { return }
            do {
                let backgroundStoreController = StoreController()
                var nextStore = storeSnapshot
                let result = try backgroundStoreController.importCurl(
                    store: &nextStore,
                    curl: curl,
                    fetchResponse: fetchResponse
                )
                DispatchQueue.main.async { [weak self] in
                    guard let self else { return }
                    self.store = nextStore
                    let suffix = fetchResponse ? "，已保存响应场景。" : "。"
                    self.sendState(
                        message: "已导入 cURL\(suffix)",
                        extra: [
                            "importedEndpointId": result.importedEndpointId ?? "",
                            "importedCaseId": result.importedCaseId ?? ""
                        ]
                    )
                }
            } catch {
                DispatchQueue.main.async { [weak self] in
                    self?.sendState(error: error.localizedDescription)
                }
            }
        }
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
        let previousLanguage = store.uiSettings?.language
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
        if previousLanguage != store.uiSettings?.language {
            NotificationCenter.default.post(name: menuLanguageDidChangeNotification, object: nil)
        }
        sendState()
    }

    private func sendUpdateAvailable(release: GitHubRelease, currentVersion: String, latestVersion: String) {
        let asset = preferredReleaseAsset(from: release)
        sendUpdateState(
            stage: "available",
            message: "发现新版本 \(release.tagName)。",
            currentVersion: currentVersion,
            latestVersion: latestVersion,
            tagName: release.tagName,
            assetName: asset?.name,
            releaseURL: release.htmlURL,
            progress: 0
        )
    }

    private func sendDownloadedUpdateReady(downloadedUpdateURL: URL) {
        sendUpdateState(
            stage: "downloaded",
            message: "更新已下载，点击重启更新后将安装新版本。",
            latestVersion: pendingUpdateRelease.map { normalizedVersion($0.tagName) },
            tagName: pendingUpdateRelease?.tagName,
            assetName: updateDownloadAssetName ?? downloadedUpdateURL.lastPathComponent,
            progress: 100
        )
    }

    private func sendUpdateState(
        stage: String,
        message: String,
        currentVersion: String? = nil,
        latestVersion: String? = nil,
        tagName: String? = nil,
        assetName: String? = nil,
        releaseURL: String? = nil,
        progress: Double? = nil,
        bytesReceived: Int64? = nil,
        bytesExpected: Int64? = nil
    ) {
        var updateInfo: [String: Any] = [
            "stage": stage,
            "message": message
        ]
        if let currentVersion {
            updateInfo["currentVersion"] = currentVersion
        }
        if let latestVersion {
            updateInfo["latestVersion"] = latestVersion
        }
        if let tagName {
            updateInfo["tagName"] = tagName
        }
        if let assetName {
            updateInfo["assetName"] = assetName
        }
        if let releaseURL {
            updateInfo["releaseURL"] = releaseURL
        }
        if let progress {
            updateInfo["progress"] = progress
        }
        if let bytesReceived {
            updateInfo["bytesReceived"] = bytesReceived
        }
        if let bytesExpected {
            updateInfo["bytesExpected"] = bytesExpected
        }
        sendState(extra: ["updateInfo": updateInfo], includeStore: false)
    }

    private func sendState(
        message: String? = nil,
        error: String? = nil,
        extra: [String: Any] = [:],
        includeStore: Bool = true
    ) {
        guard let webView else { return }
        var payload: [String: Any] = includeStore ? ["store": dictionary(from: store)] : [:]
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
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(refreshMainMenuLocalization(_:)),
            name: menuLanguageDidChangeNotification,
            object: nil
        )
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

        if let devServerURL = frontendDevServerURL() {
            webView.load(URLRequest(url: devServerURL))
        } else if let indexURL = resourceURL(named: "index", extension: "html") {
            webView.loadFileURL(indexURL, allowingReadAccessTo: indexURL.deletingLastPathComponent())
        }
    }

    private func configureMainMenu() {
        let mainMenu = NSMenu()
        let usesEnglish = bridge.currentLanguage() == "en-US"

        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        let quitItem = appMenu.addItem(
            withTitle: usesEnglish ? "Quit \(appDisplayName)" : "退出 \(appDisplayName)",
            action: #selector(NSApplication.terminate(_:)),
            keyEquivalent: "q"
        )
        quitItem.target = NSApp
        appMenu.insertItem(.separator(), at: 0)
        let settingsItem = appMenu.insertItem(
            withTitle: usesEnglish ? "Settings" : "设置",
            action: #selector(openSettings(_:)),
            keyEquivalent: ",",
            at: 0
        )
        settingsItem.target = self
        settingsItem.keyEquivalentModifierMask = [.command]
        let installCliItem = appMenu.insertItem(
            withTitle: usesEnglish ? "Install Command Line Tool" : "安装命令行工具",
            action: #selector(installCommandLineTool(_:)),
            keyEquivalent: "",
            at: 1
        )
        installCliItem.target = self
        let checkForUpdatesItem = appMenu.insertItem(
            withTitle: usesEnglish ? "Check for Updates" : "检查更新",
            action: #selector(checkForUpdates(_:)),
            keyEquivalent: "",
            at: 2
        )
        checkForUpdatesItem.target = self
        appItem.submenu = appMenu
        mainMenu.addItem(appItem)

        let editItem = NSMenuItem()
        let editMenu = NSMenu(title: usesEnglish ? "Edit" : "编辑")
        editMenu.addItem(withTitle: usesEnglish ? "Undo" : "撤销", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(withTitle: usesEnglish ? "Redo" : "重做", action: Selector(("redo:")), keyEquivalent: "Z")
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: usesEnglish ? "Cut" : "剪切", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: usesEnglish ? "Copy" : "复制", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: usesEnglish ? "Paste" : "粘贴", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: usesEnglish ? "Select All" : "全选", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = editMenu
        mainMenu.addItem(editItem)

        let developItem = NSMenuItem()
        let developMenu = NSMenu(title: usesEnglish ? "Develop" : "开发")
        let inspectorItem = developMenu.addItem(
            withTitle: usesEnglish ? "Show Web Inspector" : "显示 Web 检查器",
            action: #selector(openWebInspector(_:)),
            keyEquivalent: "i"
        )
        inspectorItem.target = self
        inspectorItem.keyEquivalentModifierMask = [.command, .option]
        developItem.submenu = developMenu
        mainMenu.addItem(developItem)

        NSApp.mainMenu = mainMenu
    }

    @objc private func refreshMainMenuLocalization(_ notification: Notification) {
        configureMainMenu()
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

    @objc private func checkForUpdates(_ sender: Any?) {
        bridge.checkForUpdatesFromMenu()
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
        NotificationCenter.default.removeObserver(self)
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

    private func frontendDevServerURL() -> URL? {
        let environment = ProcessInfo.processInfo.environment
        if let rawURL = environment["MOCKKIT_FRONTEND_DEV_SERVER"]?.trimmingCharacters(in: .whitespacesAndNewlines),
           !rawURL.isEmpty {
            return URL(string: rawURL)
        }

        let arguments = ProcessInfo.processInfo.arguments
        guard let optionIndex = arguments.firstIndex(of: "--frontend-dev-server"),
              arguments.indices.contains(arguments.index(after: optionIndex)) else {
            return nil
        }

        let rawURL = arguments[arguments.index(after: optionIndex)].trimmingCharacters(in: .whitespacesAndNewlines)
        return rawURL.isEmpty ? nil : URL(string: rawURL)
    }

    private func resourceURL(named name: String, extension fileExtension: String) -> URL? {
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

private func isRunningDevelopmentFrontend() -> Bool {
    let environment = ProcessInfo.processInfo.environment
    if let rawURL = environment["MOCKKIT_FRONTEND_DEV_SERVER"]?.trimmingCharacters(in: .whitespacesAndNewlines),
       !rawURL.isEmpty {
        return true
    }
    return ProcessInfo.processInfo.arguments.contains("--frontend-dev-server")
}

private func githubReleaseFromRedirect(tagName: String, releaseURL: URL) -> GitHubRelease {
    let version = normalizedVersion(tagName)
    let arch = currentMachineArchitecture()
    let assetName = "\(appDisplayName)-\(version)-macos-\(arch).dmg"
    let downloadURL = "https://github.com/zxpzdtom/MockKit/releases/download/\(tagName)/\(assetName)"
    return GitHubRelease(
        tagName: tagName,
        htmlURL: releaseURL.absoluteString,
        assets: [
            GitHubReleaseAsset(
                name: assetName,
                browserDownloadURL: downloadURL
            )
        ]
    )
}

private func normalizedVersion(_ value: String) -> String {
    var normalized = value.trimmingCharacters(in: .whitespacesAndNewlines)
    while normalized.lowercased().hasPrefix("v") {
        normalized.removeFirst()
    }
    return normalized
}

private func compareVersions(_ left: String, _ right: String) -> ComparisonResult {
    let leftParts = versionParts(left)
    let rightParts = versionParts(right)
    let count = max(leftParts.count, rightParts.count, 3)
    for index in 0..<count {
        let leftValue = index < leftParts.count ? leftParts[index] : 0
        let rightValue = index < rightParts.count ? rightParts[index] : 0
        if leftValue < rightValue {
            return .orderedAscending
        }
        if leftValue > rightValue {
            return .orderedDescending
        }
    }
    return .orderedSame
}

private func versionParts(_ value: String) -> [Int] {
    normalizedVersion(value)
        .split { character in
            character == "." || character == "-" || character == "+"
        }
        .map { part in
            let digits = part.prefix { character in character.isNumber }
            return Int(digits) ?? 0
        }
}

private func currentMachineArchitecture() -> String {
    var systemInfo = utsname()
    uname(&systemInfo)
    return withUnsafePointer(to: &systemInfo.machine) { pointer in
        pointer.withMemoryRebound(to: CChar.self, capacity: 1) { machinePointer in
            String(cString: machinePointer)
        }
    }.lowercased()
}

private func uniqueDownloadURL(in directory: URL, filename: String) -> URL {
    let safeFilename = filename.isEmpty ? "MockKit.dmg" : filename
    let baseURL = directory.appendingPathComponent(safeFilename, isDirectory: false)
    if !FileManager.default.fileExists(atPath: baseURL.path) {
        return baseURL
    }

    let pathExtension = baseURL.pathExtension
    let baseName = baseURL.deletingPathExtension().lastPathComponent
    for index in 2...99 {
        let candidateName = pathExtension.isEmpty
            ? "\(baseName) \(index)"
            : "\(baseName) \(index).\(pathExtension)"
        let candidateURL = directory.appendingPathComponent(candidateName, isDirectory: false)
        if !FileManager.default.fileExists(atPath: candidateURL.path) {
            return candidateURL
        }
    }
    return baseURL
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
