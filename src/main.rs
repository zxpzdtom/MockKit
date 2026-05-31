use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::env;
use std::fs;
use std::io::{self, BufRead, IsTerminal, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::OnceLock;
use std::thread;
use std::time::{Duration, Instant};
use url::Url;
use uuid::Uuid;

const MANIFEST_NAME: &str = ".mockkit-manifest.json";
const APP_NAME: &str = "MockKit";
const LEGACY_APP_NAMES: [&str; 2] = ["Overrides Studio", "Chrome Overrides Manager"];
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
    ai_metadata_request: Option<AiMetadataRequest>,
    ai_grouping_request: Option<AiGroupingRequest>,
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
    ai_metadata_preview: Option<AiMetadataPreviewPayload>,
    ai_grouping_preview: Option<AiGroupingPreviewPayload>,
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
    #[serde(default)]
    models: HashMap<String, String>,
    api_key: String,
    #[serde(default)]
    api_keys: HashMap<String, String>,
    base_url: String,
    #[serde(default)]
    ai_grouping_prompt: String,
    cli_preset_id: Option<String>,
    #[serde(default)]
    cli_presets: Vec<AiCliPreset>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiCliPreset {
    id: String,
    name: String,
    #[serde(default)]
    model: String,
    command: String,
    stream_mode: String,
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
    basic_auth: Option<(String, Option<String>)>,
    accept_invalid_certs: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiMockRequest {
    mode: String,
    instruction: String,
    endpoint: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiMetadataRequest {
    instruction: String,
    endpoint: AiMetadataEndpointContext,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiMetadataEndpointContext {
    id: String,
    name: String,
    method: String,
    override_path: String,
    group_path: Option<String>,
    description: String,
    tags: Vec<String>,
    active_case_name: String,
    active_body: String,
    cases: Vec<AiMetadataCaseContext>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiMetadataCaseContext {
    name: String,
    body: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiGroupingRequest {
    instruction: String,
    endpoints: Vec<AiGroupingEndpointContext>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiGroupingEndpointContext {
    id: String,
    name: String,
    method: String,
    override_path: String,
    group_path: Option<String>,
    description: String,
    tags: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiGroupingPreviewPayload {
    groups: Vec<AiGroupingAssignment>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiGroupingAssignment {
    endpoint_id: String,
    group_path: String,
    reason: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiMetadataPreviewPayload {
    #[serde(default)]
    endpoint_id: String,
    name: String,
    description: String,
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CliStreamMode {
    PlainText,
    JsonEvents,
    ClaudeStreamJson,
}

#[derive(Debug)]
struct CliCommandOutput {
    stdout: String,
    content: String,
    streamed_content: bool,
}

fn main() {
    if let Err(error) = run_entry() {
        let payload = json!({ "error": error.to_string() });
        println!("{}", payload);
        std::process::exit(1);
    }
}

fn run_entry() -> Result<(), Box<dyn std::error::Error>> {
    let args = env::args().collect::<Vec<_>>();
    if should_run_cli(&args) {
        return run_cli(&args[1..]);
    }
    run_core_protocol(&args)
}

fn should_run_cli(args: &[String]) -> bool {
    let Some(first) = args.get(1).map(String::as_str) else {
        return false;
    };
    if matches!(first, "--json" | "--store" | "--overrides")
        || first.starts_with("--store=")
        || first.starts_with("--overrides=")
    {
        return true;
    }
    matches!(
        first,
        "-h" | "--help"
            | "help"
            | "status"
            | "list"
            | "show"
            | "get"
            | "scan"
            | "sync"
            | "publish"
            | "disable"
            | "enable"
            | "edit"
            | "update"
            | "case"
            | "add-case"
            | "update-case"
            | "edit-case"
            | "delete-case"
            | "remove-case"
            | "import-curl"
            | "use"
            | "set-case"
    )
}

fn run_core_protocol(args: &[String]) -> Result<(), Box<dyn std::error::Error>> {
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
                ai_metadata_preview: None,
                ai_grouping_preview: None,
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
                ai_metadata_preview: None,
                ai_grouping_preview: None,
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
                ai_metadata_preview: None,
                ai_grouping_preview: None,
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
                ai_metadata_preview: None,
                ai_grouping_preview: None,
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
                ai_metadata_preview: None,
                ai_grouping_preview: None,
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
                ai_metadata_preview: None,
                ai_grouping_preview: None,
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
                ai_metadata_preview: None,
                ai_grouping_preview: None,
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
                ai_metadata_preview: None,
                ai_grouping_preview: None,
            }
        }
        "generateAiMetadata" => {
            let mut store = require_store(request.store)?;
            normalize_store(&mut store);
            let ai_request = request
                .ai_metadata_request
                .ok_or("missing AI metadata request payload")?;
            let preview = generate_ai_metadata(&store, ai_request)?;
            CoreResponse {
                store: Some(store),
                imported: vec![],
                updated: 0,
                written: vec![],
                imported_endpoint_id: None,
                imported_case_id: None,
                ai_preview: None,
                ai_metadata_preview: Some(preview),
                ai_grouping_preview: None,
            }
        }
        "generateAiGrouping" => {
            let mut store = require_store(request.store)?;
            normalize_store(&mut store);
            let ai_request = request
                .ai_grouping_request
                .ok_or("missing AI grouping request payload")?;
            let preview = generate_ai_grouping(&store, ai_request)?;
            CoreResponse {
                store: Some(store),
                imported: vec![],
                updated: 0,
                written: vec![],
                imported_endpoint_id: None,
                imported_case_id: None,
                ai_preview: None,
                ai_metadata_preview: None,
                ai_grouping_preview: Some(preview),
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

#[derive(Debug)]
struct CliOptions {
    store_path: PathBuf,
    overrides_folder: Option<String>,
    migrate_legacy: bool,
    json: bool,
}

fn run_cli(args: &[String]) -> Result<(), Box<dyn std::error::Error>> {
    let (options, remaining) = parse_cli_options(args)?;
    let command = remaining.first().map(String::as_str).unwrap_or("help");

    match command {
        "-h" | "--help" | "help" => {
            print_cli_help();
            Ok(())
        }
        "status" => cli_status(&options),
        "list" => cli_list(&options),
        "show" | "get" => cli_show(&options, &remaining[1..]),
        "scan" | "sync" => cli_scan(&options),
        "publish" => cli_publish(&options),
        "disable" => cli_disable(&options, &remaining[1..]),
        "enable" => cli_set_enabled(&options, &remaining[1..], true),
        "edit" | "update" => cli_edit_endpoint(&options, &remaining[1..]),
        "case" => cli_case(&options, &remaining[1..]),
        "add-case" => cli_case_add(&options, &remaining[1..]),
        "update-case" | "edit-case" => cli_case_update(&options, &remaining[1..]),
        "delete-case" | "remove-case" => cli_case_delete(&options, &remaining[1..]),
        "import-curl" => cli_import_curl(&options, &remaining[1..]),
        "use" | "set-case" => cli_use_case(&options, &remaining[1..]),
        _ => Err(format!("unknown CLI command: {command}. Run `mockkit help`.").into()),
    }
}

fn parse_cli_options(
    args: &[String],
) -> Result<(CliOptions, Vec<String>), Box<dyn std::error::Error>> {
    let mut store_path: Option<PathBuf> = None;
    let mut migrate_legacy = true;
    if let Ok(path) = env::var("MOCKKIT_STORE_PATH") {
        store_path = Some(PathBuf::from(path));
        migrate_legacy = false;
    }
    let mut overrides_folder = env::var("MOCKKIT_OVERRIDES_FOLDER").ok();
    let mut json_output = false;
    let mut remaining = vec![];
    let mut index = 0usize;

    while index < args.len() {
        match args[index].as_str() {
            "--store" => {
                index += 1;
                let value = args.get(index).ok_or("--store requires a path")?;
                store_path = Some(PathBuf::from(value));
                migrate_legacy = false;
            }
            value if value.starts_with("--store=") => {
                store_path = Some(PathBuf::from(value.trim_start_matches("--store=")));
                migrate_legacy = false;
            }
            "--overrides" => {
                index += 1;
                let value = args.get(index).ok_or("--overrides requires a path")?;
                overrides_folder = Some(value.clone());
            }
            value if value.starts_with("--overrides=") => {
                overrides_folder = Some(value.trim_start_matches("--overrides=").to_string());
            }
            "--json" => {
                json_output = true;
            }
            "--" => {
                remaining.extend(args[index + 1..].iter().cloned());
                break;
            }
            value => remaining.push(value.to_string()),
        }
        index += 1;
    }

    Ok((
        CliOptions {
            store_path: store_path.unwrap_or_else(default_store_path),
            overrides_folder,
            migrate_legacy,
            json: json_output,
        },
        remaining,
    ))
}

fn default_store_path() -> PathBuf {
    if let Ok(home) = env::var("HOME") {
        return PathBuf::from(home)
            .join("Library")
            .join("Application Support")
            .join(APP_NAME)
            .join("store.json");
    }
    PathBuf::from(".mockkit-store.json")
}

fn default_legacy_store_paths() -> Vec<String> {
    let Ok(home) = env::var("HOME") else {
        return vec![];
    };
    LEGACY_APP_NAMES
        .iter()
        .map(|app_name| {
            PathBuf::from(&home)
                .join("Library")
                .join("Application Support")
                .join(app_name)
                .join("store.json")
                .to_string_lossy()
                .to_string()
        })
        .collect()
}

fn default_overrides_folder() -> String {
    env::var("MOCKKIT_OVERRIDES_FOLDER")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| {
            env::var("HOME")
                .map(|home| format!("{home}/Desktop/mock"))
                .unwrap_or_else(|_| "mock".to_string())
        })
}

fn load_cli_store(options: &CliOptions) -> Result<Store, Box<dyn std::error::Error>> {
    ensure_parent_dir(&options.store_path)?;
    if options.migrate_legacy {
        let legacy_paths = default_legacy_store_paths();
        migrate_legacy_store(&options.store_path, Some(&legacy_paths))?;
    }
    let mut store = read_store(&options.store_path)?
        .unwrap_or_else(|| default_store(&default_overrides_folder()));
    normalize_store(&mut store);
    if let Some(folder) = &options.overrides_folder {
        store.overrides_folder = folder.clone();
    }
    refresh_chrome_profile(&mut store);
    if let Some(folder) = &options.overrides_folder {
        store.overrides_folder = folder.clone();
    }
    write_store(&options.store_path, &store)?;
    Ok(store)
}

fn save_cli_store(options: &CliOptions, store: &Store) -> Result<(), Box<dyn std::error::Error>> {
    write_store(&options.store_path, store)
}

fn print_cli_help() {
    println!(
        r#"MockKit CLI

Usage:
  mockkit [--store <path>] [--overrides <folder>] [--json] <command>

Commands:
  status                         Show store, Chrome profile, and endpoint counts
  list                           List endpoints with short ids and active cases
  show <endpoint> [case]         Show one endpoint/case with full mock body
  show <endpoint> [case] --body  Print only the selected mock body
  scan                           Import/update files from the Overrides folder
  publish                        Write active enabled cases into Chrome Overrides
  disable                        Disable all mocks and remove managed files
  disable <endpoint...>          Disable one or more endpoints
  disable --group <path>         Disable endpoints in a group
  disable --matching <text>      Disable matching endpoints in batch
  enable <endpoint...>           Enable one or more endpoints
  enable --group <path>          Enable endpoints in a group
  enable --matching <text>       Enable matching endpoints in batch
  edit <endpoint> [options]      Edit endpoint title, description, path, method, group, or tags
  case add <endpoint> [options]  Add a response case and activate it by default
  case update <endpoint> <case>  Edit a response case name, body, status, or headers
  case delete <endpoint> <case>  Delete a response case
  import-curl [--fetch] <curl>   Import a cURL command as an endpoint
  use <endpoint> <case>          Activate a case by endpoint id/name/path and case id/name
  use <endpoint> <case> --publish

Edit options:
  --name <text>                  Set endpoint title
  --description <text>           Set endpoint description
  --description-file <path>      Read endpoint description from a file
  --method <method>              Set endpoint method
  --path <path>                  Set endpoint override path
  --group <path>                 Set endpoint group path
  --clear-group                  Remove endpoint group path
  --tag <tag>                    Set tags; can be repeated
  --tags <tag,tag>               Set comma/newline separated tags

Case options:
  --name <text>                  Set case name
  --body <text>                  Set response body
  --body-file <path>             Read response body from a file; use - for stdin
  --body-stdin                   Read response body from stdin
  --status <code>                Set response status metadata
  --headers <text>               Set response headers metadata
  --headers-file <path>          Read response headers from a file; use - for stdin
  --activate                     Activate the case after update
  --no-activate                  Keep current active case after add
  --publish                      Publish after saving

Environment:
  MOCKKIT_STORE_PATH             Override the default App Support store path
  MOCKKIT_OVERRIDES_FOLDER       Override the default Chrome Overrides folder
"#
    );
}

fn cli_status(options: &CliOptions) -> Result<(), Box<dyn std::error::Error>> {
    let store = load_cli_store(options)?;
    let enabled_endpoints = store
        .endpoints
        .iter()
        .filter(|endpoint| endpoint.enabled != Some(false))
        .count();
    let active_cases = store
        .endpoints
        .iter()
        .filter(|endpoint| endpoint.active_case_id.is_some())
        .count();
    if options.json {
        println!(
            "{}",
            serde_json::to_string_pretty(&json!({
                "storePath": options.store_path,
                "overridesFolder": store.overrides_folder,
                "mockEnabled": store.mock_enabled,
                "endpoints": store.endpoints.len(),
                "enabledEndpoints": enabled_endpoints,
                "activeCases": active_cases,
                "chromeProfile": store.chrome_profile,
            }))?
        );
        return Ok(());
    }

    println!("Store: {}", options.store_path.display());
    println!("Overrides: {}", store.overrides_folder);
    println!(
        "Mock: {}",
        if store.mock_enabled {
            "enabled"
        } else {
            "disabled"
        }
    );
    println!(
        "Endpoints: {} total, {} enabled, {} with active cases",
        store.endpoints.len(),
        enabled_endpoints,
        active_cases
    );
    if let Some(profile) = &store.chrome_profile {
        println!(
            "Chrome: {} ({}, overrides: {})",
            profile.profile_name,
            profile.local_overrides_enabled,
            profile
                .overrides_folder
                .as_deref()
                .unwrap_or("not detected")
        );
    }
    Ok(())
}

fn cli_list(options: &CliOptions) -> Result<(), Box<dyn std::error::Error>> {
    let store = load_cli_store(options)?;
    if options.json {
        println!("{}", serde_json::to_string_pretty(&store.endpoints)?);
        return Ok(());
    }
    if store.endpoints.is_empty() {
        println!("No endpoints yet. Run `mockkit scan` or `mockkit import-curl`.");
        return Ok(());
    }
    for endpoint in &store.endpoints {
        let active_case = active_case(endpoint)
            .map(|mock_case| mock_case.name.as_str())
            .unwrap_or("none");
        let state = if endpoint.enabled == Some(false) {
            "off"
        } else {
            "on"
        };
        let short_id = short_id(&endpoint.id);
        println!("[{state}] {short_id}  {}", endpoint.name);
        println!("  case: {active_case}");
        println!("  path: {}", endpoint.override_path);
        if let Some(group_path) = endpoint
            .group_path
            .as_deref()
            .filter(|path| !path.is_empty())
        {
            println!("  group: {group_path}");
        }
        println!();
    }
    Ok(())
}

fn cli_show(options: &CliOptions, args: &[String]) -> Result<(), Box<dyn std::error::Error>> {
    let body_only = args
        .iter()
        .any(|arg| arg == "--body" || arg == "--body-only");
    let positional = args
        .iter()
        .filter(|arg| arg.as_str() != "--body" && arg.as_str() != "--body-only")
        .collect::<Vec<_>>();
    let endpoint_query = positional
        .first()
        .ok_or("show requires <endpoint>. Run `mockkit list` to find one.")?
        .as_str();
    let case_query = positional.get(1).map(|value| value.as_str());
    let store = load_cli_store(options)?;
    let endpoint_index = find_endpoint_index(&store, endpoint_query)?;
    let endpoint = &store.endpoints[endpoint_index];
    let mock_case = match case_query {
        Some(query) => find_case(endpoint, query)?,
        None => active_case(endpoint).ok_or("endpoint has no cases")?,
    };

    if options.json {
        println!(
            "{}",
            serde_json::to_string_pretty(&json!({
                "endpoint": endpoint,
                "case": mock_case,
            }))?
        );
        return Ok(());
    }

    if body_only {
        println!("{}", mock_case.body);
        return Ok(());
    }

    println!("endpoint: {}", endpoint.name);
    println!("id: {}", short_id(&endpoint.id));
    println!(
        "enabled: {}",
        if endpoint.enabled == Some(false) {
            "off"
        } else {
            "on"
        }
    );
    println!("path: {}", endpoint.override_path);
    if let Some(group_path) = endpoint
        .group_path
        .as_deref()
        .filter(|path| !path.is_empty())
    {
        println!("group: {group_path}");
    }
    println!("case: {}", mock_case.name);
    println!("status: {}", mock_case.status);
    if !mock_case.headers.trim().is_empty() {
        println!("headers:\n{}", mock_case.headers);
    }
    println!("body:");
    println!("{}", mock_case.body);
    Ok(())
}

fn cli_scan(options: &CliOptions) -> Result<(), Box<dyn std::error::Error>> {
    let mut store = load_cli_store(options)?;
    let (imported, updated) = sync_overrides(&mut store)?;
    save_cli_store(options, &store)?;
    if options.json {
        println!(
            "{}",
            serde_json::to_string_pretty(&json!({
                "imported": imported,
                "updated": updated,
                "store": store,
            }))?
        );
    } else {
        println!(
            "Scanned overrides: imported {}, updated {}.",
            imported.len(),
            updated
        );
    }
    Ok(())
}

fn cli_publish(options: &CliOptions) -> Result<(), Box<dyn std::error::Error>> {
    let store = load_cli_store(options)?;
    let written = publish(&store)?;
    if options.json {
        println!(
            "{}",
            serde_json::to_string_pretty(&json!({ "written": written }))?
        );
    } else {
        println!("Published {} managed override files.", written.len());
    }
    Ok(())
}

fn cli_disable(options: &CliOptions, args: &[String]) -> Result<(), Box<dyn std::error::Error>> {
    if !args.is_empty() {
        return cli_set_enabled(options, &args, false);
    }
    let mut store = load_cli_store(options)?;
    disable(&mut store)?;
    save_cli_store(options, &store)?;
    if options.json {
        println!(
            "{}",
            serde_json::to_string_pretty(&json!({ "mockEnabled": store.mock_enabled }))?
        );
    } else {
        println!("Mock disabled and managed override files removed.");
    }
    Ok(())
}

fn cli_set_enabled(
    options: &CliOptions,
    args: &[String],
    enabled: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let publish_after = args.iter().any(|arg| arg == "--publish");
    let mut specs = vec![];
    let mut index = 0usize;
    while index < args.len() {
        match args[index].as_str() {
            "--publish" => {}
            "--endpoint" | "-e" => {
                index += 1;
                let value = args.get(index).ok_or("--endpoint requires a value")?;
                specs.push(CliEndpointSelector::Endpoint(value.clone()));
            }
            value if value.starts_with("--endpoint=") => {
                specs.push(CliEndpointSelector::Endpoint(
                    value.trim_start_matches("--endpoint=").to_string(),
                ));
            }
            "--group" | "-g" => {
                index += 1;
                let value = args.get(index).ok_or("--group requires a value")?;
                specs.push(CliEndpointSelector::Group(value.clone()));
            }
            value if value.starts_with("--group=") => {
                specs.push(CliEndpointSelector::Group(
                    value.trim_start_matches("--group=").to_string(),
                ));
            }
            "--matching" | "--match" | "-m" => {
                index += 1;
                let value = args.get(index).ok_or("--matching requires a value")?;
                specs.push(CliEndpointSelector::Matching(value.clone()));
            }
            value if value.starts_with("--matching=") => {
                specs.push(CliEndpointSelector::Matching(
                    value.trim_start_matches("--matching=").to_string(),
                ));
            }
            value if value.starts_with("--match=") => {
                specs.push(CliEndpointSelector::Matching(
                    value.trim_start_matches("--match=").to_string(),
                ));
            }
            value if value.starts_with('-') => {
                return Err(format!("unknown option: {value}").into());
            }
            value => specs.push(CliEndpointSelector::Endpoint(value.to_string())),
        }
        index += 1;
    }

    if specs.is_empty() {
        return Err(format!(
            "{} requires <endpoint>, --group, or --matching. Use `mockkit disable` with no arguments to disable all mocks.",
            if enabled { "enable" } else { "disable" }
        )
        .into());
    }

    let mut store = load_cli_store(options)?;
    let mut matched = matching_endpoint_indices(&store, &specs)?;
    matched.sort_unstable();
    matched.dedup();
    if matched.is_empty() {
        return Err("no endpoints matched".into());
    }
    let matched_count = matched.len();

    let mut changed = vec![];
    for index in matched {
        let endpoint = &mut store.endpoints[index];
        let next_enabled = Some(enabled);
        if endpoint.enabled != next_enabled {
            endpoint.enabled = next_enabled;
            changed.push(json!({
                "id": endpoint.id,
                "name": endpoint.name,
                "overridePath": endpoint.override_path,
                "groupPath": endpoint.group_path,
                "enabled": enabled,
            }));
        }
    }
    save_cli_store(options, &store)?;
    let written = if publish_after {
        publish(&store)?
    } else {
        vec![]
    };

    if options.json {
        println!(
            "{}",
            serde_json::to_string_pretty(&json!({
                "enabled": enabled,
                "matched": matched_count,
                "updated": changed.len(),
                "changed": changed,
                "published": publish_after,
                "written": written,
            }))?
        );
    } else {
        let action = if enabled { "Enabled" } else { "Disabled" };
        println!(
            "{action} {} of {} matched endpoints.",
            changed.len(),
            matched_count
        );
        if publish_after {
            println!("Published {} managed override files.", written.len());
        }
    }
    Ok(())
}

#[derive(Debug, Default)]
struct CliEndpointEditOptions {
    name: Option<String>,
    description: Option<String>,
    method: Option<String>,
    override_path: Option<String>,
    group_path: Option<Option<String>>,
    tags: Option<Vec<String>>,
    publish: bool,
}

fn cli_edit_endpoint(
    options: &CliOptions,
    args: &[String],
) -> Result<(), Box<dyn std::error::Error>> {
    let (endpoint_query, edit_options) = parse_endpoint_edit_args(args)?;
    let mut store = load_cli_store(options)?;
    let endpoint_index = find_endpoint_index(&store, &endpoint_query)?;
    let mut changed = vec![];

    if let Some(path) = edit_options.override_path.as_deref() {
        let clean_path = sanitized_relative_path(path);
        if clean_path.is_empty() {
            return Err("--path cannot be empty".into());
        }
        if store.endpoints.iter().enumerate().any(|(index, endpoint)| {
            index != endpoint_index && endpoint.override_path == clean_path
        }) {
            return Err(format!("another endpoint already uses path: {clean_path}").into());
        }
    }

    {
        let endpoint = &mut store.endpoints[endpoint_index];
        if let Some(name) = edit_options.name {
            if endpoint.name != name {
                endpoint.name = name;
                changed.push("name");
            }
        }
        if let Some(description) = edit_options.description {
            if endpoint.description != description {
                endpoint.description = description;
                changed.push("description");
            }
        }
        if let Some(method) = edit_options.method {
            let method = method.trim().to_uppercase();
            if method.is_empty() {
                return Err("--method cannot be empty".into());
            }
            if endpoint.method != method {
                endpoint.method = method;
                changed.push("method");
            }
        }
        if let Some(path) = edit_options.override_path {
            let clean_path = sanitized_relative_path(&path);
            if endpoint.override_path != clean_path {
                endpoint.override_path = clean_path;
                changed.push("overridePath");
            }
        }
        if let Some(group_path) = edit_options.group_path {
            let next_group = group_path
                .as_deref()
                .map(sanitized_relative_path)
                .filter(|path| !path.is_empty());
            if endpoint.group_path != next_group {
                endpoint.group_path = next_group;
                changed.push("groupPath");
            }
        }
        if let Some(tags) = edit_options.tags {
            if endpoint.tags != tags {
                endpoint.tags = tags;
                changed.push("tags");
            }
        }
    }

    if changed.is_empty() {
        return Err("edit requires at least one changed field".into());
    }

    if let Some(group_path) = store.endpoints[endpoint_index].group_path.clone() {
        remember_group_path(&mut store, &group_path);
    }
    normalize_store(&mut store);
    let endpoint = store.endpoints[endpoint_index].clone();
    save_cli_store(options, &store)?;
    let written = if edit_options.publish {
        publish(&store)?
    } else {
        vec![]
    };

    if options.json {
        println!(
            "{}",
            serde_json::to_string_pretty(&json!({
                "endpoint": endpoint,
                "changed": changed,
                "published": edit_options.publish,
                "written": written,
            }))?
        );
    } else {
        println!(
            "Updated endpoint `{}` ({}).",
            endpoint.name,
            changed.join(", ")
        );
        if edit_options.publish {
            println!("Published {} managed override files.", written.len());
        }
    }
    Ok(())
}

fn parse_endpoint_edit_args(
    args: &[String],
) -> Result<(String, CliEndpointEditOptions), Box<dyn std::error::Error>> {
    let mut positional = vec![];
    let mut options = CliEndpointEditOptions::default();
    let mut tags: Option<Vec<String>> = None;
    let mut index = 0usize;

    while index < args.len() {
        match args[index].as_str() {
            "--publish" => options.publish = true,
            "--name" | "--title" | "-n" => {
                options.name = Some(take_cli_value(args, &mut index, "--name")?);
            }
            value if value.starts_with("--name=") => {
                options.name = Some(value.trim_start_matches("--name=").to_string());
            }
            value if value.starts_with("--title=") => {
                options.name = Some(value.trim_start_matches("--title=").to_string());
            }
            "--description" | "--desc" | "-d" => {
                options.description = Some(take_cli_value(args, &mut index, "--description")?);
            }
            value if value.starts_with("--description=") => {
                options.description = Some(value.trim_start_matches("--description=").to_string());
            }
            value if value.starts_with("--desc=") => {
                options.description = Some(value.trim_start_matches("--desc=").to_string());
            }
            "--description-file" => {
                let path = take_cli_value(args, &mut index, "--description-file")?;
                options.description = Some(read_cli_text_source(&path)?);
            }
            value if value.starts_with("--description-file=") => {
                options.description = Some(read_cli_text_source(
                    value.trim_start_matches("--description-file="),
                )?);
            }
            "--method" | "-X" => {
                options.method = Some(take_cli_value(args, &mut index, "--method")?);
            }
            value if value.starts_with("--method=") => {
                options.method = Some(value.trim_start_matches("--method=").to_string());
            }
            "--path" | "--override-path" => {
                options.override_path = Some(take_cli_value(args, &mut index, "--path")?);
            }
            value if value.starts_with("--path=") => {
                options.override_path = Some(value.trim_start_matches("--path=").to_string());
            }
            value if value.starts_with("--override-path=") => {
                options.override_path =
                    Some(value.trim_start_matches("--override-path=").to_string());
            }
            "--group" | "-g" => {
                options.group_path = Some(Some(take_cli_value(args, &mut index, "--group")?));
            }
            value if value.starts_with("--group=") => {
                options.group_path = Some(Some(value.trim_start_matches("--group=").to_string()));
            }
            "--clear-group" => options.group_path = Some(None),
            "--clear-tags" => tags = Some(vec![]),
            "--tag" => {
                let value = take_cli_value(args, &mut index, "--tag")?;
                tags.get_or_insert_with(Vec::new)
                    .extend(split_cli_tags(&value));
            }
            value if value.starts_with("--tag=") => {
                tags.get_or_insert_with(Vec::new)
                    .extend(split_cli_tags(value.trim_start_matches("--tag=")));
            }
            "--tags" => {
                let value = take_cli_value(args, &mut index, "--tags")?;
                tags = Some(split_cli_tags(&value));
            }
            value if value.starts_with("--tags=") => {
                tags = Some(split_cli_tags(value.trim_start_matches("--tags=")));
            }
            value if value.starts_with('-') => {
                return Err(format!("unknown option: {value}").into());
            }
            value => positional.push(value.to_string()),
        }
        index += 1;
    }

    if let Some(tags) = tags {
        options.tags = Some(unique_non_empty_values(tags));
    }
    let endpoint = positional
        .first()
        .ok_or("edit requires <endpoint>. Run `mockkit list` to find one.")?
        .clone();
    if positional.len() > 1 {
        return Err("edit accepts exactly one endpoint argument".into());
    }
    Ok((endpoint, options))
}

#[derive(Debug, Default)]
struct CliCaseEditOptions {
    name: Option<String>,
    body: Option<String>,
    status: Option<i32>,
    headers: Option<String>,
    publish: bool,
    activate: bool,
    no_activate: bool,
}

fn cli_case(options: &CliOptions, args: &[String]) -> Result<(), Box<dyn std::error::Error>> {
    let Some(subcommand) = args.first().map(String::as_str) else {
        return Err("case requires add, update, or delete".into());
    };
    match subcommand {
        "add" | "create" => cli_case_add(options, &args[1..]),
        "update" | "edit" | "set" => cli_case_update(options, &args[1..]),
        "delete" | "remove" | "rm" => cli_case_delete(options, &args[1..]),
        _ => Err(format!("unknown case command: {subcommand}").into()),
    }
}

fn cli_case_add(options: &CliOptions, args: &[String]) -> Result<(), Box<dyn std::error::Error>> {
    let (positional, case_options) = parse_case_edit_args(args)?;
    let endpoint_query = positional
        .first()
        .ok_or("case add requires <endpoint>. Run `mockkit list` to find one.")?;
    if positional.len() > 1 {
        return Err("case add accepts exactly one endpoint argument".into());
    }

    let mut store = load_cli_store(options)?;
    let endpoint = find_endpoint_mut(&mut store, endpoint_query)?;
    let case_id = new_id();
    let case_name = case_options
        .name
        .unwrap_or_else(|| unique_case_name(endpoint, "新返回场景"));
    let mock_case = MockCase {
        id: case_id.clone(),
        name: case_name.clone(),
        body: case_options.body.unwrap_or_default(),
        status: case_options.status.unwrap_or(200),
        headers: case_options.headers.unwrap_or_default(),
    };
    endpoint.cases.push(mock_case.clone());
    if !case_options.no_activate {
        endpoint.active_case_id = Some(case_id.clone());
    }
    let endpoint_name = endpoint.name.clone();
    normalize_store(&mut store);
    save_cli_store(options, &store)?;
    let written = if case_options.publish {
        publish(&store)?
    } else {
        vec![]
    };

    if options.json {
        println!(
            "{}",
            serde_json::to_string_pretty(&json!({
                "endpoint": endpoint_name,
                "case": mock_case,
                "active": !case_options.no_activate,
                "published": case_options.publish,
                "written": written,
            }))?
        );
    } else {
        println!("Added case `{case_name}` for `{endpoint_name}`.");
        if case_options.publish {
            println!("Published {} managed override files.", written.len());
        }
    }
    Ok(())
}

fn cli_case_update(
    options: &CliOptions,
    args: &[String],
) -> Result<(), Box<dyn std::error::Error>> {
    let (positional, case_options) = parse_case_edit_args(args)?;
    if positional.len() < 2 {
        return Err("case update requires <endpoint> and <case>".into());
    }
    if positional.len() > 2 {
        return Err("case update accepts exactly <endpoint> and <case>".into());
    }
    if case_options.name.is_none()
        && case_options.body.is_none()
        && case_options.status.is_none()
        && case_options.headers.is_none()
        && !case_options.activate
    {
        return Err(
            "case update requires --name, --body, --body-file, --status, --headers, or --activate"
                .into(),
        );
    }

    let mut store = load_cli_store(options)?;
    let endpoint = find_endpoint_mut(&mut store, &positional[0])?;
    let case_index = find_case_index(endpoint, &positional[1])?;
    let case_id = endpoint.cases[case_index].id.clone();
    let mut changed = vec![];
    {
        let mock_case = &mut endpoint.cases[case_index];
        if let Some(name) = case_options.name {
            if mock_case.name != name {
                mock_case.name = name;
                changed.push("name");
            }
        }
        if let Some(body) = case_options.body {
            if mock_case.body != body {
                mock_case.body = body;
                changed.push("body");
            }
        }
        if let Some(status) = case_options.status {
            if mock_case.status != status {
                mock_case.status = status;
                changed.push("status");
            }
        }
        if let Some(headers) = case_options.headers {
            if mock_case.headers != headers {
                mock_case.headers = headers;
                changed.push("headers");
            }
        }
    }
    if case_options.activate && endpoint.active_case_id.as_deref() != Some(case_id.as_str()) {
        endpoint.active_case_id = Some(case_id.clone());
        changed.push("activeCase");
    }
    if changed.is_empty() {
        return Err("case update did not change anything".into());
    }

    let endpoint_name = endpoint.name.clone();
    let mock_case = endpoint.cases[case_index].clone();
    normalize_store(&mut store);
    save_cli_store(options, &store)?;
    let written = if case_options.publish {
        publish(&store)?
    } else {
        vec![]
    };

    if options.json {
        println!(
            "{}",
            serde_json::to_string_pretty(&json!({
                "endpoint": endpoint_name,
                "case": mock_case,
                "changed": changed,
                "published": case_options.publish,
                "written": written,
            }))?
        );
    } else {
        println!(
            "Updated case `{}` for `{}` ({}).",
            mock_case.name,
            endpoint_name,
            changed.join(", ")
        );
        if case_options.publish {
            println!("Published {} managed override files.", written.len());
        }
    }
    Ok(())
}

fn cli_case_delete(
    options: &CliOptions,
    args: &[String],
) -> Result<(), Box<dyn std::error::Error>> {
    let mut publish_after = false;
    let mut positional = vec![];
    for arg in args {
        match arg.as_str() {
            "--publish" => publish_after = true,
            value if value.starts_with('-') => {
                return Err(format!("unknown option: {value}").into())
            }
            value => positional.push(value.to_string()),
        }
    }
    if positional.len() < 2 {
        return Err("case delete requires <endpoint> and <case>".into());
    }
    if positional.len() > 2 {
        return Err("case delete accepts exactly <endpoint> and <case>".into());
    }

    let mut store = load_cli_store(options)?;
    let endpoint = find_endpoint_mut(&mut store, &positional[0])?;
    if endpoint.cases.len() <= 1 {
        return Err("each endpoint must keep at least one case".into());
    }
    let case_index = find_case_index(endpoint, &positional[1])?;
    let removed_case = endpoint.cases.remove(case_index);
    if endpoint.active_case_id.as_deref() == Some(removed_case.id.as_str()) {
        endpoint.active_case_id = endpoint.cases.first().map(|mock_case| mock_case.id.clone());
    }
    let endpoint_name = endpoint.name.clone();
    normalize_store(&mut store);
    save_cli_store(options, &store)?;
    let written = if publish_after {
        publish(&store)?
    } else {
        vec![]
    };

    if options.json {
        println!(
            "{}",
            serde_json::to_string_pretty(&json!({
                "endpoint": endpoint_name,
                "deletedCase": removed_case,
                "published": publish_after,
                "written": written,
            }))?
        );
    } else {
        println!(
            "Deleted case `{}` from `{endpoint_name}`.",
            removed_case.name
        );
        if publish_after {
            println!("Published {} managed override files.", written.len());
        }
    }
    Ok(())
}

fn parse_case_edit_args(
    args: &[String],
) -> Result<(Vec<String>, CliCaseEditOptions), Box<dyn std::error::Error>> {
    let mut positional = vec![];
    let mut options = CliCaseEditOptions::default();
    let mut index = 0usize;

    while index < args.len() {
        match args[index].as_str() {
            "--publish" => options.publish = true,
            "--activate" => options.activate = true,
            "--no-activate" => options.no_activate = true,
            "--name" | "-n" => {
                options.name = Some(take_cli_value(args, &mut index, "--name")?);
            }
            value if value.starts_with("--name=") => {
                options.name = Some(value.trim_start_matches("--name=").to_string());
            }
            "--body" => {
                options.body = Some(take_cli_value(args, &mut index, "--body")?);
            }
            value if value.starts_with("--body=") => {
                options.body = Some(value.trim_start_matches("--body=").to_string());
            }
            "--body-file" => {
                let path = take_cli_value(args, &mut index, "--body-file")?;
                options.body = Some(read_cli_text_source(&path)?);
            }
            value if value.starts_with("--body-file=") => {
                options.body = Some(read_cli_text_source(
                    value.trim_start_matches("--body-file="),
                )?);
            }
            "--body-stdin" => {
                options.body = Some(read_cli_text_source("-")?);
            }
            "--status" => {
                let value = take_cli_value(args, &mut index, "--status")?;
                options.status = Some(parse_http_status(&value)?);
            }
            value if value.starts_with("--status=") => {
                options.status = Some(parse_http_status(value.trim_start_matches("--status="))?);
            }
            "--headers" => {
                options.headers = Some(take_cli_value(args, &mut index, "--headers")?);
            }
            value if value.starts_with("--headers=") => {
                options.headers = Some(value.trim_start_matches("--headers=").to_string());
            }
            "--headers-file" => {
                let path = take_cli_value(args, &mut index, "--headers-file")?;
                options.headers = Some(read_cli_text_source(&path)?);
            }
            value if value.starts_with("--headers-file=") => {
                options.headers = Some(read_cli_text_source(
                    value.trim_start_matches("--headers-file="),
                )?);
            }
            value if value.starts_with('-') => {
                return Err(format!("unknown option: {value}").into());
            }
            value => positional.push(value.to_string()),
        }
        index += 1;
    }

    Ok((positional, options))
}

fn cli_import_curl(
    options: &CliOptions,
    args: &[String],
) -> Result<(), Box<dyn std::error::Error>> {
    let mut fetch_response = false;
    let mut curl_parts = vec![];
    let mut index = 0usize;
    while index < args.len() {
        match args[index].as_str() {
            "--fetch" => fetch_response = true,
            "--file" => {
                index += 1;
                let path = args.get(index).ok_or("--file requires a path")?;
                curl_parts.push(fs::read_to_string(path)?);
            }
            value if value.starts_with("--file=") => {
                curl_parts.push(fs::read_to_string(value.trim_start_matches("--file="))?);
            }
            value => curl_parts.push(value.to_string()),
        }
        index += 1;
    }
    if curl_parts.is_empty() && !io::stdin().is_terminal() {
        let mut stdin = String::new();
        io::stdin().read_to_string(&mut stdin)?;
        curl_parts.push(stdin);
    }
    let curl = curl_parts.join(" ");
    if curl.trim().is_empty() {
        return Err("import-curl requires a cURL command or --file path".into());
    }

    let mut store = load_cli_store(options)?;
    let (endpoint_id, case_id) = import_curl(&mut store, &curl, fetch_response)?;
    save_cli_store(options, &store)?;
    let written = publish(&store)?;
    if options.json {
        println!(
            "{}",
            serde_json::to_string_pretty(&json!({
                "importedEndpointId": endpoint_id,
                "importedCaseId": case_id,
                "written": written,
            }))?
        );
    } else {
        println!("Imported cURL into endpoint {endpoint_id}, case {case_id}.");
        println!("Published {} managed override files.", written.len());
    }
    Ok(())
}

fn cli_use_case(options: &CliOptions, args: &[String]) -> Result<(), Box<dyn std::error::Error>> {
    let publish_after = args.iter().any(|arg| arg == "--publish");
    let positional = args
        .iter()
        .filter(|arg| arg.as_str() != "--publish")
        .collect::<Vec<_>>();
    if positional.len() < 2 {
        return Err("use requires <endpoint> and <case>".into());
    }
    let endpoint_query = positional[0].as_str();
    let case_query = positional[1].as_str();
    let mut store = load_cli_store(options)?;
    let endpoint = find_endpoint_mut(&mut store, endpoint_query)?;
    let case_id = find_case(endpoint, case_query)?.id.clone();
    let endpoint_name = endpoint.name.clone();
    let case_name = find_case(endpoint, &case_id)?.name.clone();
    endpoint.active_case_id = Some(case_id.clone());
    save_cli_store(options, &store)?;
    let written = if publish_after {
        publish(&store)?
    } else {
        vec![]
    };

    if options.json {
        println!(
            "{}",
            serde_json::to_string_pretty(&json!({
                "endpoint": endpoint_name,
                "activeCase": case_name,
                "published": publish_after,
                "written": written,
            }))?
        );
    } else {
        println!("Activated case `{case_name}` for `{endpoint_name}`.");
        if publish_after {
            println!("Published {} managed override files.", written.len());
        }
    }
    Ok(())
}

fn active_case(endpoint: &Endpoint) -> Option<&MockCase> {
    endpoint
        .active_case_id
        .as_ref()
        .and_then(|case_id| endpoint.cases.iter().find(|item| &item.id == case_id))
        .or_else(|| endpoint.cases.first())
}

fn short_id(id: &str) -> &str {
    id.get(..8).unwrap_or(id)
}

#[derive(Debug)]
enum CliEndpointSelector {
    Endpoint(String),
    Group(String),
    Matching(String),
}

fn matching_endpoint_indices(
    store: &Store,
    selectors: &[CliEndpointSelector],
) -> Result<Vec<usize>, Box<dyn std::error::Error>> {
    let mut indices = vec![];
    for selector in selectors {
        match selector {
            CliEndpointSelector::Endpoint(query) => {
                indices.push(find_endpoint_index(store, query)?);
            }
            CliEndpointSelector::Group(group_path) => {
                let clean_group = sanitized_relative_path(group_path);
                let group_matches = store
                    .endpoints
                    .iter()
                    .enumerate()
                    .filter(|(_, endpoint)| {
                        endpoint
                            .group_path
                            .as_deref()
                            .map(|path| {
                                path == clean_group || path.starts_with(&format!("{clean_group}/"))
                            })
                            .unwrap_or(false)
                    })
                    .map(|(index, _)| index)
                    .collect::<Vec<_>>();
                if group_matches.is_empty() {
                    return Err(format!("group not found or empty: {group_path}").into());
                }
                indices.extend(group_matches);
            }
            CliEndpointSelector::Matching(query) => {
                let query_lower = query.to_lowercase();
                let text_matches = store
                    .endpoints
                    .iter()
                    .enumerate()
                    .filter(|(_, endpoint)| endpoint_matches_query(endpoint, query, &query_lower))
                    .map(|(index, _)| index)
                    .collect::<Vec<_>>();
                if text_matches.is_empty() {
                    return Err(format!("no endpoints matched: {query}").into());
                }
                indices.extend(text_matches);
            }
        }
    }
    Ok(indices)
}

fn find_endpoint_index(store: &Store, query: &str) -> Result<usize, Box<dyn std::error::Error>> {
    let query_lower = query.to_lowercase();
    let matches = store
        .endpoints
        .iter()
        .enumerate()
        .filter(|(_, endpoint)| endpoint_matches_query(endpoint, query, &query_lower))
        .map(|(index, _)| index)
        .collect::<Vec<_>>();
    match matches.as_slice() {
        [index] => Ok(*index),
        [] => Err(format!("endpoint not found: {query}").into()),
        _ => Err(format!("endpoint query is ambiguous: {query}").into()),
    }
}

fn endpoint_matches_query(endpoint: &Endpoint, query: &str, query_lower: &str) -> bool {
    endpoint.id == query
        || endpoint.id.starts_with(query)
        || endpoint.name.eq_ignore_ascii_case(query)
        || endpoint.override_path == query
        || endpoint.override_path.to_lowercase().contains(query_lower)
        || endpoint
            .group_path
            .as_deref()
            .map(|group_path| group_path.to_lowercase().contains(query_lower))
            .unwrap_or(false)
        || endpoint
            .tags
            .iter()
            .any(|tag| tag.to_lowercase().contains(query_lower))
}

fn find_endpoint_mut<'a>(
    store: &'a mut Store,
    query: &str,
) -> Result<&'a mut Endpoint, Box<dyn std::error::Error>> {
    let index = find_endpoint_index(store, query)?;
    Ok(&mut store.endpoints[index])
}

fn find_case<'a>(
    endpoint: &'a Endpoint,
    query: &str,
) -> Result<&'a MockCase, Box<dyn std::error::Error>> {
    let index = find_case_index(endpoint, query)?;
    Ok(&endpoint.cases[index])
}

fn find_case_index(endpoint: &Endpoint, query: &str) -> Result<usize, Box<dyn std::error::Error>> {
    let query_lower = query.to_lowercase();
    let matches = endpoint
        .cases
        .iter()
        .enumerate()
        .filter(|mock_case| {
            mock_case.1.id == query
                || mock_case.1.name.eq_ignore_ascii_case(query)
                || mock_case.1.name.to_lowercase().contains(&query_lower)
        })
        .map(|(index, _)| index)
        .collect::<Vec<_>>();
    match matches.as_slice() {
        [index] => Ok(*index),
        [] => Err(format!("case not found: {query}").into()),
        _ => Err(format!("case query is ambiguous: {query}").into()),
    }
}

fn take_cli_value(
    args: &[String],
    index: &mut usize,
    option: &str,
) -> Result<String, Box<dyn std::error::Error>> {
    *index += 1;
    args.get(*index)
        .cloned()
        .ok_or_else(|| format!("{option} requires a value").into())
}

fn read_cli_text_source(source: &str) -> Result<String, Box<dyn std::error::Error>> {
    if source == "-" {
        let mut stdin = String::new();
        io::stdin().read_to_string(&mut stdin)?;
        return Ok(stdin);
    }
    Ok(fs::read_to_string(source)?)
}

fn parse_http_status(value: &str) -> Result<i32, Box<dyn std::error::Error>> {
    let status = value
        .parse::<i32>()
        .map_err(|_| format!("invalid status code: {value}"))?;
    if !(100..=599).contains(&status) {
        return Err(format!("status code out of range: {value}").into());
    }
    Ok(status)
}

fn split_cli_tags(value: &str) -> Vec<String> {
    value
        .split([',', '\n'])
        .map(str::trim)
        .filter(|tag| !tag.is_empty())
        .map(ToString::to_string)
        .collect()
}

fn unique_non_empty_values(values: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    values
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .filter(|value| seen.insert(value.clone()))
        .collect()
}

fn remember_group_path(store: &mut Store, group_path: &str) {
    let clean_group = sanitized_relative_path(group_path);
    if clean_group.is_empty() {
        return;
    }
    let mut group_paths = store.group_paths.take().unwrap_or_default();
    for ancestor in ancestor_group_paths(&clean_group) {
        if !group_paths.iter().any(|path| path == &ancestor) {
            group_paths.push(ancestor);
        }
    }
    store.group_paths = Some(group_paths);
}

fn ancestor_group_paths(group_path: &str) -> Vec<String> {
    let parts = group_path
        .split('/')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    (1..=parts.len())
        .map(|index| parts[..index].join("/"))
        .collect()
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
            models: HashMap::new(),
            api_key: String::new(),
            api_keys: HashMap::new(),
            base_url: String::new(),
            ai_grouping_prompt: String::new(),
            cli_preset_id: Some("codex-cli".to_string()),
            cli_presets: default_cli_presets(),
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
    let mut response_body = String::new();
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
        name: display_url_without_scheme(&parsed.url),
        method: parsed.method,
        override_path,
        group_path: None,
        description: "从 cURL 导入。".to_string(),
        tags: vec!["curl".to_string()],
        enabled: Some(true),
        active_case_id: Some(default_case_id.clone()),
        cases: vec![MockCase {
            id: default_case_id.clone(),
            name: "Default".to_string(),
            body: response_body,
            status: response_status,
            headers: response_headers,
        }],
    };
    let endpoint_id = endpoint.id.clone();
    store.endpoints.insert(0, endpoint);
    Ok((endpoint_id, default_case_id))
}

fn display_url_without_scheme(url: &Url) -> String {
    let Some(host) = url.host_str() else {
        return url.as_str().to_string();
    };

    let mut value = host.to_string();
    if let Some(port) = url.port() {
        value.push(':');
        value.push_str(&port.to_string());
    }
    let path = url.path();
    if path.is_empty() {
        value.push('/');
    } else {
        value.push_str(path);
    }
    if let Some(query) = url.query() {
        value.push('?');
        value.push_str(query);
    }
    value
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
        .danger_accept_invalid_certs(request.accept_invalid_certs)
        .build()?;
    let method = reqwest::Method::from_bytes(request.method.as_bytes())?;
    let mut builder = client.request(method, request.url.clone());
    for (key, value) in &request.headers {
        builder = builder.header(key, value);
    }
    if let Some((username, password)) = &request.basic_auth {
        builder = builder.basic_auth(username, password.as_ref());
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
    let mut basic_auth: Option<(String, Option<String>)> = None;
    let mut append_data_to_url = false;
    let mut accept_invalid_certs = false;
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
            "-b" | "--cookie" => {
                index += 1;
                if let Some(value) = tokens.get(index) {
                    parse_cookie(value, &mut headers);
                }
            }
            "-A" | "--user-agent" => {
                index += 1;
                if let Some(value) = tokens.get(index) {
                    insert_header(&mut headers, "User-Agent", value);
                }
            }
            "-e" | "--referer" | "--referrer" => {
                index += 1;
                if let Some(value) = tokens.get(index) {
                    insert_header(&mut headers, "Referer", value);
                }
            }
            "-u" | "--user" => {
                index += 1;
                if let Some(value) = tokens.get(index) {
                    basic_auth = Some(parse_basic_auth(value));
                }
            }
            "--url" => {
                index += 1;
                if let Some(value) = tokens.get(index) {
                    url_string = Some(value.clone());
                }
            }
            "-d" | "--data" | "--data-raw" | "--data-binary" | "--data-ascii"
            | "--data-urlencode" => {
                index += 1;
                if let Some(value) = tokens.get(index) {
                    body_parts.push(value.clone());
                }
            }
            "--compressed" => {
                if !has_header(&headers, "Accept-Encoding") {
                    insert_header(&mut headers, "Accept-Encoding", "gzip, deflate, br, zstd");
                }
            }
            "-k" | "--insecure" => {
                accept_invalid_certs = true;
            }
            "-L" | "--location" => {}
            "-G" | "--get" => {
                append_data_to_url = true;
                method = Some("GET".to_string());
            }
            "-I" | "--head" => {
                method = Some("HEAD".to_string());
            }
            _ => {
                if let Some(value) = token.strip_prefix("--request=") {
                    method = Some(value.to_uppercase());
                } else if let Some(value) = token.strip_prefix("--header=") {
                    parse_header(value, &mut headers);
                } else if let Some(value) = token.strip_prefix("--cookie=") {
                    parse_cookie(value, &mut headers);
                } else if let Some(value) = token.strip_prefix("--user-agent=") {
                    insert_header(&mut headers, "User-Agent", value);
                } else if let Some(value) = token.strip_prefix("--referer=") {
                    insert_header(&mut headers, "Referer", value);
                } else if let Some(value) = token.strip_prefix("--referrer=") {
                    insert_header(&mut headers, "Referer", value);
                } else if let Some(value) = token.strip_prefix("--user=") {
                    basic_auth = Some(parse_basic_auth(value));
                } else if let Some(value) = token.strip_prefix("--url=") {
                    url_string = Some(value.to_string());
                } else if token.starts_with("--data-raw=") || token.starts_with("--data=") {
                    let value = token.split_once('=').map(|(_, value)| value).unwrap_or("");
                    body_parts.push(value.to_string());
                } else if let Some(value) = token.strip_prefix("-H") {
                    parse_header(value, &mut headers);
                } else if let Some(value) = token.strip_prefix("-b") {
                    parse_cookie(value, &mut headers);
                } else if let Some(value) = token.strip_prefix("-A") {
                    insert_header(&mut headers, "User-Agent", value);
                } else if let Some(value) = token.strip_prefix("-e") {
                    insert_header(&mut headers, "Referer", value);
                } else if let Some(value) = token.strip_prefix("-u") {
                    basic_auth = Some(parse_basic_auth(value));
                } else if let Some(value) = token.strip_prefix("-d") {
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
    let mut url = Url::parse(&url_string).map_err(|_| "没有从 cURL 中解析到有效 URL。")?;
    if url.host_str().is_none() {
        return Err("没有从 cURL 中解析到有效 URL。".into());
    }
    if append_data_to_url {
        for body_part in &body_parts {
            let query = url.query().map(ToString::to_string);
            let next_query = match query {
                Some(current) if !current.is_empty() => format!("{current}&{body_part}"),
                _ => body_part.clone(),
            };
            url.set_query(Some(&next_query));
        }
    }

    let body = if body_parts.is_empty() || append_data_to_url {
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
        basic_auth,
        accept_invalid_certs,
    })
}

fn parse_header(header: &str, headers: &mut HashMap<String, String>) {
    if let Some((key, value)) = header.split_once(':') {
        let key = key.trim();
        if !key.is_empty() {
            insert_header(headers, key, value.trim());
        }
    }
}

fn parse_cookie(cookie: &str, headers: &mut HashMap<String, String>) {
    let cookie = cookie.trim();
    if cookie.is_empty() {
        return;
    }
    let existing_key = find_header_key(headers, "Cookie");
    if let Some(key) = existing_key {
        if let Some(current) = headers.get_mut(&key) {
            if !current.trim().is_empty() {
                current.push_str("; ");
            }
            current.push_str(cookie);
        }
        return;
    }
    headers.insert("Cookie".to_string(), cookie.to_string());
}

fn insert_header(headers: &mut HashMap<String, String>, key: &str, value: &str) {
    if let Some(existing_key) = find_header_key(headers, key) {
        headers.insert(existing_key, value.to_string());
        return;
    }
    headers.insert(key.to_string(), value.to_string());
}

fn has_header(headers: &HashMap<String, String>, key: &str) -> bool {
    find_header_key(headers, key).is_some()
}

fn find_header_key(headers: &HashMap<String, String>, key: &str) -> Option<String> {
    headers
        .keys()
        .find(|candidate| candidate.eq_ignore_ascii_case(key))
        .cloned()
}

fn parse_basic_auth(value: &str) -> (String, Option<String>) {
    match value.split_once(':') {
        Some((username, password)) => (username.to_string(), Some(password.to_string())),
        None => (value.to_string(), None),
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
        models: HashMap::new(),
        api_key: String::new(),
        api_keys: HashMap::new(),
        base_url: String::new(),
        ai_grouping_prompt: String::new(),
        cli_preset_id: Some("codex-cli".to_string()),
        cli_presets: default_cli_presets(),
    });
    if !settings.enabled {
        return Err("AI 功能未启用。".into());
    }
    if is_local_cli_provider(&settings.provider) {
        return generate_ai_mock_with_cli(&settings, request);
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

    emit_ai_progress(
        "connecting",
        "正在发送 AI 请求，等待模型开始响应...",
        None,
        None,
    );
    let response = builder.send()?;
    let status = response.status();
    if !status.is_success() {
        let response_text = response.text()?;
        return Err(format_ai_error(status.as_u16(), &response_text).into());
    }

    emit_ai_progress(
        "connecting",
        "AI 服务已响应，正在读取流式内容...",
        None,
        None,
    );
    let content = read_ai_stream(response)?;
    parse_ai_preview_payload(request.mode, &content)
}

fn generate_ai_metadata(
    store: &Store,
    request: AiMetadataRequest,
) -> Result<AiMetadataPreviewPayload, Box<dyn std::error::Error>> {
    emit_ai_progress("preparing", "正在准备 AI 命名请求...", None, None);
    let settings = store.ai_settings.clone().unwrap_or(AiSettings {
        enabled: false,
        provider: "openrouter".to_string(),
        model: String::new(),
        models: HashMap::new(),
        api_key: String::new(),
        api_keys: HashMap::new(),
        base_url: String::new(),
        ai_grouping_prompt: String::new(),
        cli_preset_id: Some("codex-cli".to_string()),
        cli_presets: default_cli_presets(),
    });
    if !settings.enabled {
        return Err("AI 功能未启用。".into());
    }

    let prompt = ai_metadata_prompt(&request);
    let content = if is_local_cli_provider(&settings.provider) {
        match settings.provider.as_str() {
            "codex-cli" => {
                if has_selected_cli_preset(&settings) {
                    run_custom_cli_preset(&settings, &prompt)?
                } else {
                    run_codex_cli(settings.model.trim(), &prompt)?
                }
            }
            "claude-cli" => {
                if has_selected_cli_preset(&settings) {
                    run_custom_cli_preset(&settings, &prompt)?
                } else {
                    run_claude_cli(settings.model.trim(), &prompt, None)?
                }
            }
            "custom-cli" => run_custom_cli_preset(&settings, &prompt)?,
            _ => return Err("不支持的本地 AI CLI。".into()),
        }
    } else {
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
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(60))
            .build()?;
        let mut body = json!({
            "model": settings.model.trim(),
            "temperature": 0.1,
            "messages": [{ "role": "user", "content": prompt }],
            "stream": true,
        });
        if settings.provider != "gemini" {
            body["response_format"] = json!({ "type": "json_object" });
            body["max_tokens"] = json!(600);
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
        emit_ai_progress(
            "connecting",
            "正在发送 AI 命名请求，等待模型开始响应...",
            None,
            None,
        );
        let response = builder.send()?;
        let status = response.status();
        if !status.is_success() {
            let response_text = response.text()?;
            return Err(format_ai_error(status.as_u16(), &response_text).into());
        }
        read_ai_stream(response)?
    };

    parse_ai_metadata_payload(&request, &content)
}

fn generate_ai_grouping(
    store: &Store,
    request: AiGroupingRequest,
) -> Result<AiGroupingPreviewPayload, Box<dyn std::error::Error>> {
    emit_ai_progress("preparing", "正在准备 AI 分组请求...", None, None);
    let settings = store.ai_settings.clone().unwrap_or(AiSettings {
        enabled: false,
        provider: "openrouter".to_string(),
        model: String::new(),
        models: HashMap::new(),
        api_key: String::new(),
        api_keys: HashMap::new(),
        base_url: String::new(),
        ai_grouping_prompt: String::new(),
        cli_preset_id: Some("codex-cli".to_string()),
        cli_presets: default_cli_presets(),
    });
    if !settings.enabled {
        return Err("AI 功能未启用。".into());
    }

    let prompt = ai_grouping_prompt(&request);
    let content = if is_local_cli_provider(&settings.provider) {
        match settings.provider.as_str() {
            "codex-cli" => {
                if has_selected_cli_preset(&settings) {
                    run_custom_cli_preset(&settings, &prompt)?
                } else {
                    run_codex_cli(settings.model.trim(), &prompt)?
                }
            }
            "claude-cli" => {
                if has_selected_cli_preset(&settings) {
                    run_custom_cli_preset(&settings, &prompt)?
                } else {
                    run_claude_cli(settings.model.trim(), &prompt, None)?
                }
            }
            "custom-cli" => run_custom_cli_preset(&settings, &prompt)?,
            _ => return Err("不支持的本地 AI CLI。".into()),
        }
    } else {
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
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(120))
            .build()?;
        let mut body = json!({
            "model": settings.model.trim(),
            "temperature": 0.15,
            "messages": [{ "role": "user", "content": prompt }],
            "stream": true,
        });
        if settings.provider != "gemini" {
            body["response_format"] = json!({ "type": "json_object" });
            body["max_tokens"] = json!(2200);
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
        emit_ai_progress(
            "connecting",
            "正在发送 AI 分组请求，等待模型开始响应...",
            None,
            None,
        );
        let response = builder.send()?;
        let status = response.status();
        if !status.is_success() {
            let response_text = response.text()?;
            return Err(format_ai_error(status.as_u16(), &response_text).into());
        }
        read_ai_stream(response)?
    };

    parse_ai_grouping_payload(&request, &content)
}

fn parse_ai_grouping_payload(
    request: &AiGroupingRequest,
    content: &str,
) -> Result<AiGroupingPreviewPayload, Box<dyn std::error::Error>> {
    emit_ai_progress("parsing", "正在解析 AI 分组结果...", None, Some(content));
    let json_text = extract_json_object(content)?;
    let mut preview: AiGroupingPreviewPayload = serde_json::from_str(&json_text)
        .map_err(|error| format!("AI 分组结果不是有效 JSON：{error}"))?;
    let endpoint_ids = request
        .endpoints
        .iter()
        .map(|endpoint| endpoint.id.as_str())
        .collect::<HashSet<_>>();
    preview.groups = preview
        .groups
        .into_iter()
        .filter_map(|item| {
            if !endpoint_ids.contains(item.endpoint_id.as_str()) {
                return None;
            }
            let group_path = sanitized_relative_path(&item.group_path);
            if group_path.is_empty() {
                return None;
            }
            Some(AiGroupingAssignment { group_path, ..item })
        })
        .collect();
    if preview.groups.is_empty() {
        return Err("AI 没有返回可用分组建议。".into());
    }
    Ok(preview)
}

fn parse_ai_metadata_payload(
    request: &AiMetadataRequest,
    content: &str,
) -> Result<AiMetadataPreviewPayload, Box<dyn std::error::Error>> {
    emit_ai_progress("parsing", "正在解析 AI 命名结果...", None, Some(content));
    let json_text = extract_json_object(content)?;
    let mut preview: AiMetadataPreviewPayload = serde_json::from_str(&json_text)
        .map_err(|error| format!("AI 命名结果不是有效 JSON：{error}"))?;
    preview.endpoint_id = request.endpoint.id.clone();
    preview.name = preview.name.trim().to_string();
    preview.description = preview.description.trim().to_string();
    if preview.name.is_empty() {
        preview.name = request.endpoint.name.trim().to_string();
    }
    if preview.name.is_empty() {
        return Err("AI 没有返回可用接口名称。".into());
    }
    Ok(preview)
}

fn parse_ai_preview_payload(
    mode: String,
    content: &str,
) -> Result<AiPreviewPayload, Box<dyn std::error::Error>> {
    emit_ai_progress("parsing", "正在解析 AI 返回的 JSON...", None, Some(content));
    let json_text = extract_json_object(content)?;
    let preview: AiGeneratedPreview = match serde_json::from_str(&json_text) {
        Ok(preview) => preview,
        Err(error) => {
            return Ok(AiPreviewPayload {
                mode,
                cases: vec![AiGeneratedCase {
                    name: "AI 原始输出".to_string(),
                    body: pretty_printed_body(content),
                    description: Some(format!("AI 返回未能解析为结构化 JSON：{error}")),
                }],
            });
        }
    };
    if preview.cases.is_empty() {
        return Err("AI 没有返回可用场景。".into());
    }
    let mut cases = preview
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
        .collect::<Vec<_>>();
    if mode == "single" {
        cases.truncate(1);
    }

    Ok(AiPreviewPayload { mode, cases })
}

fn generate_ai_mock_with_cli(
    settings: &AiSettings,
    request: AiMockRequest,
) -> Result<AiPreviewPayload, Box<dyn std::error::Error>> {
    let prompt = ai_prompt(&request.mode, &request.instruction, &request.endpoint);
    let content = match settings.provider.as_str() {
        "codex-cli" => {
            if has_selected_cli_preset(settings) {
                run_custom_cli_preset(settings, &prompt)?
            } else {
                run_codex_cli(settings.model.trim(), &prompt)?
            }
        }
        "claude-cli" => {
            if has_selected_cli_preset(settings) {
                run_custom_cli_preset(settings, &prompt)?
            } else {
                run_claude_cli(settings.model.trim(), &prompt, None)?
            }
        }
        "custom-cli" => run_custom_cli_preset(settings, &prompt)?,
        _ => return Err("不支持的本地 AI CLI。".into()),
    };
    parse_ai_preview_payload(request.mode, &content)
}

fn has_selected_cli_preset(settings: &AiSettings) -> bool {
    let Some(preset_id) = settings.cli_preset_id.as_deref() else {
        return false;
    };
    settings
        .cli_presets
        .iter()
        .any(|preset| preset.id == preset_id)
}

fn default_cli_presets() -> Vec<AiCliPreset> {
    vec![
        AiCliPreset {
            id: "codex-cli".to_string(),
            name: "Codex CLI".to_string(),
            model: String::new(),
            command: "codex exec --json --ephemeral --skip-git-repo-check --sandbox read-only --disable hooks --output-last-message {output} -".to_string(),
            stream_mode: "json-events".to_string(),
        },
        AiCliPreset {
            id: "claude-cli".to_string(),
            name: "Claude CLI".to_string(),
            model: String::new(),
            command: "claude -p --no-session-persistence --output-format stream-json --include-partial-messages --verbose {prompt}".to_string(),
            stream_mode: "claude-stream-json".to_string(),
        },
    ]
}

fn run_custom_cli_preset(
    settings: &AiSettings,
    prompt: &str,
) -> Result<String, Box<dyn std::error::Error>> {
    let preset_id = settings
        .cli_preset_id
        .as_deref()
        .ok_or("请选择本地 CLI 预设。")?;
    let default_presets = default_cli_presets();
    let preset = settings
        .cli_presets
        .iter()
        .chain(default_presets.iter())
        .find(|preset| preset.id == preset_id)
        .cloned()
        .ok_or("找不到本地 CLI 预设。")?;
    if preset.command.trim().is_empty() {
        return Err("本地 CLI 预设命令为空。".into());
    }

    emit_ai_progress(
        "connecting",
        &format!("正在调用本地 {}...", preset.name),
        None,
        None,
    );
    let output_path = env::temp_dir().join(format!("mockkit-cli-{}.txt", new_id()));
    let model = if preset.model.trim().is_empty() {
        settings.model.trim()
    } else {
        preset.model.trim()
    };
    let mut command_text = preset.command.clone();
    command_text = command_text.replace("{model}", &shell_quote(model));
    command_text = command_text.replace("{output}", &shell_quote(&output_path.to_string_lossy()));
    let writes_prompt_to_stdin = !command_text.contains("{prompt}");
    command_text = command_text.replace("{prompt}", &shell_quote(prompt));

    let mode = infer_cli_stream_mode(&command_text, &preset.stream_mode);
    let mut command = Command::new("/bin/sh");
    command
        .arg("-lc")
        .arg(command_text)
        .env("PATH", resolve_user_path());
    let output = run_prompt_command_streaming(
        command,
        if writes_prompt_to_stdin { prompt } else { "" },
        &preset.name,
        mode,
    )?;
    let content = fs::read_to_string(&output_path).unwrap_or_else(|_| {
        if output.content.trim().is_empty() {
            output.stdout.clone()
        } else {
            output.content.clone()
        }
    });
    let _ = fs::remove_file(output_path);
    if content.trim().is_empty() {
        return Err(format!("{} 没有返回内容。", preset.name).into());
    }
    if !output.streamed_content {
        emit_simulated_cli_stream(&preset.name, &content);
    }
    Ok(content)
}

fn infer_cli_stream_mode(command_text: &str, configured: &str) -> CliStreamMode {
    let normalized_command = command_text.to_lowercase();
    if normalized_command.contains("stream-json") {
        return CliStreamMode::ClaudeStreamJson;
    }
    if normalized_command.contains("--json") || normalized_command.contains("jsonl") {
        return CliStreamMode::JsonEvents;
    }
    match configured {
        "json-events" => CliStreamMode::JsonEvents,
        "claude-stream-json" => CliStreamMode::ClaudeStreamJson,
        _ => CliStreamMode::PlainText,
    }
}

fn run_codex_cli(model: &str, prompt: &str) -> Result<String, Box<dyn std::error::Error>> {
    emit_ai_progress("connecting", "正在调用本地 Codex CLI...", None, None);
    let output_path = env::temp_dir().join(format!("mockkit-codex-{}.txt", new_id()));
    let mut command = command_with_user_path("codex");
    command
        .arg("exec")
        .arg("--json")
        .arg("--ephemeral")
        .arg("--skip-git-repo-check")
        .arg("--sandbox")
        .arg("read-only")
        .arg("--disable")
        .arg("hooks")
        .arg("--output-last-message")
        .arg(&output_path);
    if !model.is_empty() {
        command.arg("--model").arg(model);
    }
    command.arg("-");

    let output =
        run_prompt_command_streaming(command, prompt, "Codex CLI", CliStreamMode::JsonEvents)?;
    let content = fs::read_to_string(&output_path).unwrap_or_else(|_| {
        if output.content.trim().is_empty() {
            output.stdout.clone()
        } else {
            output.content.clone()
        }
    });
    let _ = fs::remove_file(output_path);
    if content.trim().is_empty() {
        return Err("Codex CLI 没有返回内容。".into());
    }
    if !output.streamed_content {
        emit_simulated_cli_stream("Codex CLI", &content);
    } else {
        emit_ai_progress(
            "streaming",
            "已收到 Codex CLI 返回。",
            Some(content.len()),
            Some(&content),
        );
    }
    Ok(content)
}

fn run_claude_cli(
    model: &str,
    prompt: &str,
    settings_path: Option<&str>,
) -> Result<String, Box<dyn std::error::Error>> {
    let cli_name = "Claude CLI";
    emit_ai_progress(
        "connecting",
        &format!("正在调用本地 {cli_name}..."),
        None,
        None,
    );
    let mut command = command_with_user_path("claude");
    if let Some(settings_path) = settings_path {
        command
            .arg("--settings")
            .arg(expand_home_path(settings_path));
    }
    command.arg("-p").arg("--no-session-persistence");
    command
        .arg("--output-format")
        .arg("stream-json")
        .arg("--include-partial-messages")
        .arg("--verbose");
    if !model.is_empty() {
        command.arg("--model").arg(model);
    }
    command.arg(prompt);

    let output =
        run_prompt_command_streaming(command, "", cli_name, CliStreamMode::ClaudeStreamJson)?;
    let content = if output.content.trim().is_empty() {
        output.stdout
    } else {
        output.content
    };
    if content.trim().is_empty() {
        return Err(format!("{cli_name} 没有返回内容。").into());
    }
    if !output.streamed_content {
        emit_simulated_cli_stream(cli_name, &content);
    } else {
        emit_ai_progress(
            "streaming",
            &format!("已收到 {cli_name} 返回。"),
            Some(content.len()),
            Some(&content),
        );
    }
    Ok(content)
}

fn run_prompt_command_streaming(
    mut command: Command,
    stdin_text: &str,
    label: &str,
    mode: CliStreamMode,
) -> Result<CliCommandOutput, Box<dyn std::error::Error>> {
    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    if stdin_text.is_empty() {
        command.stdin(Stdio::null());
    } else {
        command.stdin(Stdio::piped());
    }
    let mut child = command.spawn().map_err(|error| {
        format!("无法启动本地 AI CLI：{error}。请确认命令已安装并能在终端中运行。")
    })?;
    if !stdin_text.is_empty() {
        if let Some(stdin) = child.stdin.as_mut() {
            stdin.write_all(stdin_text.as_bytes())?;
        }
    }

    let stderr = child.stderr.take();
    let stderr_reader = stderr.map(|stderr| {
        thread::spawn(move || {
            let mut text = String::new();
            let mut reader = io::BufReader::new(stderr);
            let _ = reader.read_to_string(&mut text);
            text
        })
    });

    let mut stdout = child.stdout.take().ok_or("无法读取本地 AI CLI 输出。")?;
    let mut raw_stdout = String::new();
    let mut content = String::new();
    let mut line_buffer = Vec::<u8>::new();
    let mut streamed_content = false;
    let mut last_progress = Instant::now();

    loop {
        let mut buffer = [0_u8; 4096];
        let read = stdout.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        let chunk = &buffer[..read];
        raw_stdout.push_str(&String::from_utf8_lossy(chunk));

        match mode {
            CliStreamMode::PlainText => {
                let delta = String::from_utf8_lossy(chunk).to_string();
                if append_stream_delta(&mut content, &delta) {
                    streamed_content = true;
                    emit_ai_progress(
                        "streaming",
                        &format!("正在接收 {label} 返回..."),
                        Some(content.len()),
                        Some(&content),
                    );
                }
            }
            CliStreamMode::JsonEvents | CliStreamMode::ClaudeStreamJson => {
                line_buffer.extend_from_slice(chunk);
                while let Some(newline_index) = line_buffer.iter().position(|byte| *byte == b'\n') {
                    let line = line_buffer.drain(..=newline_index).collect::<Vec<_>>();
                    let line = String::from_utf8_lossy(&line);
                    let line = line.trim();
                    if line.is_empty() {
                        continue;
                    }
                    let delta = match mode {
                        CliStreamMode::JsonEvents => {
                            extract_json_event_delta(line).unwrap_or_default()
                        }
                        CliStreamMode::ClaudeStreamJson => {
                            extract_claude_stream_delta(line).unwrap_or_default()
                        }
                        CliStreamMode::PlainText => unreachable!(),
                    };
                    if append_stream_delta(&mut content, &delta) {
                        streamed_content = true;
                        emit_ai_progress(
                            "streaming",
                            &format!("正在接收 {label} 返回..."),
                            Some(content.len()),
                            Some(&content),
                        );
                    }
                }
            }
        }

        if content.is_empty() && last_progress.elapsed() >= Duration::from_secs(2) {
            emit_ai_progress(
                "streaming",
                &format!("{label} 已启动，正在等待首段内容..."),
                None,
                None,
            );
            last_progress = Instant::now();
        }
    }

    if !line_buffer.is_empty() && mode != CliStreamMode::PlainText {
        let line = String::from_utf8_lossy(&line_buffer);
        let line = line.trim();
        let delta = match mode {
            CliStreamMode::JsonEvents => extract_json_event_delta(line).unwrap_or_default(),
            CliStreamMode::ClaudeStreamJson => {
                extract_claude_stream_delta(line).unwrap_or_default()
            }
            CliStreamMode::PlainText => String::new(),
        };
        if append_stream_delta(&mut content, &delta) {
            streamed_content = true;
            emit_ai_progress(
                "streaming",
                &format!("正在接收 {label} 返回..."),
                Some(content.len()),
                Some(&content),
            );
        }
    }

    let output = child.wait()?;
    let stderr = stderr_reader
        .and_then(|handle| handle.join().ok())
        .unwrap_or_default();

    if !output.success() {
        let message = if stderr.trim().is_empty() {
            raw_stdout.trim()
        } else {
            stderr.trim()
        };
        return Err(format!("本地 AI CLI 执行失败：{}", truncate_chars(message, 600)).into());
    }

    if content.trim().is_empty() {
        content = match mode {
            CliStreamMode::JsonEvents => {
                extract_json_result_from_stream(&raw_stdout).unwrap_or_default()
            }
            CliStreamMode::ClaudeStreamJson => {
                extract_claude_result_from_stream(&raw_stdout).unwrap_or_default()
            }
            CliStreamMode::PlainText => content,
        };
    }

    Ok(CliCommandOutput {
        stdout: raw_stdout,
        content,
        streamed_content,
    })
}

fn extract_json_event_delta(line: &str) -> Option<String> {
    let value = serde_json::from_str::<Value>(line).ok()?;
    let event_type = value
        .get("type")
        .or_else(|| value.get("event"))
        .or_else(|| value.get("event_type"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_lowercase();
    if event_type.contains("error") {
        return None;
    }
    let is_likely_content_event = event_type.contains("delta")
        || event_type.contains("content_block")
        || event_type.contains("message")
        || event_type.contains("output")
        || has_json_text_key(
            &value,
            &[
                "delta",
                "content_delta",
                "text_delta",
                "output_text_delta",
                "output_text",
            ],
        );
    if !is_likely_content_event {
        return None;
    }
    extract_text_from_json_event(&value, false)
}

fn extract_json_result_from_stream(stdout: &str) -> Option<String> {
    stdout.lines().rev().find_map(|line| {
        let value = serde_json::from_str::<Value>(line).ok()?;
        extract_text_from_json_event(&value, true)
    })
}

fn extract_text_from_json_event(value: &Value, include_final_text: bool) -> Option<String> {
    let direct_text_keys: &[&str] = if include_final_text {
        &[
            "delta",
            "content_delta",
            "text_delta",
            "output_text_delta",
            "text",
            "content",
            "output_text",
            "output",
            "result",
            "message",
            "response",
        ]
    } else {
        &[
            "delta",
            "content_delta",
            "text_delta",
            "output_text_delta",
            "text",
            "content",
            "output_text",
        ]
    };
    for key in direct_text_keys {
        if let Some(text) = value.get(*key).and_then(Value::as_str) {
            return Some(text.to_string());
        }
    }

    const NESTED_KEYS: &[&str] = &[
        "delta", "message", "msg", "event", "data", "item", "content", "output", "response",
        "choice", "result",
    ];
    for key in NESTED_KEYS {
        if let Some(text) = value
            .get(*key)
            .and_then(|item| extract_text_from_json_event(item, include_final_text))
        {
            return Some(text);
        }
    }

    if let Some(choices) = value.get("choices").and_then(Value::as_array) {
        for choice in choices {
            if let Some(text) = extract_text_from_json_event(choice, include_final_text) {
                return Some(text);
            }
        }
    }

    if let Some(parts) = value.get("content").and_then(Value::as_array) {
        let text = parts
            .iter()
            .filter_map(|item| extract_text_from_json_event(item, include_final_text))
            .collect::<Vec<_>>()
            .join("");
        if !text.is_empty() {
            return Some(text);
        }
    }

    if let Some(parts) = value.get("parts").and_then(Value::as_array) {
        let text = parts
            .iter()
            .filter_map(|item| extract_text_from_json_event(item, include_final_text))
            .collect::<Vec<_>>()
            .join("");
        if !text.is_empty() {
            return Some(text);
        }
    }

    None
}

fn has_json_text_key(value: &Value, keys: &[&str]) -> bool {
    if keys.iter().any(|key| value.get(*key).is_some()) {
        return true;
    }
    match value {
        Value::Object(object) => object.values().any(|item| has_json_text_key(item, keys)),
        Value::Array(items) => items.iter().any(|item| has_json_text_key(item, keys)),
        _ => false,
    }
}

fn extract_claude_stream_delta(line: &str) -> Option<String> {
    let value = serde_json::from_str::<Value>(line).ok()?;
    if value.get("type").and_then(Value::as_str) == Some("content_block_delta") {
        return value
            .get("delta")
            .and_then(|delta| delta.get("text"))
            .and_then(Value::as_str)
            .map(str::to_string);
    }
    value
        .get("delta")
        .and_then(|delta| delta.get("text"))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn extract_claude_result_from_stream(stdout: &str) -> Option<String> {
    stdout.lines().rev().find_map(|line| {
        let value = serde_json::from_str::<Value>(line).ok()?;
        value
            .get("result")
            .and_then(Value::as_str)
            .map(str::to_string)
    })
}

fn append_stream_delta(content: &mut String, delta: &str) -> bool {
    if delta.is_empty() {
        return false;
    }
    if content.is_empty() {
        content.push_str(delta);
        return true;
    }
    if delta == content || content.ends_with(delta) {
        return false;
    }
    if delta.starts_with(content.as_str()) {
        content.clear();
        content.push_str(delta);
        return true;
    }

    let max_overlap = content.len().min(delta.len());
    for overlap in (1..=max_overlap).rev() {
        if content.is_char_boundary(content.len() - overlap)
            && delta.is_char_boundary(overlap)
            && content[content.len() - overlap..] == delta[..overlap]
        {
            content.push_str(&delta[overlap..]);
            return delta.len() > overlap;
        }
    }

    content.push_str(delta);
    true
}

fn emit_simulated_cli_stream(label: &str, content: &str) {
    let chars = content.chars().collect::<Vec<_>>();
    if chars.is_empty() {
        return;
    }
    let mut visible = String::new();
    let chunk_size = 220usize;
    for chunk in chars.chunks(chunk_size) {
        visible.extend(chunk.iter());
        emit_ai_progress(
            "streaming",
            &format!("正在接收 {label} 返回..."),
            Some(visible.len()),
            Some(&visible),
        );
        thread::sleep(Duration::from_millis(8));
    }
}

fn shell_quote(value: &str) -> String {
    if value.is_empty() {
        return "''".to_string();
    }
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

fn command_with_user_path(program: &str) -> Command {
    let mut command = Command::new(program);
    command.env("PATH", resolve_user_path());
    command
}

fn resolve_user_path() -> String {
    static CACHED: OnceLock<String> = OnceLock::new();

    CACHED
        .get_or_init(|| {
            let fallback_path = fallback_user_path();
            let shell = env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
            Command::new(&shell)
                .args(["-ilc", "echo ___PATH___:$PATH"])
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .output()
                .ok()
                .and_then(|output| {
                    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                    stdout
                        .lines()
                        .find_map(|line| line.strip_prefix("___PATH___:"))
                        .map(|path| path.trim().to_string())
                })
                .filter(|path| !path.is_empty())
                .unwrap_or(fallback_path)
        })
        .clone()
}

fn fallback_user_path() -> String {
    let mut paths = env::var("PATH").unwrap_or_default();
    let home = env::var("HOME").unwrap_or_default();
    for path in [
        "/opt/homebrew/bin".to_string(),
        "/usr/local/bin".to_string(),
        format!("{home}/.local/bin"),
        format!("{home}/Library/pnpm"),
        format!("{home}/.npm-global/bin"),
        format!("{home}/.yarn/bin"),
    ] {
        if !path.is_empty() && !paths.split(':').any(|item| item == path) {
            if !paths.is_empty() {
                paths.push(':');
            }
            paths.push_str(&path);
        }
    }
    paths
}

fn is_local_cli_provider(provider: &str) -> bool {
    matches!(provider, "codex-cli" | "claude-cli" | "custom-cli")
}

fn expand_home_path(path: &str) -> String {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Ok(home) = env::var("HOME") {
            return format!("{home}/{rest}");
        }
    }
    path.to_string()
}

fn read_ai_stream(
    response: reqwest::blocking::Response,
) -> Result<String, Box<dyn std::error::Error>> {
    let reader = io::BufReader::new(response);
    let mut content = String::new();
    let mut has_stream_event = false;
    let mut last_progress = Instant::now();

    for line in reader.lines() {
        let line = line?;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed.starts_with(':') {
            if content.is_empty() && last_progress.elapsed() >= Duration::from_secs(2) {
                emit_ai_progress(
                    "streaming",
                    "AI 连接保持中，正在等待首段内容...",
                    None,
                    None,
                );
                last_progress = Instant::now();
            }
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
        let delta = extract_api_stream_delta(&object).unwrap_or_default();
        if !append_stream_delta(&mut content, &delta) {
            if content.is_empty() && last_progress.elapsed() >= Duration::from_secs(2) {
                emit_ai_progress(
                    "streaming",
                    "已收到 AI 事件，正在等待内容增量...",
                    None,
                    None,
                );
                last_progress = Instant::now();
            }
            continue;
        }
        emit_ai_progress(
            "streaming",
            "正在接收 AI 返回...",
            Some(content.len()),
            Some(&content),
        );
        last_progress = Instant::now();
    }

    if content.trim().is_empty() {
        if has_stream_event {
            return Err("AI 返回内容为空。".into());
        }
        return Err("AI 没有返回流式响应。".into());
    }
    Ok(content)
}

fn extract_api_stream_delta(value: &Value) -> Option<String> {
    if let Some(choices) = value.get("choices").and_then(Value::as_array) {
        let text = choices
            .iter()
            .filter_map(|choice| {
                choice
                    .get("delta")
                    .or_else(|| choice.get("message"))
                    .or_else(|| choice.get("text"))
                    .and_then(|item| extract_text_from_json_event(item, false))
            })
            .collect::<Vec<_>>()
            .join("");
        if !text.is_empty() {
            return Some(text);
        }
    }

    if let Some(candidates) = value.get("candidates").and_then(Value::as_array) {
        let text = candidates
            .iter()
            .filter_map(|candidate| extract_text_from_json_event(candidate, false))
            .collect::<Vec<_>>()
            .join("");
        if !text.is_empty() {
            return Some(text);
        }
    }

    extract_text_from_json_event(value, false)
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

fn ai_metadata_prompt(request: &AiMetadataRequest) -> String {
    let endpoint = &request.endpoint;
    let case_summary = endpoint
        .cases
        .iter()
        .map(|item| format!("场景：{}\n{}", item.name, truncate_chars(&item.body, 900)))
        .collect::<Vec<_>>()
        .join("\n\n");
    let instruction = if request.instruction.trim().is_empty() {
        "根据接口真实用途重新命名标题，并生成一句简洁说明。"
    } else {
        request.instruction.trim()
    };
    let group_path = endpoint.group_path.as_deref().unwrap_or("");

    format!(
        r#"你是一个资深前端接口 Mock 信息整理助手。请根据接口路径、当前名称、说明、标签、场景和响应体，为这个接口生成更易读的标题和说明。
必须只返回 JSON 对象，不要 Markdown，不要解释，不要代码围栏。

返回格式固定为：
{{
  "name": "简洁接口标题",
  "description": "一句话说明接口用途"
}}

要求：
- name 使用简洁中文业务名称，优先 4 到 16 个中文字符；如果业务名无法可靠判断，可以保留关键英文服务名但去掉冗长包名、域名、版本号和文件后缀。
- description 用一句话说明接口用途，不超过 36 个中文字符；不要复述完整路径。
- 根据响应体字段、message、data 结构和场景名推断业务语义，避免只翻译路径片段。
- 不要把 xapi、api、json、mock、response、1.0、method 等技术噪声放进标题。
- 如果当前标题或说明已经准确，可以小幅优化，不要为了变化而变化。

用户要求：{instruction}

当前名称：{}
请求方法：{}
Override 路径：{}
当前分组：{}
当前说明：{}
标签：{}
当前场景：{}

当前响应体：
{}

已有场景摘要：
{case_summary}
"#,
        endpoint.name,
        endpoint.method,
        endpoint.override_path,
        if group_path.is_empty() {
            "无"
        } else {
            group_path
        },
        if endpoint.description.trim().is_empty() {
            "无"
        } else {
            endpoint.description.trim()
        },
        endpoint.tags.join(", "),
        endpoint.active_case_name,
        truncate_chars(&endpoint.active_body, 5000)
    )
}

fn ai_grouping_prompt(request: &AiGroupingRequest) -> String {
    let endpoint_summary = request
        .endpoints
        .iter()
        .map(|endpoint| {
            format!(
                "- id: {}\n  name: {}\n  method: {}\n  overridePath: {}\n  currentGroup: {}\n  description: {}\n  tags: {}",
                endpoint.id,
                endpoint.name,
                endpoint.method,
                endpoint.override_path,
                endpoint.group_path.as_deref().unwrap_or(""),
                if endpoint.description.trim().is_empty() {
                    "无"
                } else {
                    endpoint.description.trim()
                },
                endpoint.tags.join(", ")
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    let instruction = if request.instruction.trim().is_empty() {
        "按业务域自动归类，分组名使用简洁中文，尽量使用一到两级路径。"
    } else {
        request.instruction.trim()
    };

    format!(
        r#"你是一个资深前端 Mock 接口目录整理助手。请根据接口名称、HTTP 方法、Override 路径、说明、标签和已有分组，为每个接口建议业务分组。
必须只返回 JSON 对象，不要 Markdown，不要解释，不要代码围栏。

返回格式固定为：
{{
  "groups": [
    {{
      "endpointId": "接口 id",
      "groupPath": "业务域/子模块",
      "reason": "可选，简短说明"
    }}
  ]
}}

要求：
- 必须覆盖输入中的每个 endpointId，且不要返回不存在的 endpointId。
- groupPath 使用简洁中文，优先一到两级，例如 用户中心/登录、订单/售后、营销/优惠券。
- 不要把域名、版本号、api、json、mock、response 作为分组名。
- 同一业务域尽量复用同一个 groupPath，不要为每个接口创造过细目录。
- 如果已有 currentGroup 合理，可以沿用或微调。
- reason 不超过 28 个中文字符。

用户要求：{instruction}

接口列表：
{endpoint_summary}
"#
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
            models: HashMap::new(),
            api_key: String::new(),
            api_keys: HashMap::new(),
            base_url: String::new(),
            ai_grouping_prompt: String::new(),
            cli_preset_id: Some("codex-cli".to_string()),
            cli_presets: default_cli_presets(),
        });
    }
    if let Some(settings) = &mut store.ai_settings {
        if !settings.model.trim().is_empty() && !settings.models.contains_key(&settings.provider) {
            settings
                .models
                .insert(settings.provider.clone(), settings.model.clone());
        }
        if let Some(provider_model) = settings.models.get(&settings.provider) {
            settings.model = provider_model.clone();
        }
        let existing_presets = settings.cli_presets.clone();
        let custom_presets = existing_presets
            .iter()
            .filter(|preset| !matches!(preset.id.as_str(), "codex-cli" | "claude-cli"))
            .cloned()
            .collect::<Vec<_>>();
        settings.cli_presets = default_cli_presets()
            .into_iter()
            .map(|default_preset| {
                existing_presets
                    .iter()
                    .find(|preset| preset.id == default_preset.id)
                    .cloned()
                    .unwrap_or(default_preset)
            })
            .chain(custom_presets)
            .collect();
        if settings.cli_preset_id.is_none() && is_local_cli_provider(&settings.provider) {
            settings.cli_preset_id = Some(if settings.provider == "custom-cli" {
                "codex-cli".to_string()
            } else {
                settings.provider.clone()
            });
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_curl_preserves_cookie_option() {
        let parsed = parse_curl(
            "curl 'https://xy-api.ele.me/alsc-xy-base-core-api?method=foo' \
              -H 'content-type: application/json;charset=UTF-8' \
              -b 'cna=abc; XY_TOKEN=token-value' \
              --data-raw '{\"params\":{}}'",
        )
        .expect("curl should parse");

        assert_eq!(parsed.method, "POST");
        assert_eq!(
            parsed.headers.get("Cookie").map(String::as_str),
            Some("cna=abc; XY_TOKEN=token-value")
        );
    }

    #[test]
    fn parse_curl_merges_cookie_header_and_option() {
        let parsed = parse_curl(
            "curl 'https://example.com/api' \
              -H 'Cookie: first=1' \
              --cookie 'second=2'",
        )
        .expect("curl should parse");

        assert_eq!(
            parsed.headers.get("Cookie").map(String::as_str),
            Some("first=1; second=2")
        );
    }

    #[test]
    fn parse_curl_maps_common_request_options() {
        let parsed = parse_curl(
            "curl --url 'https://example.com/api' \
              -A 'MockKitAgent/1.0' \
              -e 'https://example.com/page' \
              -u 'user:pass' \
              --compressed \
              --insecure",
        )
        .expect("curl should parse");

        assert_eq!(
            parsed.headers.get("User-Agent").map(String::as_str),
            Some("MockKitAgent/1.0")
        );
        assert_eq!(
            parsed.headers.get("Referer").map(String::as_str),
            Some("https://example.com/page")
        );
        assert_eq!(
            parsed.headers.get("Accept-Encoding").map(String::as_str),
            Some("gzip, deflate, br, zstd")
        );
        assert_eq!(
            parsed.basic_auth,
            Some(("user".to_string(), Some("pass".to_string())))
        );
        assert!(parsed.accept_invalid_certs);
    }

    #[test]
    fn parse_curl_get_appends_data_to_query() {
        let parsed = parse_curl("curl -G 'https://example.com/api?existing=1' -d 'next=2'")
            .expect("curl should parse");

        assert_eq!(parsed.method, "GET");
        assert_eq!(
            parsed.url.as_str(),
            "https://example.com/api?existing=1&next=2"
        );
        assert!(parsed.body.is_none());
    }

    #[test]
    fn api_stream_delta_supports_openai_and_gemini_shapes() {
        let openai = json!({
            "choices": [
                { "delta": { "content": "hello" } }
            ]
        });
        let gemini = json!({
            "candidates": [
                { "content": { "parts": [{ "text": " world" }] } }
            ]
        });

        assert_eq!(extract_api_stream_delta(&openai).as_deref(), Some("hello"));
        assert_eq!(extract_api_stream_delta(&gemini).as_deref(), Some(" world"));
    }

    #[test]
    fn cli_json_delta_supports_common_output_text_events() {
        let line = r#"{"type":"response.output_text.delta","delta":"hello"}"#;
        assert_eq!(extract_json_event_delta(line).as_deref(), Some("hello"));
    }

    #[test]
    fn append_stream_delta_deduplicates_full_snapshots() {
        let mut content = String::from("hello");
        assert!(append_stream_delta(&mut content, "hello world"));
        assert_eq!(content, "hello world");
        assert!(!append_stream_delta(&mut content, " world"));
        assert_eq!(content, "hello world");
    }

    #[test]
    fn import_curl_creates_only_default_case_for_new_endpoint() {
        let mut store = default_store("");
        let (_endpoint_id, case_id) =
            import_curl(&mut store, "curl 'https://example.com/api/users'", false)
                .expect("curl should import");

        assert_eq!(store.endpoints.len(), 1);
        let endpoint = &store.endpoints[0];
        assert_eq!(endpoint.active_case_id.as_deref(), Some(case_id.as_str()));
        assert_eq!(endpoint.cases.len(), 1);
        assert_eq!(endpoint.cases[0].name, "Default");
    }

    #[test]
    fn import_curl_uses_url_as_new_endpoint_name() {
        let mut store = default_store("");
        import_curl(
            &mut store,
            "curl 'https://message-api.ele.me/invoke/?method=MessageV2Service.pollingNotify'",
            false,
        )
        .expect("curl should import");

        assert_eq!(
            store.endpoints[0].name,
            "message-api.ele.me/invoke/?method=MessageV2Service.pollingNotify"
        );
    }

    #[test]
    fn import_curl_does_not_request_when_fetch_response_is_false() {
        let mut store = default_store("");
        import_curl(&mut store, "curl 'http://127.0.0.1:9/api/users'", false)
            .expect("curl import should not perform the request");

        assert_eq!(store.endpoints.len(), 1);
        assert_eq!(store.endpoints[0].cases[0].body, "");
    }

    #[test]
    fn cli_endpoint_selectors_match_endpoint_group_and_text() {
        let mut store = default_store("");
        store.endpoints = vec![
            Endpoint {
                id: "endpoint-users".to_string(),
                name: "Users".to_string(),
                method: "GET".to_string(),
                override_path: "example.com/api/users".to_string(),
                group_path: Some("api/users".to_string()),
                description: String::new(),
                tags: vec!["account".to_string()],
                enabled: Some(true),
                active_case_id: None,
                cases: vec![],
            },
            Endpoint {
                id: "endpoint-orders".to_string(),
                name: "Orders".to_string(),
                method: "GET".to_string(),
                override_path: "example.com/api/orders".to_string(),
                group_path: Some("api/orders".to_string()),
                description: String::new(),
                tags: vec!["commerce".to_string()],
                enabled: Some(true),
                active_case_id: None,
                cases: vec![],
            },
        ];

        assert_eq!(
            matching_endpoint_indices(
                &store,
                &[CliEndpointSelector::Endpoint("endpoint-users".to_string())],
            )
            .expect("endpoint should match"),
            vec![0]
        );
        assert_eq!(
            matching_endpoint_indices(
                &store,
                &[CliEndpointSelector::Endpoint("endpoint".to_string())],
            )
            .expect_err("ambiguous short id should be rejected")
            .to_string(),
            "endpoint query is ambiguous: endpoint"
        );
        assert_eq!(
            matching_endpoint_indices(
                &store,
                &[CliEndpointSelector::Endpoint("endpoint-u".to_string())],
            )
            .expect("short id should match"),
            vec![0]
        );
        assert_eq!(
            matching_endpoint_indices(&store, &[CliEndpointSelector::Group("api".to_string())])
                .expect("group should match"),
            vec![0, 1]
        );
        assert_eq!(
            matching_endpoint_indices(
                &store,
                &[CliEndpointSelector::Matching("commerce".to_string())]
            )
            .expect("tag should match"),
            vec![1]
        );
    }
}
