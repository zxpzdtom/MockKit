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

export type AiProvider = "openai" | "openrouter" | "gemini" | "compatible";

export interface AiSettings {
  enabled: boolean;
  provider: AiProvider;
  model: string;
  apiKey: string;
  apiKeys?: Partial<Record<AiProvider, string>>;
  baseUrl: string;
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

export interface NativePayload {
  store?: Store;
  message?: string;
  error?: string;
  importedEndpointId?: string;
  importedCaseId?: string;
  aiPreview?: AiPreview;
  aiProgress?: AiProgress;
}

export interface NativeMessage {
  command: string;
  store?: Store;
  path?: string;
  curl?: string;
  fetchResponse?: boolean;
  aiRequest?: AiRequest;
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

export interface AiProgress {
  stage: "starting" | "preparing" | "connecting" | "streaming" | "parsing" | "complete" | "error" | string;
  message: string;
  bytes?: number | null;
  content?: string | null;
}
