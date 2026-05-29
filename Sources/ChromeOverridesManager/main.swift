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
    var apiKey: String
    var apiKeys: [String: String]?
    var baseUrl: String
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

struct CoreRequest: Codable {
    var command: String
    var storePath: String
    var defaultOverridesFolder: String?
    var legacyStorePaths: [String]?
    var store: Store?
    var curl: String?
    var fetchResponse: Bool?
    var aiRequest: AiMockRequestPayload?

    init(
        command: String,
        storePath: String,
        defaultOverridesFolder: String? = nil,
        legacyStorePaths: [String]? = nil,
        store: Store? = nil,
        curl: String? = nil,
        fetchResponse: Bool? = nil,
        aiRequest: AiMockRequestPayload? = nil
    ) {
        self.command = command
        self.storePath = storePath
        self.defaultOverridesFolder = defaultOverridesFolder
        self.legacyStorePaths = legacyStorePaths
        self.store = store
        self.curl = curl
        self.fetchResponse = fetchResponse
        self.aiRequest = aiRequest
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
        case "generateAiMock":
            timeout = 90
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

    func revealOverridesFolder(store: Store, relativePath: String? = nil) {
        let root = URL(fileURLWithPath: store.overridesFolder, isDirectory: true)
        let cleanPath = sanitizedRelativePath(relativePath ?? "")
        let url = cleanPath.isEmpty ? root : root.appendingPathComponent(cleanPath, isDirectory: true)
        try? fileManager.createDirectory(at: url, withIntermediateDirectories: true)
        NSWorkspace.shared.open(url)
    }

    func defaultAiSettings() -> AiSettings {
        AiSettings(enabled: false, provider: "openrouter", model: "", apiKey: "", apiKeys: [:], baseUrl: "")
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
                let result = try storeController.syncOverrides(store: &store)
                sendResult(message: "已同步：新增 \(result.imported.count) 个，更新 \(result.updated) 个。")
            case "syncFiles":
                let result = try storeController.syncOverrides(store: &store)
                if !result.imported.isEmpty || result.updated > 0 {
                    sendState()
                }
            case "publish":
                let written = try storeController.publish(store: store)
                sendResult(message: "已发布 \(written.count) 个托管 Override 文件。")
            case "disable":
                try storeController.disable(store: &store)
                sendResult(message: "Mock 已禁用，托管文件已移除。")
            case "revealFolder":
                storeController.revealOverridesFolder(store: store, relativePath: payload["path"] as? String)
            case "refreshChromeProfile":
                try storeController.refreshChromeProfile(store: &store)
                sendResult(message: "已重新检测 Chrome Profile。")
            case "importCurl":
                let curl = payload["curl"] as? String ?? ""
                let fetchResponse = payload["fetchResponse"] as? Bool ?? false
                try importCurl(curl, fetchResponse: fetchResponse)
            case "generateAiMock":
                let request = payload["aiRequest"] as? [String: Any] ?? [:]
                try startGenerateAiMock(request)
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

    private func sendAiProgress(stage: String, message: String) {
        sendAiProgress(AiProgressPayload(stage: stage, message: message, bytes: nil, content: nil))
    }

    private func sendAiProgress(_ progress: AiProgressPayload) {
        sendState(extra: ["aiProgress": dictionary(from: progress)])
    }

    private func importCurl(_ curl: String, fetchResponse: Bool) throws {
        let result = try storeController.importCurl(store: &store, curl: curl, fetchResponse: fetchResponse)
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
        let requestedAiEnabled = ((rawStore as? [String: Any])?["aiSettings"] as? [String: Any])?["enabled"] as? Bool
        let data = try JSONSerialization.data(withJSONObject: rawStore ?? [:])
        store = try JSONDecoder().decode(Store.self, from: data)
        if store.aiSettings == nil {
            store.aiSettings = storeController.defaultAiSettings()
        }
        if store.uiSettings == nil {
            store.uiSettings = storeController.defaultUiSettings()
        }
        if store.aiSettings?.enabled == nil {
            store.aiSettings?.enabled = requestedAiEnabled ?? false
        }
        try storeController.saveNormalized(store: &store)
        if let requestedAiEnabled {
            if store.aiSettings == nil {
                store.aiSettings = storeController.defaultAiSettings()
            }
            store.aiSettings?.enabled = requestedAiEnabled
        }
        _ = try storeController.publish(store: store)
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
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
