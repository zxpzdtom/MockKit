use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::env;
use std::fs;
use std::io::{self, BufRead, Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;
use url::Url;
use uuid::Uuid;

const MANIFEST_NAME: &str = ".mockkit-manifest.json";
const SUCCESS_TEMPLATE_BODY: &str =
    "{\n  \"code\": 200,\n  \"message\": \"success\",\n  \"data\": {}\n}";
const FAILURE_TEMPLATE_BODY: &str =
    "{\n  \"code\": 500,\n  \"message\": \"server error\",\n  \"data\": null\n}";
const EMPTY_TEMPLATE_BODY: &str =
    "{\n  \"code\": 200,\n  \"message\": \"success\",\n  \"data\": []\n}";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CoreRequest {
    command: String,
    store_path: String,
    default_overrides_folder: Option<String>,
    legacy_store_paths: Option<Vec<String>>,
    store: Option<Store>,
    curl: Option<String>,
    fetch_response: Option<bool>,
    ai_request: Option<AiMockRequest>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CoreResponse {
    store: Option<Store>,
    imported: Vec<String>,
    updated: usize,
    written: Vec<String>,
    imported_endpoint_id: Option<String>,
    imported_case_id: Option<String>,
    ai_preview: Option<AiPreviewPayload>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Store {
    overrides_folder: String,
    mock_enabled: bool,
    chrome_profile: Option<ChromeProfileState>,
    ai_settings: Option<AiSettings>,
    ui_settings: Option<UiSettings>,
    group_paths: Option<Vec<String>>,
    endpoints: Vec<Endpoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UiSettings {
    theme: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiSettings {
    #[serde(default)]
    enabled: bool,
    provider: String,
    model: String,
    api_key: String,
    #[serde(default)]
    api_keys: HashMap<String, String>,
    base_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChromeProfileState {
    profile_name: String,
    preferences_path: String,
    local_overrides_enabled: String,
    overrides_folder: Option<String>,
    detected_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Endpoint {
    id: String,
    name: String,
    method: String,
    override_path: String,
    group_path: Option<String>,
    description: String,
    tags: Vec<String>,
    enabled: Option<bool>,
    active_case_id: Option<String>,
    cases: Vec<MockCase>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct MockCase {
    id: String,
    name: String,
    body: String,
    status: i32,
    headers: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PublishManifest {
    managed_files: Vec<String>,
}

#[derive(Debug)]
struct ParsedCurlRequest {
    url: Url,
    method: String,
    headers: HashMap<String, String>,
    body: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiMockRequest {
    mode: String,
    instruction: String,
    endpoint: Value,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiGeneratedPreview {
    cases: Vec<AiGeneratedRawCase>,
}

#[derive(Debug, Serialize, Deserialize)]
struct AiGeneratedRawCase {
    name: String,
    body: Value,
    description: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AiPreviewPayload {
    mode: String,
    cases: Vec<AiGeneratedCase>,
}

#[derive(Debug, Serialize)]
struct AiGeneratedCase {
    name: String,
    body: String,
    description: Option<String>,
}

fn main() {
    if let Err(error) = run() {
        let payload = json!({ "error": error.to_string() });
        println!("{}", payload);
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let args = env::args().collect::<Vec<_>>();
    let request_text = if let Some(path) = args.get(1) {
        fs::read_to_string(path)?
    } else {
        let mut stdin = String::new();
        io::stdin().read_to_string(&mut stdin)?;
        stdin
    };
    let request: CoreRequest = serde_json::from_str(&request_text)?;
    let store_path = PathBuf::from(&request.store_path);

    let response = match request.command.as_str() {
        "load" => {
            ensure_parent_dir(&store_path)?;
            migrate_legacy_store(&store_path, request.legacy_store_paths.as_deref())?;
            let mut store = read_store(&store_path)?.unwrap_or_else(|| {
                default_store(request.default_overrides_folder.as_deref().unwrap_or(""))
            });
            normalize_store(&mut store);
            refresh_chrome_profile(&mut store);
            write_store(&store_path, &store)?;
            CoreResponse {
                store: Some(store),
                imported: vec![],
                updated: 0,
                written: vec![],
                imported_endpoint_id: None,
                imported_case_id: None,
                ai_preview: None,
            }
        }
        "save" => {
            let mut store = require_store(request.store)?;
            normalize_store(&mut store);
            write_store(&store_path, &store)?;
            CoreResponse {
                store: Some(store),
                imported: vec![],
                updated: 0,
                written: vec![],
                imported_endpoint_id: None,
                imported_case_id: None,
                ai_preview: None,
            }
        }
        "sync" => {
            let mut store = require_store(request.store)?;
            normalize_store(&mut store);
            let (imported, updated) = sync_overrides(&mut store)?;
            write_store(&store_path, &store)?;
            CoreResponse {
                store: Some(store),
                imported,
                updated,
                written: vec![],
                imported_endpoint_id: None,
                imported_case_id: None,
                ai_preview: None,
            }
        }
        "publish" => {
            let mut store = require_store(request.store)?;
            normalize_store(&mut store);
            let written = publish(&store)?;
            CoreResponse {
                store: Some(store),
                imported: vec![],
                updated: 0,
                written,
                imported_endpoint_id: None,
                imported_case_id: None,
                ai_preview: None,
            }
        }
        "disable" => {
            let mut store = require_store(request.store)?;
            normalize_store(&mut store);
            disable(&mut store)?;
            write_store(&store_path, &store)?;
            CoreResponse {
                store: Some(store),
                imported: vec![],
                updated: 0,
                written: vec![],
                imported_endpoint_id: None,
                imported_case_id: None,
                ai_preview: None,
            }
        }
        "refreshChromeProfile" => {
            let mut store = require_store(request.store)?;
            normalize_store(&mut store);
            refresh_chrome_profile(&mut store);
            write_store(&store_path, &store)?;
            CoreResponse {
                store: Some(store),
                imported: vec![],
                updated: 0,
                written: vec![],
                imported_endpoint_id: None,
                imported_case_id: None,
                ai_preview: None,
            }
        }
        "importCurl" => {
            let mut store = require_store(request.store)?;
            normalize_store(&mut store);
            let result = import_curl(
                &mut store,
                request.curl.as_deref().unwrap_or(""),
                request.fetch_response.unwrap_or(false),
            )?;
            write_store(&store_path, &store)?;
            let _ = publish(&store)?;
            CoreResponse {
                store: Some(store),
                imported: vec![],
                updated: 0,
                written: vec![],
                imported_endpoint_id: Some(result.0),
                imported_case_id: Some(result.1),
                ai_preview: None,
            }
        }
        "generateAiMock" => {
            let mut store = require_store(request.store)?;
            normalize_store(&mut store);
            let ai_request = request.ai_request.ok_or("missing AI request payload")?;
            let preview = generate_ai_mock(&store, ai_request)?;
            CoreResponse {
                store: Some(store),
                imported: vec![],
                updated: 0,
                written: vec![],
                imported_endpoint_id: None,
                imported_case_id: None,
                ai_preview: Some(preview),
            }
        }
        command => return Err(format!("unknown core command: {command}").into()),
    };

    let response_text = serde_json::to_string(&response)?;
    if let Some(path) = args.get(2) {
        fs::write(path, response_text)?;
    } else {
        println!("{}", response_text);
    }
    Ok(())
}

fn require_store(store: Option<Store>) -> Result<Store, Box<dyn std::error::Error>> {
    store.ok_or_else(|| "missing store payload".into())
}

fn default_store(default_overrides_folder: &str) -> Store {
    Store {
        overrides_folder: default_overrides_folder.to_string(),
        mock_enabled: true,
        chrome_profile: None,
        ai_settings: Some(AiSettings {
            enabled: false,
            provider: "openrouter".to_string(),
            model: String::new(),
            api_key: String::new(),
            api_keys: HashMap::new(),
            base_url: String::new(),
        }),
        ui_settings: Some(UiSettings {
            theme: "mockkit".to_string(),
        }),
        group_paths: Some(vec![]),
        endpoints: vec![],
    }
}

fn refresh_chrome_profile(store: &mut Store) {
    let Some(state) = inspect_chrome_profile() else {
        return;
    };
    if let Some(folder) = &state.overrides_folder {
        if !folder.is_empty() {
            store.overrides_folder = folder.clone();
        }
    }
    store.chrome_profile = Some(state);
}

fn inspect_chrome_profile() -> Option<ChromeProfileState> {
    let home = env::var("HOME").ok()?;
    let chrome_root = PathBuf::from(home)
        .join("Library")
        .join("Application Support")
        .join("Google")
        .join("Chrome");
    let local_state = read_json_object(&chrome_root.join("Local State"));
    let profile_name = local_state
        .as_ref()
        .and_then(|value| value.get("profile"))
        .and_then(|value| value.get("last_used"))
        .and_then(Value::as_str)
        .unwrap_or("Default")
        .to_string();
    let preferences_path = chrome_root.join(&profile_name).join("Preferences");
    let preferences = read_json_object(&preferences_path)?;
    let devtools = preferences.get("devtools").and_then(Value::as_object);
    let devtools_preferences = devtools
        .and_then(|value| value.get("preferences"))
        .and_then(Value::as_object);
    let enabled_value = devtools_preferences
        .and_then(|prefs| {
            prefs
                .get("persistenceNetworkOverridesEnabled")
                .or_else(|| prefs.get("persistence-network-overrides-enabled"))
        })
        .and_then(normalized_bool);
    let local_overrides_enabled = match enabled_value {
        Some(true) => "enabled",
        Some(false) => "disabled",
        None => "unknown",
    }
    .to_string();
    let overrides_folder = devtools
        .and_then(|value| value.get("file_system_paths"))
        .and_then(Value::as_object)
        .and_then(|paths| {
            paths
                .iter()
                .find_map(|(key, value)| (value.as_str() == Some("overrides")).then(|| key.clone()))
        });

    Some(ChromeProfileState {
        profile_name,
        preferences_path: preferences_path.to_string_lossy().to_string(),
        local_overrides_enabled,
        overrides_folder,
        detected_at: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
    })
}

fn read_json_object(path: &Path) -> Option<Value> {
    let data = fs::read(path).ok()?;
    serde_json::from_slice(&data).ok()
}

fn normalized_bool(value: &Value) -> Option<bool> {
    if let Some(bool_value) = value.as_bool() {
        return Some(bool_value);
    }
    let text = value.as_str()?.trim();
    match text {
        "true" => Some(true),
        "false" => Some(false),
        _ => serde_json::from_str::<bool>(text).ok(),
    }
}

fn read_store(path: &Path) -> Result<Option<Store>, Box<dyn std::error::Error>> {
    if !path.exists() {
        return Ok(None);
    }
    let data = fs::read(path)?;
    Ok(Some(serde_json::from_slice(&data)?))
}

fn write_store(path: &Path, store: &Store) -> Result<(), Box<dyn std::error::Error>> {
    ensure_parent_dir(path)?;
    let data = serde_json::to_vec_pretty(store)?;
    fs::write(path, data)?;
    Ok(())
}

fn ensure_parent_dir(path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    Ok(())
}

fn migrate_legacy_store(
    store_path: &Path,
    legacy_paths: Option<&[String]>,
) -> Result<(), Box<dyn std::error::Error>> {
    if store_path.exists() {
        return Ok(());
    }
    for legacy_path in legacy_paths.unwrap_or_default() {
        let source = PathBuf::from(legacy_path);
        if source.exists() {
            if let Some(parent) = store_path.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(source, store_path)?;
            break;
        }
    }
    Ok(())
}

fn sync_overrides(store: &mut Store) -> Result<(Vec<String>, usize), Box<dyn std::error::Error>> {
    let root = PathBuf::from(&store.overrides_folder);
    fs::create_dir_all(&root)?;

    let mut existing_paths: HashMap<String, usize> = HashMap::new();
    for (index, endpoint) in store.endpoints.iter().enumerate() {
        existing_paths
            .entry(endpoint.override_path.clone())
            .or_insert(index);
    }

    let mut imported = vec![];
    let mut updated = 0;
    for file in all_files(&root)? {
        let relative_path = relative_path(&root, &file)?;
        if relative_path == MANIFEST_NAME || relative_path.starts_with('.') {
            continue;
        }

        let body = fs::read_to_string(&file).unwrap_or_default();
        if let Some(endpoint_index) = existing_paths.get(&relative_path).copied() {
            let active_case_id = store.endpoints[endpoint_index]
                .active_case_id
                .clone()
                .or_else(|| {
                    store.endpoints[endpoint_index]
                        .cases
                        .first()
                        .map(|item| item.id.clone())
                });
            if let Some(active_case_id) = active_case_id {
                if let Some(case) = store.endpoints[endpoint_index]
                    .cases
                    .iter_mut()
                    .find(|item| item.id == active_case_id)
                {
                    if case.body != body {
                        case.body = body;
                        updated += 1;
                    }
                }
            }
            continue;
        }

        let case_id = new_id();
        let imported_case = MockCase {
            id: case_id.clone(),
            name: "Default".to_string(),
            body,
            status: 200,
            headers: String::new(),
        };
        let endpoint = Endpoint {
            id: new_id(),
            name: display_name(&relative_path),
            method: "GET".to_string(),
            override_path: relative_path.clone(),
            group_path: None,
            description: "从现有 Chrome Overrides 文件导入。".to_string(),
            tags: vec!["imported".to_string()],
            enabled: Some(true),
            active_case_id: Some(case_id),
            cases: default_cases(Some(imported_case)),
        };
        store.endpoints.push(endpoint);
        existing_paths.insert(relative_path.clone(), store.endpoints.len() - 1);
        imported.push(relative_path);
    }

    normalize_store(store);
    Ok((imported, updated))
}

fn publish(store: &Store) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    let root = PathBuf::from(&store.overrides_folder);
    fs::create_dir_all(&root)?;
    remove_managed_files(&root)?;

    if !store.mock_enabled {
        write_manifest(&root, &[])?;
        return Ok(vec![]);
    }

    let mut written = vec![];
    for endpoint in &store.endpoints {
        if endpoint.enabled == Some(false) {
            continue;
        }
        let selected_case_id = endpoint
            .active_case_id
            .as_ref()
            .or_else(|| endpoint.cases.first().map(|item| &item.id));
        let Some(selected_case_id) = selected_case_id else {
            continue;
        };
        let Some(selected_case) = endpoint
            .cases
            .iter()
            .find(|item| &item.id == selected_case_id)
        else {
            continue;
        };

        let clean_path = sanitized_relative_path(&endpoint.override_path);
        if clean_path.is_empty() {
            continue;
        }
        let target = root.join(&clean_path);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&target, &selected_case.body)?;
        written.push(clean_path);
    }

    write_manifest(&root, &written)?;
    Ok(written)
}

fn disable(store: &mut Store) -> Result<(), Box<dyn std::error::Error>> {
    let root = PathBuf::from(&store.overrides_folder);
    fs::create_dir_all(&root)?;
    remove_managed_files(&root)?;
    store.mock_enabled = false;
    write_manifest(&root, &[])?;
    Ok(())
}

fn import_curl(
    store: &mut Store,
    curl: &str,
    fetch_response: bool,
) -> Result<(String, String), Box<dyn std::error::Error>> {
    let parsed = parse_curl(curl)?;
    let mut response_body = SUCCESS_TEMPLATE_BODY.to_string();
    let mut response_status = 200;
    let mut response_headers = String::new();

    if fetch_response {
        let response = perform_request(&parsed)?;
        response_body = response.0;
        response_status = response.1;
        response_headers = response.2;
    }

    let base_override_path = override_path_for_url(&parsed.url);
    if let Some(endpoint) = store.endpoints.iter_mut().find(|endpoint| {
        endpoint.method == parsed.method && endpoint.override_path == base_override_path
    }) {
        let case_id = new_id();
        let mock_case = MockCase {
            id: case_id.clone(),
            name: unique_case_name(endpoint, "cURL 导入"),
            body: response_body,
            status: response_status,
            headers: response_headers,
        };
        endpoint.cases.push(mock_case);
        endpoint.active_case_id = Some(case_id.clone());
        return Ok((endpoint.id.clone(), case_id));
    }

    let default_case_id = new_id();
    let override_path = unique_override_path(store, &base_override_path);
    let endpoint = Endpoint {
        id: new_id(),
        name: display_name(&override_path),
        method: parsed.method,
        override_path,
        group_path: None,
        description: "从 cURL 导入。".to_string(),
        tags: vec!["curl".to_string()],
        enabled: Some(true),
        active_case_id: Some(default_case_id.clone()),
        cases: vec![
            MockCase {
                id: default_case_id.clone(),
                name: "Default".to_string(),
                body: response_body,
                status: response_status,
                headers: response_headers,
            },
            MockCase {
                id: new_id(),
                name: "成功".to_string(),
                body: SUCCESS_TEMPLATE_BODY.to_string(),
                status: 200,
                headers: String::new(),
            },
            MockCase {
                id: new_id(),
                name: "失败".to_string(),
                body: FAILURE_TEMPLATE_BODY.to_string(),
                status: 500,
                headers: String::new(),
            },
            MockCase {
                id: new_id(),
                name: "空数据".to_string(),
                body: EMPTY_TEMPLATE_BODY.to_string(),
                status: 200,
                headers: String::new(),
            },
        ],
    };
    let endpoint_id = endpoint.id.clone();
    store.endpoints.insert(0, endpoint);
    Ok((endpoint_id, default_case_id))
}

fn unique_case_name(endpoint: &Endpoint, base_name: &str) -> String {
    if !endpoint
        .cases
        .iter()
        .any(|mock_case| mock_case.name == base_name)
    {
        return base_name.to_string();
    }

    for index in 2.. {
        let candidate = format!("{base_name} {index}");
        if !endpoint
            .cases
            .iter()
            .any(|mock_case| mock_case.name == candidate)
        {
            return candidate;
        }
    }
    base_name.to_string()
}

fn perform_request(
    request: &ParsedCurlRequest,
) -> Result<(String, i32, String), Box<dyn std::error::Error>> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()?;
    let method = reqwest::Method::from_bytes(request.method.as_bytes())?;
    let mut builder = client.request(method, request.url.clone());
    for (key, value) in &request.headers {
        builder = builder.header(key, value);
    }
    if let Some(body) = &request.body {
        builder = builder.body(body.clone());
    }

    let response = builder.send()?;
    let status = response.status().as_u16() as i32;
    let headers = response
        .headers()
        .iter()
        .map(|(key, value)| format!("{}: {}", key.as_str(), value.to_str().unwrap_or("")))
        .collect::<Vec<_>>()
        .join("\n");
    let body = response.text()?;
    Ok((body, status, headers))
}

fn parse_curl(curl: &str) -> Result<ParsedCurlRequest, Box<dyn std::error::Error>> {
    let tokens = tokenize_curl(curl);
    if tokens.is_empty() {
        return Err("cURL 内容为空。".into());
    }

    let mut url_string: Option<String> = None;
    let mut method: Option<String> = None;
    let mut headers: HashMap<String, String> = HashMap::new();
    let mut body_parts: Vec<String> = vec![];
    let mut index = if tokens.first().map(String::as_str) == Some("curl") {
        1
    } else {
        0
    };

    while index < tokens.len() {
        let token = &tokens[index];
        match token.as_str() {
            "-X" | "--request" => {
                index += 1;
                if let Some(value) = tokens.get(index) {
                    method = Some(value.to_uppercase());
                }
            }
            "-H" | "--header" => {
                index += 1;
                if let Some(value) = tokens.get(index) {
                    parse_header(value, &mut headers);
                }
            }
            "-d" | "--data" | "--data-raw" | "--data-binary" | "--data-ascii"
            | "--data-urlencode" => {
                index += 1;
                if let Some(value) = tokens.get(index) {
                    body_parts.push(value.clone());
                }
            }
            "-I" | "--head" => {
                method = Some("HEAD".to_string());
            }
            _ => {
                if let Some(value) = token.strip_prefix("--request=") {
                    method = Some(value.to_uppercase());
                } else if let Some(value) = token.strip_prefix("--header=") {
                    parse_header(value, &mut headers);
                } else if token.starts_with("--data-raw=") || token.starts_with("--data=") {
                    let value = token.split_once('=').map(|(_, value)| value).unwrap_or("");
                    body_parts.push(value.to_string());
                } else if !token.starts_with('-') && url_string.is_none() {
                    url_string = Some(token.clone());
                }
            }
        }
        index += 1;
    }

    let Some(url_string) = url_string else {
        return Err("没有从 cURL 中解析到有效 URL。".into());
    };
    let url = Url::parse(&url_string).map_err(|_| "没有从 cURL 中解析到有效 URL。")?;
    if url.host_str().is_none() {
        return Err("没有从 cURL 中解析到有效 URL。".into());
    }

    let body = if body_parts.is_empty() {
        None
    } else {
        Some(body_parts.join("&"))
    };
    let resolved_method = method.unwrap_or_else(|| {
        if body.is_some() {
            "POST".to_string()
        } else {
            "GET".to_string()
        }
    });

    Ok(ParsedCurlRequest {
        url,
        method: resolved_method,
        headers,
        body,
    })
}

fn parse_header(header: &str, headers: &mut HashMap<String, String>) {
    if let Some((key, value)) = header.split_once(':') {
        let key = key.trim();
        if !key.is_empty() {
            headers.insert(key.to_string(), value.trim().to_string());
        }
    }
}

fn tokenize_curl(source: &str) -> Vec<String> {
    let mut tokens = vec![];
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut escaping = false;
    let source = source.replace("\\\n", " ");

    for character in source.chars() {
        if escaping {
            current.push(character);
            escaping = false;
            continue;
        }
        if character == '\\' {
            escaping = true;
            continue;
        }
        if let Some(active_quote) = quote {
            if character == active_quote {
                quote = None;
            } else {
                current.push(character);
            }
            continue;
        }
        if character == '\'' || character == '"' {
            quote = Some(character);
            continue;
        }
        if character.is_whitespace() {
            if !current.is_empty() {
                tokens.push(std::mem::take(&mut current));
            }
        } else {
            current.push(character);
        }
    }

    if !current.is_empty() {
        tokens.push(current);
    }
    tokens
}

fn override_path_for_url(url: &Url) -> String {
    let host = url.host_str().unwrap_or("localhost");
    let mut path = url.path().to_string();
    if path.is_empty() || path == "/" {
        path = "/index.json".to_string();
    }
    if let Some(query) = url.query() {
        if !query.is_empty() {
            path.push('?');
            path.push_str(query);
        }
    }
    sanitized_relative_path(&format!("{host}{path}"))
}

fn unique_override_path(store: &Store, base_path: &str) -> String {
    let used_paths = store
        .endpoints
        .iter()
        .map(|endpoint| endpoint.override_path.as_str())
        .collect::<HashSet<_>>();
    if !used_paths.contains(base_path) {
        return base_path.to_string();
    }

    let components = base_path.split('/').collect::<Vec<_>>();
    let Some(last) = components.last() else {
        return base_path.to_string();
    };
    let directory = components[..components.len().saturating_sub(1)].join("/");
    let question_index = last.find('?');
    let dot_index = last.rfind('.');
    let has_extension = dot_index.is_some()
        && question_index
            .map(|question_index| dot_index.unwrap() < question_index)
            .unwrap_or(true);
    let (stem, suffix) = if has_extension {
        let dot_index = dot_index.unwrap();
        (&last[..dot_index], &last[dot_index..])
    } else {
        (*last, "")
    };

    for index in 2.. {
        let candidate_name = format!("{stem}-{index}{suffix}");
        let candidate = if directory.is_empty() {
            candidate_name
        } else {
            format!("{directory}/{candidate_name}")
        };
        if !used_paths.contains(candidate.as_str()) {
            return candidate;
        }
    }
    base_path.to_string()
}

fn generate_ai_mock(
    store: &Store,
    request: AiMockRequest,
) -> Result<AiPreviewPayload, Box<dyn std::error::Error>> {
    emit_ai_progress("preparing", "正在准备 AI 请求...", None, None);
    let settings = store.ai_settings.clone().unwrap_or(AiSettings {
        enabled: false,
        provider: "openrouter".to_string(),
        model: String::new(),
        api_key: String::new(),
        api_keys: HashMap::new(),
        base_url: String::new(),
    });
    if !settings.enabled {
        return Err("AI 功能未启用。".into());
    }
    let provider_api_keys = settings
        .api_keys
        .get(&settings.provider)
        .map(String::as_str)
        .unwrap_or("");
    let api_key_text = if settings.api_key.trim().is_empty() {
        provider_api_keys
    } else {
        settings.api_key.as_str()
    };
    let api_key = api_key_text
        .split([',', '\n'])
        .map(str::trim)
        .find(|value| !value.is_empty())
        .unwrap_or("");
    if api_key.is_empty() {
        return Err("请先配置 AI API Key。".into());
    }
    if settings.model.trim().is_empty() {
        return Err("请先配置 AI 模型。".into());
    }

    let base_url = ai_base_url(&settings);
    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
    let timeout = if settings.provider == "openrouter" || settings.provider == "gemini" {
        120
    } else {
        90
    };
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(timeout))
        .build()?;

    let mut body = json!({
        "model": settings.model.trim(),
        "temperature": 0.2,
        "messages": [
            {
                "role": "user",
                "content": ai_prompt(&request.mode, &request.instruction, &request.endpoint)
            }
        ]
    });
    body["stream"] = json!(true);
    if settings.provider != "gemini" {
        body["response_format"] = json!({ "type": "json_object" });
        body["max_tokens"] = json!(if request.mode == "multiple" {
            2400
        } else {
            1400
        });
    }

    let mut builder = client
        .post(url)
        .bearer_auth(api_key)
        .header("Content-Type", "application/json")
        .json(&body);
    if settings.provider == "openrouter" {
        builder = builder
            .header("X-OpenRouter-Title", "MockKit")
            .header("HTTP-Referer", "https://github.com");
    }

    emit_ai_progress("connecting", "已连接 AI 服务，等待流式响应...", None, None);
    let response = builder.send()?;
    let status = response.status();
    if !status.is_success() {
        let response_text = response.text()?;
        return Err(format_ai_error(status.as_u16(), &response_text).into());
    }

    let content = read_ai_stream(response)?;
    emit_ai_progress(
        "parsing",
        "正在解析 AI 返回的 JSON...",
        None,
        Some(&content),
    );
    let json_text = extract_json_object(&content)?;
    let preview: AiGeneratedPreview = match serde_json::from_str(&json_text) {
        Ok(preview) => preview,
        Err(error) => {
            return Ok(AiPreviewPayload {
                mode: request.mode,
                cases: vec![AiGeneratedCase {
                    name: "AI 原始输出".to_string(),
                    body: pretty_printed_body(&content),
                    description: Some(format!("AI 返回未能解析为结构化 JSON：{error}")),
                }],
            });
        }
    };
    if preview.cases.is_empty() {
        return Err("AI 没有返回可用场景。".into());
    }
    let cases = preview
        .cases
        .into_iter()
        .map(|item| AiGeneratedCase {
            name: if item.name.trim().is_empty() {
                "AI 场景".to_string()
            } else {
                item.name.trim().to_string()
            },
            body: generated_body_to_string(&item.body),
            description: item.description,
        })
        .collect();

    Ok(AiPreviewPayload {
        mode: request.mode,
        cases,
    })
}

fn read_ai_stream(
    response: reqwest::blocking::Response,
) -> Result<String, Box<dyn std::error::Error>> {
    let reader = io::BufReader::new(response);
    let mut content = String::new();
    let mut bytes = 0usize;
    let mut has_stream_event = false;

    for line in reader.lines() {
        let line = line?;
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with(':') {
            continue;
        }
        let Some(data) = trimmed.strip_prefix("data:").map(str::trim) else {
            continue;
        };
        has_stream_event = true;
        if data == "[DONE]" {
            break;
        }
        let Ok(object) = serde_json::from_str::<Value>(data) else {
            continue;
        };
        if let Some(error) = object
            .get("error")
            .and_then(|error| error.get("message"))
            .and_then(Value::as_str)
        {
            return Err(error.to_string().into());
        }
        let delta = object
            .get("choices")
            .and_then(Value::as_array)
            .and_then(|choices| choices.first())
            .and_then(|choice| choice.get("delta"))
            .and_then(extract_stream_content)
            .unwrap_or_default();
        if delta.is_empty() {
            continue;
        }
        bytes += delta.len();
        content.push_str(&delta);
        emit_ai_progress(
            "streaming",
            "正在接收 AI 返回...",
            Some(bytes),
            Some(&content),
        );
    }

    if content.trim().is_empty() {
        if has_stream_event {
            return Err("AI 返回内容为空。".into());
        }
        return Err("AI 没有返回流式响应。".into());
    }
    Ok(content)
}

fn extract_stream_content(value: &Value) -> Option<String> {
    if let Some(content) = value.get("content").and_then(Value::as_str) {
        return Some(content.to_string());
    }
    if let Some(parts) = value.get("content").and_then(Value::as_array) {
        return Some(
            parts
                .iter()
                .filter_map(|part| {
                    part.get("text")
                        .or_else(|| part.get("content"))
                        .and_then(Value::as_str)
                })
                .collect::<Vec<_>>()
                .join(""),
        );
    }
    None
}

fn emit_ai_progress(stage: &str, message: &str, bytes: Option<usize>, content: Option<&str>) {
    if env::var("MOCKKIT_AI_PROGRESS").ok().as_deref() != Some("1") {
        return;
    }
    let payload = json!({
        "stage": stage,
        "message": message,
        "bytes": bytes,
        "content": content,
    });
    eprintln!("MOCKKIT_EVENT:{payload}");
    let _ = io::stderr().flush();
}

fn ai_base_url(settings: &AiSettings) -> String {
    match settings.provider.as_str() {
        "compatible" => settings.base_url.clone(),
        "openai" => "https://api.openai.com/v1".to_string(),
        "gemini" => "https://generativelanguage.googleapis.com/v1beta/openai".to_string(),
        _ => "https://openrouter.ai/api/v1".to_string(),
    }
}

fn ai_prompt(mode: &str, instruction: &str, endpoint: &Value) -> String {
    let name = endpoint.get("name").and_then(Value::as_str).unwrap_or("");
    let method = endpoint
        .get("method")
        .and_then(Value::as_str)
        .unwrap_or("GET");
    let override_path = endpoint
        .get("overridePath")
        .and_then(Value::as_str)
        .unwrap_or("");
    let description = endpoint
        .get("description")
        .and_then(Value::as_str)
        .unwrap_or("");
    let active_case_name = endpoint
        .get("activeCaseName")
        .and_then(Value::as_str)
        .unwrap_or("Default");
    let active_body = endpoint
        .get("activeBody")
        .and_then(Value::as_str)
        .unwrap_or("");
    let case_summary = endpoint
        .get("cases")
        .and_then(Value::as_array)
        .map(|cases| {
            cases
                .iter()
                .map(|item| {
                    let case_name = item.get("name").and_then(Value::as_str).unwrap_or("未命名");
                    let body = item.get("body").and_then(Value::as_str).unwrap_or("");
                    format!("场景：{case_name}\n{}", truncate_chars(body, 1200))
                })
                .collect::<Vec<_>>()
                .join("\n\n")
        })
        .unwrap_or_default();
    let target = if mode == "multiple" {
        "基于当前响应结构派生多个 Mock 返回场景"
    } else {
        "基于当前响应结构改写当前场景的 Mock 响应体"
    };
    let instruction = if instruction.is_empty() {
        "保留当前响应结构，优先通过字段值、数组长度、布尔值、空值和边界值变化生成合理 Mock。"
    } else {
        instruction
    };

    format!(
        r#"你是一个资深前端接口 Mock 数据设计助手。请根据接口信息{target}。
必须只返回 JSON 对象，不要 Markdown，不要解释，不要代码围栏。

返回格式固定为，body 优先直接返回 JSON 对象或数组，不要把 JSON 再包成字符串：
{{
  "cases": [
    {{
      "name": "场景名称",
      "body": {{"code": 200}},
      "description": "可选说明"
    }}
  ]
}}

要求：
- 如果响应体是 JSON，body 必须是 JSON 对象或数组；只有原响应不是 JSON 时，body 才可以是字符串。
- 优先保留当前响应的 JSON 结构、字段层级和数据类型，只做必要字段值改写。
- 用户要求通常是结构内变量改写：例如数组条数、字符串长度、数字边界、bool true/false、null/空对象/空数组、状态码或业务 code/message。
- 除非用户明确要求新增字段，否则不要大幅扩展结构；可以按现有数组元素结构复制/删减元素来满足列表长度要求。
- Mock 数据要像真实业务数据，不要用 foo/bar。
- 多场景模式优先围绕当前结构生成差异场景，例如空列表、单条列表、多条列表、布尔值切换、边界数值、未登录、无权限、业务失败，但不要重复已有含义。
- 单场景模式只返回 1 个 case，名称沿用当前场景名。
- 失败场景要保持和成功场景相近的顶层结构。
- 如果接口看起来不是 JSON，也可以返回纯文本 body。

接口名称：{name}
请求方法：{method}
Override 路径：{override_path}
说明：{}
当前场景：{active_case_name}
用户要求：{instruction}

当前响应体：
{}

已有场景摘要：
{case_summary}
"#,
        if description.is_empty() {
            "无"
        } else {
            description
        },
        truncate_chars(active_body, 8000)
    )
}

fn extract_json_object(text: &str) -> Result<String, Box<dyn std::error::Error>> {
    let source = text.replace("```json", "```").trim().to_string();
    let unfenced = if let Some(start) = source.find("```") {
        let rest = &source[start + 3..];
        if let Some(end) = rest.find("```") {
            rest[..end].to_string()
        } else {
            source
        }
    } else {
        source
    };
    let Some(start) = unfenced.find('{') else {
        return Err("AI 没有返回 JSON。".into());
    };
    let Some(end) = unfenced.rfind('}') else {
        return Err("AI 没有返回 JSON。".into());
    };
    if start > end {
        return Err("AI 没有返回 JSON。".into());
    }
    Ok(unfenced[start..=end].to_string())
}

fn generated_body_to_string(body: &Value) -> String {
    if let Some(text) = body.as_str() {
        return pretty_printed_body(text);
    }
    serde_json::to_string_pretty(body).unwrap_or_else(|_| body.to_string())
}

fn pretty_printed_body(body: &str) -> String {
    let trimmed = body.trim();
    let Ok(value) = serde_json::from_str::<Value>(trimmed) else {
        return body.to_string();
    };
    serde_json::to_string_pretty(&value).unwrap_or_else(|_| body.to_string())
}

fn format_ai_error(status: u16, text: &str) -> String {
    if let Ok(object) = serde_json::from_str::<Value>(text) {
        if let Some(message) = object
            .get("error")
            .and_then(|error| error.get("message"))
            .and_then(Value::as_str)
        {
            return format!("AI 请求失败（{status}）：{message}");
        }
    }
    format!("AI 请求失败（{status}）：{}", truncate_chars(text, 240))
}

fn truncate_chars(value: &str, max: usize) -> String {
    value.chars().take(max).collect()
}

fn all_files(root: &Path) -> Result<Vec<PathBuf>, Box<dyn std::error::Error>> {
    let mut files = vec![];
    collect_files(root, &mut files)?;
    Ok(files)
}

fn collect_files(path: &Path, files: &mut Vec<PathBuf>) -> Result<(), Box<dyn std::error::Error>> {
    if !path.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let path = entry.path();
        if entry.file_name().to_string_lossy().starts_with('.') {
            continue;
        }
        if path.is_dir() {
            collect_files(&path, files)?;
        } else if path.is_file() {
            files.push(path);
        }
    }
    Ok(())
}

fn relative_path(root: &Path, file: &Path) -> Result<String, Box<dyn std::error::Error>> {
    let relative = file.strip_prefix(root)?;
    Ok(relative
        .components()
        .map(|component| component.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/"))
}

fn remove_managed_files(root: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let manifest_path = root.join(MANIFEST_NAME);
    if !manifest_path.exists() {
        return Ok(());
    }
    let data = fs::read(&manifest_path)?;
    let manifest: PublishManifest = serde_json::from_slice(&data)?;
    for relative_path in manifest.managed_files {
        let clean_path = sanitized_relative_path(&relative_path);
        if clean_path.is_empty() {
            continue;
        }
        let target = root.join(clean_path);
        if target.exists() {
            fs::remove_file(&target)?;
        }
        if let Some(parent) = target.parent() {
            prune_empty_directories(parent, root);
        }
    }
    Ok(())
}

fn write_manifest(root: &Path, managed_files: &[String]) -> Result<(), Box<dyn std::error::Error>> {
    let manifest = PublishManifest {
        managed_files: managed_files.to_vec(),
    };
    fs::write(
        root.join(MANIFEST_NAME),
        serde_json::to_vec_pretty(&manifest)?,
    )?;
    Ok(())
}

fn prune_empty_directories(start: &Path, root: &Path) {
    let mut current = start.to_path_buf();
    while current.starts_with(root) && current != root {
        let is_empty = fs::read_dir(&current)
            .map(|mut entries| entries.next().is_none())
            .unwrap_or(false);
        if !is_empty {
            return;
        }
        if fs::remove_dir(&current).is_err() {
            return;
        }
        let Some(parent) = current.parent() else {
            return;
        };
        current = parent.to_path_buf();
    }
}

fn normalize_store(store: &mut Store) {
    if store.ai_settings.is_none() {
        store.ai_settings = Some(AiSettings {
            enabled: false,
            provider: "openrouter".to_string(),
            model: String::new(),
            api_key: String::new(),
            api_keys: HashMap::new(),
            base_url: String::new(),
        });
    }
    if store.ui_settings.is_none() {
        store.ui_settings = Some(UiSettings {
            theme: "mockkit".to_string(),
        });
    }
    let mut group_paths = store
        .group_paths
        .take()
        .unwrap_or_default()
        .into_iter()
        .map(|path| sanitized_relative_path(&path))
        .filter(|path| !path.is_empty())
        .collect::<Vec<_>>();
    group_paths.sort();
    group_paths.dedup();
    store.group_paths = Some(group_paths);
    normalize_duplicate_endpoints(store);
    for endpoint in &mut store.endpoints {
        if endpoint.active_case_id.is_none() {
            endpoint.active_case_id = endpoint.cases.first().map(|item| item.id.clone());
        }
        normalize_default_cases(endpoint);
        normalize_active_case(endpoint);
        endpoint.group_path = endpoint
            .group_path
            .as_deref()
            .map(sanitized_relative_path)
            .filter(|path| !path.is_empty());
        if is_version_segment(&endpoint.name) {
            let better_name = display_name(&endpoint.override_path);
            if better_name != endpoint.name {
                endpoint.name = better_name;
            }
        }
    }
}

fn default_cases(imported: Option<MockCase>) -> Vec<MockCase> {
    vec![
        imported.unwrap_or_else(|| MockCase {
            id: new_id(),
            name: "Default".to_string(),
            body: SUCCESS_TEMPLATE_BODY.to_string(),
            status: 200,
            headers: String::new(),
        }),
        MockCase {
            id: new_id(),
            name: "成功".to_string(),
            body: SUCCESS_TEMPLATE_BODY.to_string(),
            status: 200,
            headers: String::new(),
        },
        MockCase {
            id: new_id(),
            name: "失败".to_string(),
            body: FAILURE_TEMPLATE_BODY.to_string(),
            status: 500,
            headers: String::new(),
        },
        MockCase {
            id: new_id(),
            name: "空数据".to_string(),
            body: EMPTY_TEMPLATE_BODY.to_string(),
            status: 200,
            headers: String::new(),
        },
    ]
}

fn normalize_default_cases(endpoint: &mut Endpoint) {
    let original_case_order = endpoint
        .cases
        .iter()
        .map(|item| item.id.clone())
        .collect::<Vec<_>>();

    for mock_case in &mut endpoint.cases {
        if mock_case.name == "导入内容" {
            mock_case.name = "Default".to_string();
        }
    }

    if endpoint.cases.is_empty() {
        endpoint.cases = default_cases(None);
        endpoint.active_case_id = endpoint.cases.first().map(|item| item.id.clone());
        return;
    }

    if endpoint.tags.iter().any(|tag| tag == "imported")
        && !endpoint.cases.iter().any(|item| item.name == "Default")
    {
        endpoint.cases[0].name = "Default".to_string();
    }

    let order = ["Default", "成功", "失败", "空数据"];
    endpoint.cases.sort_by(|left, right| {
        let left_order = order
            .iter()
            .position(|item| item == &left.name)
            .unwrap_or(order.len());
        let right_order = order
            .iter()
            .position(|item| item == &right.name)
            .unwrap_or(order.len());
        left_order.cmp(&right_order).then_with(|| {
            let left_original = original_case_order
                .iter()
                .position(|item| item == &left.id)
                .unwrap_or(usize::MAX);
            let right_original = original_case_order
                .iter()
                .position(|item| item == &right.id)
                .unwrap_or(usize::MAX);
            left_original.cmp(&right_original)
        })
    });
}

fn normalize_duplicate_endpoints(store: &mut Store) {
    let mut first_index_by_path: HashMap<String, usize> = HashMap::new();
    let mut normalized: Vec<Endpoint> = vec![];

    for endpoint in store.endpoints.drain(..) {
        let clean_path = sanitized_relative_path(&endpoint.override_path);
        if clean_path.is_empty() {
            continue;
        }

        let mut next_endpoint = endpoint;
        next_endpoint.override_path = clean_path.clone();

        if let Some(existing_index) = first_index_by_path.get(&clean_path).copied() {
            let mut merged = normalized[existing_index].clone();
            let known_case_ids = merged
                .cases
                .iter()
                .map(|item| item.id.clone())
                .collect::<HashSet<_>>();
            for mock_case in next_endpoint.cases {
                if !known_case_ids.contains(&mock_case.id) {
                    merged.cases.push(mock_case);
                }
            }
            normalize_active_case(&mut merged);
            if merged.active_case_id.is_none() {
                merged.active_case_id = next_endpoint
                    .active_case_id
                    .or_else(|| merged.cases.first().map(|item| item.id.clone()));
            }
            if merged.description.is_empty() {
                merged.description = next_endpoint.description;
            }
            let mut tags = merged
                .tags
                .into_iter()
                .chain(next_endpoint.tags)
                .collect::<Vec<_>>();
            tags.sort();
            tags.dedup();
            merged.tags = tags;
            normalized[existing_index] = merged;
        } else {
            first_index_by_path.insert(clean_path, normalized.len());
            normalized.push(next_endpoint);
        }
    }

    store.endpoints = normalized;
}

fn normalize_active_case(endpoint: &mut Endpoint) {
    if let Some(active_case_id) = &endpoint.active_case_id {
        if !endpoint.cases.iter().any(|item| &item.id == active_case_id) {
            endpoint.active_case_id = endpoint.cases.first().map(|item| item.id.clone());
        }
    }
}

fn display_name(path: &str) -> String {
    let parts = path.split('/').collect::<Vec<_>>();
    let Some(last) = parts.last() else {
        return path.to_string();
    };
    let clean_last = last.split('?').next().unwrap_or(last);
    if is_version_segment(clean_last) && parts.len() >= 2 {
        return parts[parts.len() - 2].to_string();
    }
    clean_last.to_string()
}

fn is_version_segment(value: &str) -> bool {
    let parts = value.split('.').collect::<Vec<_>>();
    parts.len() >= 2
        && parts.iter().all(|part| {
            !part.is_empty() && part.chars().all(|character| character.is_ascii_digit())
        })
}

fn sanitized_relative_path(path: &str) -> String {
    path.split('/')
        .filter(|segment| !segment.is_empty() && *segment != "." && *segment != "..")
        .collect::<Vec<_>>()
        .join("/")
}

fn new_id() -> String {
    Uuid::new_v4().to_string()
}
