export interface Store {
  overridesFolder: string;
  mockEnabled: boolean;
  chromeProfile?: ChromeProfileState | null;
  aiSettings?: AiSettings | null;
  uiSettings?: UiSettings | null;
  groupPaths?: string[];
  endpoints: Endpoint[];
}

export type AppTheme =
  | "mockkit"
  | "claude"
  | "kodama-grove"
  | "soft-pop"
  | "spotify"
  | "modern-minimal"
  | "violet-bloom"
  | "nature"
  | "retro-arcade"
  | "bubblegum";

export interface UiSettings {
  theme: AppTheme;
}

export type AiProvider =
  | "openai"
  | "openrouter"
  | "gemini"
  | "compatible"
  | "codex-cli"
  | "claude-cli"
  | "custom-cli";

export type AiCliStreamMode = "plain" | "json-events" | "claude-stream-json";

export interface AiCliPreset {
  id: string;
  name: string;
  model?: string;
  command: string;
  streamMode: AiCliStreamMode;
}

export interface AiSettings {
  enabled: boolean;
  provider: AiProvider;
  model: string;
  models?: Partial<Record<AiProvider, string>>;
  apiKey: string;
  apiKeys?: Partial<Record<AiProvider, string>>;
  baseUrl: string;
  aiGroupingPrompt?: string;
  cliPresetId?: string;
  cliPresets?: AiCliPreset[];
}

export interface ChromeProfileState {
  profileName: string;
  preferencesPath: string;
  localOverridesEnabled: "enabled" | "disabled" | "unknown" | string;
  overridesFolder?: string | null;
  detectedAt: string;
}

export interface Endpoint {
  id: string;
  name: string;
  method: string;
  overridePath: string;
  groupPath?: string | null;
  description: string;
  tags: string[];
  enabled?: boolean;
  activeCaseId?: string | null;
  cases: MockCase[];
}

export interface MockCase {
  id: string;
  name: string;
  body: string;
  status: number;
  headers: string;
}

export interface EndpointSearchMatch {
  responseBody?: {
    caseName: string;
    snippet: string;
  };
}

export interface NativePayload {
  store?: Store;
  message?: string;
  error?: string;
  importedEndpointId?: string;
  importedCaseId?: string;
  aiPreview?: AiPreview;
  aiMetadataPreview?: AiMetadataPreview;
  aiMetadataEndpointId?: string;
  aiGroupingPreview?: AiGroupingPreview;
  aiGroupingRequestId?: string;
  aiProgress?: AiProgress;
}

export interface NativeMessage {
  command: string;
  store?: Store;
  path?: string;
  curl?: string;
  fetchResponse?: boolean;
  aiRequest?: AiRequest;
  aiMetadataRequest?: AiMetadataRequest;
  aiGroupingRequest?: AiGroupingRequest;
  aiGroupingRequestId?: string;
}

export interface AiRequest {
  mode: "single" | "multiple";
  instruction: string;
  endpoint: {
    name: string;
    method: string;
    overridePath: string;
    description: string;
    activeCaseName: string;
    activeBody: string;
    cases: Array<{ name: string; body: string }>;
  };
}

export interface AiPreview {
  mode: "single" | "multiple";
  cases: Array<{
    name: string;
    body: string;
    description?: string;
  }>;
}

export interface AiMetadataRequest {
  instruction: string;
  endpoint: {
    id: string;
    name: string;
    method: string;
    overridePath: string;
    groupPath?: string | null;
    description: string;
    tags: string[];
    activeCaseName: string;
    activeBody: string;
    cases: Array<{ name: string; body: string }>;
  };
}

export interface AiMetadataPreview {
  endpointId: string;
  name: string;
  description: string;
}

export interface AiProgress {
  stage: "starting" | "preparing" | "connecting" | "streaming" | "parsing" | "complete" | "error" | string;
  message: string;
  bytes?: number | null;
  content?: string | null;
}

export interface AiGroupingRequest {
  instruction: string;
  endpoints: Array<{
    id: string;
    name: string;
    method: string;
    overridePath: string;
    groupPath?: string | null;
    description: string;
    tags: string[];
  }>;
}

export interface AiGroupingPreview {
  groups: Array<{
    endpointId: string;
    groupPath: string;
    reason?: string;
  }>;
}
