import { AiGroupingDialog } from "@/components/ai-grouping-dialog";
import { AiGroupingScopeDialog } from "@/components/ai-grouping-scope-dialog";
import { AppSettingsDialog } from "@/components/app-settings-dialog";
import { AppSidebar } from "@/components/app-sidebar";
import { CreateGroupDialog } from "@/components/create-group-dialog";
import { DeleteConfirmDialog, type DeleteDialogTarget } from "@/components/delete-confirm-dialog";
import { EndpointListPanel } from "@/components/endpoint-list-panel";
import { ImportCurlDialog } from "@/components/import-curl-dialog";
import { MainToolbar } from "@/components/main-toolbar";
import ResponseBodyEditor from "@/components/response-body-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  dialogCloseButtonClass,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Toaster } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { FileContents } from "@pierre/diffs/react";
import {
  Braces,
  Check,
  ChevronRight,
  Copy,
  FileJson,
  FolderClosed,
  FolderOpen,
  Loader2,
  Maximize2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  WrapText,
  X,
} from "lucide-react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  WheelEvent as ReactWheelEvent,
} from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast as sonnerToast } from "sonner";
import { formatJson, getJsonStatus } from "./lib/json";
import { send } from "./lib/native";
import { generateEndpointTypeScript } from "./lib/typescript-from-json";
import type {
  AiCliPreset,
  AiGroupingPreview,
  AiMetadataPreview,
  AiPreview,
  AiProgress,
  AiSettings,
  AppTheme,
  Endpoint,
  EndpointSearchMatch,
  MockCase,
  NativePayload,
  Store,
  UiSettings,
} from "./types";

const successBody = '{\n  "code": 200,\n  "message": "success",\n  "data": {}\n}';
const failureBody = '{\n  "code": 500,\n  "message": "server error",\n  "data": null\n}';
const emptyBody = '{\n  "code": 200,\n  "message": "success",\n  "data": []\n}';
const defaultAiGroupingPrompt =
  "你是一个资深前端 Mock 接口目录整理助手。请按业务域为接口建议分组。分组名使用简洁中文，优先一到两级路径；优先复用语义相近的已有分组；不要把域名、版本号、api、json、mock、response 作为分组名；不要为每个接口创造过细目录。";
const defaultAiSettings: AiSettings = {
  enabled: false,
  provider: "openrouter",
  model: "",
  models: {},
  apiKey: "",
  apiKeys: {},
  baseUrl: "",
  aiGroupingPrompt: defaultAiGroupingPrompt,
  cliPresetId: "codex-cli",
  cliPresets: [],
};
type SettingsSection = "appearance" | "ai" | "cli";
const defaultCliPresets: AiCliPreset[] = [
  {
    id: "codex-cli",
    name: "Codex CLI",
    model: "",
    command:
      "codex exec --json --ephemeral --skip-git-repo-check --sandbox read-only --disable hooks --output-last-message {output} -",
    streamMode: "json-events",
  },
  {
    id: "claude-cli",
    name: "Claude CLI",
    model: "",
    command:
      "claude -p --no-session-persistence --output-format stream-json --include-partial-messages --verbose {prompt}",
    streamMode: "claude-stream-json",
  },
];
const defaultUiSettings: UiSettings = {
  theme: "mockkit",
};
const appThemes = new Set<AppTheme>([
  "mockkit",
  "claude",
  "kodama-grove",
  "soft-pop",
  "spotify",
  "modern-minimal",
  "violet-bloom",
  "nature",
  "retro-arcade",
  "bubblegum",
]);
const localAiProviders = new Set<AiSettings["provider"]>(["codex-cli", "claude-cli", "custom-cli"]);
function defaultModelForProvider(provider: AiSettings["provider"]) {
  if (provider === "gemini") return "gemini-2.5-flash";
  if (provider === "openai") return "gpt-4.1-mini";
  return "";
}

const nativeDragRegionSelector = "[data-native-drag-region='true']";
const codeEditorShortcutScopeSelector =
  ".cm-editor, .code-editor, .fullscreen-code-editor, .curl-code-editor";
const nativeNoDragSelector = [
  "button",
  "input",
  "textarea",
  "select",
  "a",
  "[role='button']",
  "[contenteditable='true']",
  "[data-native-no-drag='true']",
].join(",");
const panelLabelClass = "text-[11px] font-[650] uppercase tracking-[0.02em] text-[var(--muted)]";
const editTriggerClass =
  "inline-flex size-[18px] min-h-[18px] min-w-[18px] rounded-[7px] text-[color-mix(in_srgb,var(--muted)_76%,var(--text))] opacity-[0.46] align-[-2px] hover:bg-[color-mix(in_srgb,var(--panel-3)_78%,transparent)] hover:text-[var(--text)] hover:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 [&_svg]:size-2.5";
const editorActionsClass =
  "flex items-center gap-[5px] [&_[data-slot=button]]:h-7 [&_[data-slot=button]]:rounded-[7px] [&_[data-slot=button]]:border-transparent [&_[data-slot=button]]:bg-[color-mix(in_srgb,var(--panel)_58%,transparent)] [&_[data-slot=button]]:text-[color-mix(in_srgb,var(--text)_82%,var(--muted))] [&_[data-slot=button]]:shadow-none [&_[data-slot=button]]:transition-[background-color,border-color,box-shadow,color,transform] [&_[data-slot=button]]:duration-[120ms] hover:[&_[data-slot=button]]:border-[color-mix(in_srgb,var(--accent)_18%,transparent)] hover:[&_[data-slot=button]]:bg-[color-mix(in_srgb,var(--accent-soft)_42%,var(--panel))] hover:[&_[data-slot=button]]:text-[color-mix(in_srgb,var(--accent)_34%,var(--text))] hover:[&_[data-slot=button]]:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_7%,transparent)] active:[&_[data-slot=button]]:translate-y-px active:[&_[data-slot=button]]:border-[color-mix(in_srgb,var(--accent)_24%,transparent)] active:[&_[data-slot=button]]:bg-[color-mix(in_srgb,var(--accent-soft)_60%,var(--panel-2))] active:[&_[data-slot=button]]:shadow-[inset_0_1px_1px_rgba(15,23,42,0.08)] [&_[data-slot=button][aria-pressed=true]]:border-[color-mix(in_srgb,var(--accent)_32%,transparent)] [&_[data-slot=button][aria-pressed=true]]:bg-[color-mix(in_srgb,var(--accent-soft)_58%,var(--panel))] [&_[data-slot=button][aria-pressed=true]]:text-[color-mix(in_srgb,var(--accent)_42%,var(--text))] [&_[data-slot=button][aria-pressed=true]]:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_10%,transparent)]";
const createId = () => crypto.randomUUID();

function isCodeEditorShortcutTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(codeEditorShortcutScopeSelector));
}

function formatDetectedAt(value?: string) {
  if (!value) return "尚未完成检测";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚";
  return `上次检测 ${new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date)}`;
}

function activeCase(endpoint: Endpoint | null) {
  if (!endpoint) return null;
  return endpoint.cases.find((item) => item.id === endpoint.activeCaseId) ?? endpoint.cases[0] ?? null;
}

function renderReadablePath(path: string): ReactNode {
  const nodes: ReactNode[] = [];
  const segments = path.split("/");
  let segmentOffset = 0;

  for (const segment of segments) {
    const pieces = segment.split(".");
    const segmentNodes: ReactNode[] = [];
    let pieceOffset = segmentOffset;

    for (const piece of pieces) {
      segmentNodes.push(
        <span key={`piece-${pieceOffset}`}>
          {piece ? <span className="endpoint-path-token">{piece}</span> : null}
          {pieceOffset + piece.length >= segmentOffset + segment.length ? null : (
            <>
              <span className="endpoint-path-separator">.</span>
              <wbr />
            </>
          )}
        </span>,
      );
      pieceOffset += piece.length + 1;
    }

    nodes.push(<span key={`segment-${segmentOffset}`}>{segmentNodes}</span>);
    segmentOffset += segment.length;
    if (segmentOffset < path.length) {
      nodes.push(
        <span key={`slash-${segmentOffset}`}>
          <span className="endpoint-path-separator">/</span>
          <wbr />
        </span>,
      );
      segmentOffset += 1;
    }
  }

  return nodes;
}

async function copyTextToClipboard(text: string) {
  try {
    if (!navigator.clipboard?.writeText) {
      throw new Error("Clipboard API unavailable");
    }
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      return document.execCommand("copy");
    } finally {
      document.body.removeChild(textarea);
    }
  }
}

function ErrorToastCopyButton({ message }: { message: string }) {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    };
  }, []);

  const handleClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    void copyTextToClipboard(message)
      .then((success) => {
        if (!success) {
          sonnerToast.error("复制失败，请手动复制错误信息");
          return;
        }
        setCopied(true);
        if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
        resetTimerRef.current = window.setTimeout(() => setCopied(false), 1400);
      })
      .catch(() => sonnerToast.error("复制失败，请手动复制错误信息"));
  };

  return (
    <button
      aria-label={copied ? "错误信息已复制" : "复制错误信息"}
      className="toast-copy-button"
      data-copied={copied ? "true" : undefined}
      data-mockkit-toast-guard=""
      onClick={handleClick}
      type="button"
    >
      <Copy aria-hidden="true" className="toast-copy-icon copy" size={14} strokeWidth={1.9} />
      <Check aria-hidden="true" className="toast-copy-icon check" size={14} strokeWidth={2.15} />
    </button>
  );
}

function ErrorToastMessage({ message }: { message: string }) {
  return <span data-mockkit-toast-guard="">{message}</span>;
}

function normalizeStore(store: Store) {
  store.aiSettings = { ...defaultAiSettings, ...(store.aiSettings ?? {}) };
  store.uiSettings = { ...defaultUiSettings, ...(store.uiSettings ?? {}) };
  if (!appThemes.has(store.uiSettings.theme)) store.uiSettings.theme = defaultUiSettings.theme;
  store.aiSettings.models = { ...(store.aiSettings.models ?? {}) };
  store.aiSettings.apiKeys = { ...(store.aiSettings.apiKeys ?? {}) };
  const customPresets = (store.aiSettings.cliPresets ?? []).filter(
    (preset) => !defaultCliPresets.some((defaultPreset) => defaultPreset.id === preset.id),
  );
  store.aiSettings.cliPresets = [
    ...defaultCliPresets.map((defaultPreset) => ({
      ...defaultPreset,
      ...(store.aiSettings?.cliPresets ?? []).find((preset) => preset.id === defaultPreset.id),
    })),
    ...customPresets,
  ];
  if (!store.aiSettings.cliPresetId) {
    store.aiSettings.cliPresetId = localAiProviders.has(store.aiSettings.provider)
      ? store.aiSettings.provider === "custom-cli"
        ? defaultAiSettings.cliPresetId
        : store.aiSettings.provider
      : defaultAiSettings.cliPresetId;
  }
  if (localAiProviders.has(store.aiSettings.provider) && store.aiSettings.model.trim()) {
    store.aiSettings.cliPresets = store.aiSettings.cliPresets.map((preset) =>
      preset.id === store.aiSettings?.cliPresetId && !preset.model
        ? { ...preset, model: store.aiSettings?.model ?? "" }
        : preset,
    );
  }
  if (store.aiSettings.apiKey && !store.aiSettings.apiKeys[store.aiSettings.provider]) {
    store.aiSettings.apiKeys[store.aiSettings.provider] = store.aiSettings.apiKey;
  }
  store.aiSettings.apiKey = store.aiSettings.apiKeys[store.aiSettings.provider] ?? store.aiSettings.apiKey;
  if (store.aiSettings.model && !store.aiSettings.models[store.aiSettings.provider]) {
    store.aiSettings.models[store.aiSettings.provider] = store.aiSettings.model;
  }
  store.aiSettings.model =
    store.aiSettings.models[store.aiSettings.provider] ??
    store.aiSettings.model ??
    defaultModelForProvider(store.aiSettings.provider);
  store.groupPaths = normalizeGroupPaths(store.groupPaths ?? []);
  for (const endpoint of store.endpoints) {
    endpoint.enabled = endpoint.enabled !== false;
    endpoint.groupPath = cleanGroupPath(endpoint.groupPath ?? "") || null;
    if (!endpoint.activeCaseId || !endpoint.cases.some((item) => item.id === endpoint.activeCaseId)) {
      endpoint.activeCaseId = endpoint.cases[0]?.id ?? null;
    }
  }
  return store;
}

function cleanGroupPath(path: string) {
  return path
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/");
}

function parseApiKeys(apiKeyText: string) {
  return [
    ...new Set(
      apiKeyText
        .split(/[,\n]/)
        .map((key) => key.trim())
        .filter(Boolean),
    ),
  ];
}

function normalizeGroupPaths(paths: string[]) {
  return [...new Set(paths.map(cleanGroupPath).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function caseFile(endpoint: Endpoint | null, mockCase: MockCase | null): FileContents {
  return {
    name: endpoint?.overridePath || "response.json",
    contents: mockCase?.body || "",
    lang: "json",
    cacheKey: `${endpoint?.id ?? "empty"}-${mockCase?.id ?? "empty"}-${mockCase?.body.length ?? 0}`,
  };
}

function updateCaseTabsScrollState(element: HTMLElement) {
  const maxScrollLeft = Math.max(0, element.scrollWidth - element.clientWidth);
  element.dataset.scrollLeft = element.scrollLeft > 1 ? "true" : "";
  element.dataset.scrollRight = element.scrollLeft < maxScrollLeft - 1 ? "true" : "";
}

function uniqueOverridePath(basePath: string, endpoints: Endpoint[]) {
  const usedPaths = new Set(endpoints.map((item) => item.overridePath));
  if (!usedPaths.has(basePath)) return basePath;

  const dotIndex = basePath.lastIndexOf(".");
  const slashIndex = basePath.lastIndexOf("/");
  const hasExtension = dotIndex > slashIndex;
  const stem = hasExtension ? basePath.slice(0, dotIndex) : basePath;
  const extension = hasExtension ? basePath.slice(dotIndex) : "";

  for (let index = 2; ; index += 1) {
    const candidate = `${stem}-${index}${extension}`;
    if (!usedPaths.has(candidate)) return candidate;
  }
}

interface TreeNode {
  id: string;
  type: "directory" | "file";
  label: string;
  path: string;
  count: number;
  depth: number;
  custom: boolean;
  endpointId?: string;
  children: TreeNode[];
}

type DirectoryViewMode = "tree" | "flat";

interface CompactTreeNode extends TreeNode {
  children: CompactTreeNode[];
}

type DeleteTarget = DeleteDialogTarget;

interface PersistedUiState {
  selectedDirectory: string;
  selectedEndpointId: string | null;
  selectedCaseId: string | null;
  expandedDirectories: string[];
  directoryViewMode: DirectoryViewMode;
  focusedTreeNodeId: string;
}

const persistedUiStateKey = "mockkit.uiState.v1";

function readPersistedUiState(): PersistedUiState {
  const fallback: PersistedUiState = {
    selectedDirectory: "",
    selectedEndpointId: null,
    selectedCaseId: null,
    expandedDirectories: [""],
    directoryViewMode: "tree",
    focusedTreeNodeId: directoryTreeNodeKey(""),
  };

  try {
    const raw = window.localStorage.getItem(persistedUiStateKey);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PersistedUiState>;
    const selectedDirectory = cleanGroupPath(parsed.selectedDirectory ?? "");
    const expandedDirectories = Array.isArray(parsed.expandedDirectories)
      ? [...new Set(["", ...parsed.expandedDirectories.map((path) => cleanGroupPath(path)).filter(Boolean)])]
      : fallback.expandedDirectories;

    return {
      selectedDirectory,
      selectedEndpointId: typeof parsed.selectedEndpointId === "string" ? parsed.selectedEndpointId : null,
      selectedCaseId: typeof parsed.selectedCaseId === "string" ? parsed.selectedCaseId : null,
      expandedDirectories,
      directoryViewMode: parsed.directoryViewMode === "flat" ? "flat" : "tree",
      focusedTreeNodeId:
        typeof parsed.focusedTreeNodeId === "string" && parsed.focusedTreeNodeId
          ? parsed.focusedTreeNodeId
          : directoryTreeNodeKey(selectedDirectory),
    };
  } catch {
    return fallback;
  }
}

function writePersistedUiState(state: PersistedUiState) {
  try {
    window.localStorage.setItem(persistedUiStateKey, JSON.stringify(state));
  } catch {
    // Persistence is a convenience; keep the app usable if storage is unavailable.
  }
}

function buildDirectoryTree(endpoints: Endpoint[], groupPaths: string[] = []) {
  const root: TreeNode = {
    id: "root",
    type: "directory",
    label: "Overrides 根目录",
    path: "",
    count: endpoints.length,
    depth: 0,
    custom: false,
    children: [],
  };
  const nodeMap = new Map<string, TreeNode>([["", root]]);

  const ensureNode = (directoryPath: string) => {
    const directoryParts = directoryPath.split("/").filter(Boolean);
    let current = root;
    let path = "";

    for (const part of directoryParts) {
      path = path ? `${path}/${part}` : part;
      let node = nodeMap.get(path);
      if (!node) {
        node = {
          id: path,
          type: "directory",
          label: part,
          path,
          count: 0,
          depth: path.split("/").length,
          custom: false,
          children: [],
        };
        nodeMap.set(path, node);
        current.children.push(node);
      }
      current = node;
    }
    return current;
  };

  for (const groupPath of groupPaths) {
    const node = ensureNode(groupPath);
    node.custom = true;
  }

  for (const endpoint of endpoints) {
    const directoryPath = getEndpointDirectoryPath(endpoint);
    const directoryParts = directoryPath.split("/").filter(Boolean);
    let path = "";

    for (const part of directoryParts) {
      path = path ? `${path}/${part}` : part;
      const node = nodeMap.get(path) ?? ensureNode(path);
      node.count += 1;
    }

    const directoryNode = ensureNode(directoryPath);
    const fileLabel = getEndpointTreeLabel(endpoint);
    directoryNode.children.push({
      id: `endpoint:${endpoint.id}`,
      type: "file",
      label: fileLabel,
      path: endpoint.overridePath,
      count: 1,
      depth: directoryNode.depth + 1,
      custom: false,
      endpointId: endpoint.id,
      children: [],
    });
  }

  const sortChildren = (node: TreeNode) => {
    node.children.sort((left, right) => {
      if (left.type !== right.type) return left.type === "directory" ? -1 : 1;
      if (left.custom !== right.custom) return left.custom ? -1 : 1;
      return left.label.localeCompare(right.label);
    });
    for (const child of node.children) sortChildren(child);
  };
  sortChildren(root);

  return root;
}

function getEndpointDirectoryPath(endpoint: Endpoint) {
  const groupPath = endpoint.groupPath?.trim().replace(/^\/+|\/+$/g, "");
  if (groupPath) return groupPath;
  const parts = endpoint.overridePath.split("/").filter(Boolean);
  return (parts.length > 1 ? parts.slice(0, -1) : parts).join("/");
}

function getEndpointTreeLabel(endpoint: Endpoint) {
  const title = endpoint.name.trim();
  if (title) return title;
  const parts = endpoint.overridePath.split("/").filter(Boolean);
  return parts[parts.length - 1] || "response.json";
}

function buildCompactDirectoryTree(node: TreeNode, endpoints: Endpoint[]) {
  const directEndpoints = (path: string) =>
    endpoints.some((endpoint) => getEndpointDirectoryPath(endpoint) === path);
  const compactNode = (source: TreeNode, depth: number): CompactTreeNode => {
    if (source.type === "file") {
      return { ...source, depth, children: [] };
    }

    const labels = [source.label];
    let current = source;
    while (
      current.path &&
      current.children.filter((child) => child.type === "directory").length === 1 &&
      current.children.every((child) => child.type === "directory") &&
      !directEndpoints(current.path) &&
      !current.custom
    ) {
      const nextDirectory = current.children.find((child) => child.type === "directory");
      if (!nextDirectory) break;
      current = nextDirectory;
      labels.push(current.label);
    }

    return {
      ...current,
      id: current.path || source.id,
      label: source.path ? labels.join("/") : source.label,
      depth,
      children: current.children.map((child) => compactNode(child, depth + 1)),
    };
  };

  return {
    ...node,
    depth: 0,
    children: node.children.map((child) => compactNode(child, 1)),
  } satisfies CompactTreeNode;
}

function visibleTreeNodes(root: TreeNode, expandedPaths: Set<string>) {
  const nodes: TreeNode[] = [];
  const visit = (node: TreeNode) => {
    nodes.push(node);
    if (!expandedPaths.has(node.path)) return;
    for (const child of node.children) visit(child);
  };
  visit(root);
  return nodes;
}

function isEndpointInDirectory(endpoint: Endpoint, directory: string) {
  const path = getEndpointDirectoryPath(endpoint);
  return !directory || path === directory || path.startsWith(`${directory}/`);
}

function isPathInside(path: string, parent: string) {
  return path === parent || path.startsWith(`${parent}/`);
}

function reparentPath(path: string, source: string, target: string) {
  const parts = source.split("/").filter(Boolean);
  const name = parts[parts.length - 1] ?? source;
  const nextRoot = target ? `${target}/${name}` : name;
  const suffix = path === source ? "" : path.slice(source.length);
  return `${nextRoot}${suffix}`;
}

function parentDirectoryPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function ancestorDirectoryPaths(path: string) {
  const parts = path.split("/").filter(Boolean);
  const ancestors = [""];
  for (let index = 1; index <= parts.length; index += 1) {
    ancestors.push(parts.slice(0, index).join("/"));
  }
  return ancestors;
}

function directoryDomId(path: string) {
  return path || "__root__";
}

function treeNodeKey(node: TreeNode) {
  return node.type === "file" ? `file:${node.endpointId ?? node.path}` : `directory:${node.path}`;
}

function directoryTreeNodeKey(path: string) {
  return `directory:${path}`;
}

function endpointTreeNodeKey(endpointId?: string) {
  return endpointId ? `file:${endpointId}` : "";
}

function treeNodeDomId(key: string) {
  return `tree-node-${key || "directory:"}`;
}

function parseSearchQuery(query: string, regexEnabled: boolean) {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const regexMatch = trimmed.match(/^\/(.+)\/([dgimsuvy]*)$/);
  if (regexEnabled || regexMatch) {
    const pattern = regexMatch ? regexMatch[1] : trimmed;
    const rawFlags = regexMatch ? regexMatch[2] : "";
    const flags = rawFlags.includes("i") ? rawFlags : `${rawFlags}i`;
    try {
      return {
        flags,
        matcher: (value: string) => new RegExp(pattern, flags).test(value),
        mode: "regex" as const,
        pattern,
        raw: trimmed,
      };
    } catch {
      return {
        matcher: (value: string) => value.toLowerCase().includes(trimmed.toLowerCase()),
        mode: "text" as const,
        raw: trimmed,
      };
    }
  }

  const normalizedQuery = trimmed.toLowerCase();
  return {
    matcher: (value: string) => value.toLowerCase().includes(normalizedQuery),
    mode: "text" as const,
    raw: trimmed,
  };
}

type ParsedSearchQuery = NonNullable<ReturnType<typeof parseSearchQuery>>;

function compactSearchSnippet(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function responseBodySnippet(body: string, search: ParsedSearchQuery) {
  const compactBody = compactSearchSnippet(body);
  if (!compactBody) return "";

  let matchIndex = 0;
  let matchLength = search.raw.length;
  if (search.mode === "regex" && search.pattern && search.flags) {
    try {
      const match = new RegExp(search.pattern, search.flags.replace(/g/g, "")).exec(compactBody);
      if (match?.index !== undefined) {
        matchIndex = match.index;
        matchLength = Math.max(match[0].length, matchLength);
      }
    } catch {
      matchIndex = 0;
    }
  } else {
    const index = compactBody.toLowerCase().indexOf(search.raw.toLowerCase());
    matchIndex = index >= 0 ? index : 0;
  }

  const radius = 42;
  const start = Math.max(0, matchIndex - radius);
  const end = Math.min(compactBody.length, matchIndex + matchLength + radius);
  return `${start > 0 ? "..." : ""}${compactBody.slice(start, end)}${end < compactBody.length ? "..." : ""}`;
}

function endpointSearchMatch(endpoint: Endpoint, search: ParsedSearchQuery) {
  const haystack = `${endpoint.name} ${endpoint.method} ${endpoint.overridePath} ${endpoint.description}`;
  const metadataMatched = search.matcher(haystack);
  const bodyCase = endpoint.cases.find((mockCase) => search.matcher(mockCase.body));
  if (!metadataMatched && !bodyCase) return null;

  const match: EndpointSearchMatch = {};
  if (bodyCase) {
    match.responseBody = {
      caseName: bodyCase.name,
      snippet: responseBodySnippet(bodyCase.body, search),
    };
  }
  return match;
}

export function App() {
  const [store, setStore] = useState<Store | null>(null);
  const [persistedUiState] = useState(() => readPersistedUiState());
  const [selectedEndpointId, setSelectedEndpointId] = useState<string | null>(
    persistedUiState.selectedEndpointId,
  );
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(persistedUiState.selectedCaseId);
  const [selectedEndpointIds, setSelectedEndpointIds] = useState(() => new Set<string>());
  const [selectionAnchorEndpointId, setSelectionAnchorEndpointId] = useState<string | null>(null);
  const [selectedDirectory, setSelectedDirectory] = useState(persistedUiState.selectedDirectory);
  const [focusedTreeNodeId, setFocusedTreeNodeId] = useState(persistedUiState.focusedTreeNodeId);
  const [directoryViewMode, setDirectoryViewMode] = useState<DirectoryViewMode>(
    persistedUiState.directoryViewMode,
  );
  const [dragOverDirectory, setDragOverDirectory] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchRegexEnabled, setSearchRegexEnabled] = useState(false);
  const [expandedDirectories, setExpandedDirectories] = useState(
    () => new Set(persistedUiState.expandedDirectories),
  );
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingTitleDraft, setEditingTitleDraft] = useState("");
  const [editingDescription, setEditingDescription] = useState(false);
  const [editingDescriptionDraft, setEditingDescriptionDraft] = useState("");
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [createGroupDraft, setCreateGroupDraft] = useState("");
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [editingCaseName, setEditingCaseName] = useState("");
  const [fullscreenWrapLines, setFullscreenWrapLines] = useState(true);
  const [responseFullscreenOpen, setResponseFullscreenOpen] = useState(false);
  const [copyingTypeScript, setCopyingTypeScript] = useState(false);
  const [bodyDraft, setBodyDraft] = useState("");
  const [bodyDraftKey, setBodyDraftKey] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [curlText, setCurlText] = useState("");
  const [curlFetchResponse, setCurlFetchResponse] = useState(false);
  const [importingCurl, setImportingCurl] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("appearance");
  const [aiApiKeyVisible, setAiApiKeyVisible] = useState(false);
  const [aiDialogMode, setAiDialogMode] = useState<"single" | "multiple" | null>(null);
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiMetadataGeneratingEndpointIds, setAiMetadataGeneratingEndpointIds] = useState(
    () => new Set<string>(),
  );
  const [aiMetadataPreview, setAiMetadataPreview] = useState<AiMetadataPreview | null>(null);
  const [aiPreview, setAiPreview] = useState<AiPreview | null>(null);
  const [aiPreviewTab, setAiPreviewTab] = useState("case-0");
  const [aiPreviewEditingIndex, setAiPreviewEditingIndex] = useState<number | null>(null);
  const [aiPreviewEditingName, setAiPreviewEditingName] = useState("");
  const [aiProgress, setAiProgress] = useState<AiProgress | null>(null);
  const [aiGroupingScopeOpen, setAiGroupingScopeOpen] = useState(false);
  const [aiGroupingGenerating, setAiGroupingGenerating] = useState(false);
  const [aiGroupingPreview, setAiGroupingPreview] = useState<AiGroupingPreview | null>(null);
  const [aiGroupingPreviewEndpoints, setAiGroupingPreviewEndpoints] = useState<Endpoint[]>([]);
  const bodyPersistTimer = useRef<number | null>(null);
  const caseTabsRef = useRef<HTMLDivElement | null>(null);
  const aiGroupingRequestIdRef = useRef<string | null>(null);
  const storeRef = useRef<Store | null>(null);
  const pendingThemeRef = useRef<AppTheme | null>(null);

  const showToast = useCallback((message: string, error = false) => {
    if (error) {
      sonnerToast.error(<ErrorToastMessage message={message} />, {
        action: <ErrorToastCopyButton message={message} />,
        className: "mockkit-error-toast",
      });
    } else {
      sonnerToast.success(message);
    }
  }, []);

  const receiveState = useCallback(
    (payload: NativePayload) => {
      const aiGroupingRequestId = payload.aiGroupingRequestId || null;
      const ignoreAiGroupingPayload =
        Boolean(aiGroupingRequestId) && aiGroupingRequestId !== aiGroupingRequestIdRef.current;
      if (payload.store) {
        const nextStore = normalizeStore(payload.store);
        const pendingTheme = pendingThemeRef.current;
        if (pendingTheme) {
          if (nextStore.uiSettings?.theme === pendingTheme) {
            pendingThemeRef.current = null;
          } else {
            nextStore.uiSettings = { ...(nextStore.uiSettings ?? defaultUiSettings), theme: pendingTheme };
          }
        }
        storeRef.current = nextStore;
        setStore(nextStore);
        setSelectedEndpointId((current) => {
          if (payload.importedEndpointId) return payload.importedEndpointId;
          if (current && nextStore.endpoints.some((endpoint) => endpoint.id === current)) return current;
          return nextStore.endpoints[0]?.id ?? null;
        });
        if (payload.importedCaseId) setSelectedCaseId(payload.importedCaseId);
      }
      if (payload.importedEndpointId || payload.error) setImportingCurl(false);
      if (payload.aiProgress) setAiProgress(payload.aiProgress);
      if (payload.aiPreview || payload.error) setAiGenerating(false);
      if (payload.aiMetadataPreview) {
        const endpointId = payload.aiMetadataPreview.endpointId;
        setAiMetadataGeneratingEndpointIds((current) => {
          const next = new Set(current);
          next.delete(endpointId);
          return next;
        });
      }
      if (payload.error && payload.aiMetadataEndpointId) {
        const endpointId = payload.aiMetadataEndpointId;
        setAiMetadataGeneratingEndpointIds((current) => {
          const next = new Set(current);
          next.delete(endpointId);
          return next;
        });
      }
      if ((payload.aiGroupingPreview || (payload.error && aiGroupingRequestId)) && !ignoreAiGroupingPayload) {
        setAiGroupingGenerating(false);
        if (aiGroupingRequestId === aiGroupingRequestIdRef.current) {
          aiGroupingRequestIdRef.current = null;
        }
      } else if (payload.error && !aiGroupingRequestId) {
        setAiGroupingGenerating(false);
      }
      if (payload.aiPreview) {
        setAiPreview(payload.aiPreview);
        setAiPreviewTab("case-0");
      }
      if (payload.aiMetadataPreview) setAiMetadataPreview(payload.aiMetadataPreview);
      if (payload.aiGroupingPreview && !ignoreAiGroupingPayload) {
        setAiGroupingScopeOpen(false);
        setAiGroupingPreview(payload.aiGroupingPreview);
      }
      if (payload.error && !ignoreAiGroupingPayload) setAiGroupingPreviewEndpoints([]);
      if (payload.importedEndpointId) {
        setImportOpen(false);
        setCurlText("");
        setCurlFetchResponse(false);
      }
      if (payload.message && !ignoreAiGroupingPayload) showToast(payload.message);
      if (payload.error && !ignoreAiGroupingPayload) showToast(payload.error, true);
    },
    [showToast],
  );

  useEffect(() => {
    window.__receiveNativeState = receiveState;
    send("ready");
    const timer = window.setInterval(() => send("syncFiles"), 4000);
    return () => window.clearInterval(timer);
  }, [receiveState]);

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 0 || event.detail > 1) return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest(nativeNoDragSelector)) return;
      if (!target.closest(nativeDragRegionSelector)) return;

      event.preventDefault();
      window.getSelection()?.removeAllRanges();
      send("startWindowDrag");
    };

    document.addEventListener("mousedown", handleMouseDown, true);
    return () => document.removeEventListener("mousedown", handleMouseDown, true);
  }, []);

  useEffect(() => {
    window.__openMockKitSettings = () => {
      setSettingsSection("appearance");
      setSettingsOpen(true);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey && event.key === ",") {
        event.preventDefault();
        setSettingsSection("appearance");
        setSettingsOpen(true);
        return;
      }

      if (
        !event.defaultPrevented &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "f" &&
        !isCodeEditorShortcutTarget(event.target)
      ) {
        event.preventDefault();
        const searchInput = document.getElementById("endpoint-search-input") as HTMLInputElement | null;
        searchInput?.focus();
        searchInput?.select();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.__openMockKitSettings = undefined;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const endpoints = store?.endpoints ?? [];
  const groupPaths = store?.groupPaths ?? [];
  const endpoint = endpoints.find((item) => item.id === selectedEndpointId) ?? null;
  const mockCase = endpoint?.cases.find((item) => item.id === selectedCaseId) ?? activeCase(endpoint);
  const bodyDocumentKey = endpoint && mockCase ? `${endpoint.id}-${mockCase.id}` : "empty";
  const currentBodyDraft = bodyDraftKey === bodyDocumentKey ? bodyDraft : (mockCase?.body ?? "");
  const directoryTree = useMemo(() => buildDirectoryTree(endpoints, groupPaths), [endpoints, groupPaths]);
  const compactDirectoryTree = useMemo(
    () => buildCompactDirectoryTree(directoryTree, endpoints),
    [directoryTree, endpoints],
  );
  const displayedDirectoryTree = directoryViewMode === "tree" ? directoryTree : compactDirectoryTree;
  const availableDirectoryPaths = useMemo(() => {
    const paths = new Set([""]);
    for (const groupPath of groupPaths) {
      for (const path of ancestorDirectoryPaths(groupPath)) paths.add(path);
    }
    for (const item of endpoints) {
      for (const path of ancestorDirectoryPaths(getEndpointDirectoryPath(item))) paths.add(path);
    }
    return paths;
  }, [endpoints, groupPaths]);
  const visibleDirectories = useMemo(
    () => visibleTreeNodes(displayedDirectoryTree, expandedDirectories),
    [displayedDirectoryTree, expandedDirectories],
  );
  const directoryEndpoints = useMemo(
    () => endpoints.filter((item) => isEndpointInDirectory(item, selectedDirectory)),
    [endpoints, selectedDirectory],
  );
  const endpointSearchMatches = useMemo(() => {
    const search = parseSearchQuery(query, searchRegexEnabled);
    const matches = new Map<string, EndpointSearchMatch>();
    for (const item of endpoints) {
      if (!isEndpointInDirectory(item, selectedDirectory)) continue;
      if (!search) {
        matches.set(item.id, {});
        continue;
      }
      const match = endpointSearchMatch(item, search);
      if (match) matches.set(item.id, match);
    }
    return matches;
  }, [endpoints, query, searchRegexEnabled, selectedDirectory]);
  const filteredEndpoints = useMemo(
    () => endpoints.filter((item) => endpointSearchMatches.has(item.id)),
    [endpoints, endpointSearchMatches],
  );
  const selectedEndpointCount = selectedEndpointIds.size;
  const isSelectedEndpointGeneratingMetadata =
    endpoint ? aiMetadataGeneratingEndpointIds.has(endpoint.id) : false;
  const jsonStatus = useMemo(() => getJsonStatus(currentBodyDraft), [currentBodyDraft]);
  const previewFile = useMemo(() => caseFile(endpoint, mockCase ?? null), [endpoint, mockCase]);
  const aiSettings = store?.aiSettings ?? defaultAiSettings;
  const uiSettings = store?.uiSettings ?? defaultUiSettings;
  const currentTheme = uiSettings.theme;
  const aiEnabled = aiSettings.enabled === true;
  const aiApiKeyCount = localAiProviders.has(aiSettings.provider)
    ? 0
    : parseApiKeys(aiSettings.apiKey).length;

  useEffect(() => {
    document.documentElement.dataset.appTheme = currentTheme;
    document.body.dataset.appTheme = currentTheme;
  }, [currentTheme]);

  useEffect(() => {
    writePersistedUiState({
      selectedDirectory,
      selectedEndpointId,
      selectedCaseId,
      expandedDirectories: [...expandedDirectories],
      directoryViewMode,
      focusedTreeNodeId,
    });
  }, [
    selectedDirectory,
    selectedEndpointId,
    selectedCaseId,
    expandedDirectories,
    directoryViewMode,
    focusedTreeNodeId,
  ]);

  useEffect(() => {
    setEditingTitle(false);
    setEditingTitleDraft(endpoint?.name ?? "");
    setEditingDescription(false);
    setEditingDescriptionDraft(endpoint?.description ?? "");
    setEditingCaseId(null);
    setEditingCaseName("");
  }, [endpoint?.name, endpoint?.description]);

  useEffect(() => {
    const endpointIds = new Set(endpoints.map((item) => item.id));
    setSelectedEndpointIds((current) => {
      const next = new Set([...current].filter((id) => endpointIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [endpoints]);

  useEffect(() => {
    if (!store || availableDirectoryPaths.has(selectedDirectory)) return;
    const selectedEndpoint = endpoints.find((item) => item.id === selectedEndpointId);
    const nextDirectory = selectedEndpoint ? getEndpointDirectoryPath(selectedEndpoint) : "";
    setSelectedDirectory(nextDirectory);
    setFocusedTreeNodeId(
      selectedEndpoint ? endpointTreeNodeKey(selectedEndpoint.id) : directoryTreeNodeKey(nextDirectory),
    );
    setExpandedDirectories((current) => {
      const next = new Set(current);
      for (const path of ancestorDirectoryPaths(nextDirectory)) next.add(path);
      return next;
    });
  }, [availableDirectoryPaths, endpoints, selectedDirectory, selectedEndpointId, store]);

  useEffect(() => {
    if (!store) return;
    if (!endpoint) {
      if (selectedCaseId !== null) setSelectedCaseId(null);
      return;
    }
    if (selectedCaseId && endpoint.cases.some((item) => item.id === selectedCaseId)) return;
    setSelectedCaseId(activeCase(endpoint)?.id ?? null);
  }, [endpoint, selectedCaseId, store]);

  useEffect(() => {
    if (!store || !availableDirectoryPaths.has(selectedDirectory)) return;
    if (directoryEndpoints.length === 0) {
      setSelectedEndpointId(null);
      setSelectedCaseId(null);
      return;
    }
    if (selectedEndpointId && directoryEndpoints.some((item) => item.id === selectedEndpointId)) return;

    const nextEndpoint = directoryEndpoints[0];
    setSelectedEndpointId(nextEndpoint.id);
    setSelectedCaseId(activeCase(nextEndpoint)?.id ?? null);
  }, [availableDirectoryPaths, directoryEndpoints, selectedDirectory, selectedEndpointId, store]);

  useEffect(() => {
    const nextBody = mockCase?.body ?? "";
    setBodyDraft(nextBody);
    setBodyDraftKey(bodyDocumentKey);
  }, [mockCase?.body, bodyDocumentKey]);

  useEffect(
    () => () => {
      if (bodyPersistTimer.current) window.clearTimeout(bodyPersistTimer.current);
    },
    [],
  );

  useEffect(() => {
    const element = caseTabsRef.current;
    if (!element || !selectedCaseId) return;

    window.requestAnimationFrame(() => {
      const activeTab = element.querySelector<HTMLElement>(`[data-case-id="${CSS.escape(selectedCaseId)}"]`);
      activeTab?.scrollIntoView({ block: "nearest", inline: "nearest" });
      updateCaseTabsScrollState(element);
    });
  }, [selectedCaseId]);

  const toggleDirectory = (path: string) => {
    setExpandedDirectories((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const setDirectoryExpanded = (path: string, expanded: boolean) => {
    setExpandedDirectories((current) => {
      const next = new Set(current);
      if (expanded) next.add(path);
      else if (path) next.delete(path);
      return next;
    });
  };

  const selectDirectory = (path: string) => {
    setFocusedTreeNodeId(directoryTreeNodeKey(path));
    setSelectedDirectory(path);
  };

  const scrollTreeNodeIntoView = (key: string) => {
    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`[data-tree-node-id="${CSS.escape(key)}"]`)
        ?.scrollIntoView({ block: "nearest" });
    });
  };

  const selectDirectoryWithScroll = (path: string) => {
    selectDirectory(path);
    scrollTreeNodeIntoView(directoryTreeNodeKey(path));
  };

  const focusTreeNodeWithScroll = (node: TreeNode) => {
    const key = treeNodeKey(node);
    setFocusedTreeNodeId(key);
    scrollTreeNodeIntoView(key);
  };

  const handleDirectoryKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", " "].includes(event.key)) return;
    const selectedFileKey = endpointTreeNodeKey(selectedEndpointId ?? undefined);
    const preferredKey = visibleDirectories.some((node) => treeNodeKey(node) === focusedTreeNodeId)
      ? focusedTreeNodeId
      : selectedFileKey && visibleDirectories.some((node) => treeNodeKey(node) === selectedFileKey)
        ? selectedFileKey
        : directoryTreeNodeKey(selectedDirectory);
    const currentIndex = visibleDirectories.findIndex((node) => treeNodeKey(node) === preferredKey);
    const safeIndex = currentIndex === -1 ? 0 : currentIndex;
    const currentNode = visibleDirectories[safeIndex] ?? visibleDirectories[0];
    if (!currentNode) return;

    event.preventDefault();
    if (event.key === "ArrowUp") {
      const nextNode = visibleDirectories[Math.max(0, safeIndex - 1)] ?? currentNode;
      focusTreeNodeWithScroll(nextNode);
      return;
    }
    if (event.key === "ArrowDown") {
      const nextNode =
        visibleDirectories[Math.min(visibleDirectories.length - 1, safeIndex + 1)] ?? currentNode;
      focusTreeNodeWithScroll(nextNode);
      return;
    }
    if (currentNode.type === "file") {
      const currentEndpoint = endpoints.find((item) => item.id === currentNode.endpointId);
      if (event.key === "ArrowLeft" && currentEndpoint) {
        const parentPath = getEndpointDirectoryPath(currentEndpoint);
        setFocusedTreeNodeId(directoryTreeNodeKey(parentPath));
        scrollTreeNodeIntoView(directoryTreeNodeKey(parentPath));
      } else if (event.key === "Enter") {
        selectEndpointFromTree(currentNode.endpointId);
      }
      return;
    }
    if (event.key === "ArrowRight") {
      if (currentNode.children.length > 0 && !expandedDirectories.has(currentNode.path)) {
        setDirectoryExpanded(currentNode.path, true);
        return;
      }
      if (currentNode.children.length > 0) focusTreeNodeWithScroll(currentNode.children[0]);
      return;
    }
    if (event.key === "ArrowLeft") {
      if (currentNode.children.length > 0 && expandedDirectories.has(currentNode.path) && currentNode.path) {
        setDirectoryExpanded(currentNode.path, false);
        return;
      }
      const parentPath = parentDirectoryPath(currentNode.path);
      setFocusedTreeNodeId(directoryTreeNodeKey(parentPath));
      scrollTreeNodeIntoView(directoryTreeNodeKey(parentPath));
      return;
    }
    if (event.key === "Enter") {
      selectDirectoryWithScroll(currentNode.path);
      return;
    }
    if (event.key === " ") {
      if (currentNode.children.length > 0) {
        setDirectoryExpanded(currentNode.path, !expandedDirectories.has(currentNode.path));
      }
    }
  };

  const openCreateGroupDialog = () => {
    setCreateGroupDraft(selectedDirectory ? `${selectedDirectory}/` : "");
    setCreateGroupOpen(true);
  };

  const createGroup = () => {
    const cleanPath = cleanGroupPath(createGroupDraft);
    if (!cleanPath) return;
    if (storeRef.current?.groupPaths?.includes(cleanPath)) {
      setSelectedDirectory(cleanPath);
      setCreateGroupOpen(false);
      showToast("业务分组已存在。");
      return;
    }
    mutateStore((draft) => {
      draft.groupPaths = normalizeGroupPaths([...(draft.groupPaths ?? []), cleanPath]);
    });
    setExpandedDirectories((current) => {
      const next = new Set(current);
      next.add("");
      const parts = cleanPath.split("/");
      for (let index = 1; index < parts.length; index += 1) {
        next.add(parts.slice(0, index).join("/"));
      }
      return next;
    });
    setSelectedDirectory(cleanPath);
    setCreateGroupOpen(false);
    setCreateGroupDraft("");
  };

  const moveDirectory = (sourcePath: string, targetPath: string) => {
    setDragOverDirectory(null);
    if (!sourcePath || sourcePath === targetPath || isPathInside(targetPath, sourcePath)) return;
    const nextSelectedDirectory = selectedDirectory
      ? isPathInside(selectedDirectory, sourcePath)
        ? reparentPath(selectedDirectory, sourcePath, targetPath)
        : selectedDirectory
      : selectedDirectory;

    mutateStore((draft) => {
      const movedPaths = new Set<string>();
      for (const groupPath of draft.groupPaths ?? []) {
        if (isPathInside(groupPath, sourcePath))
          movedPaths.add(reparentPath(groupPath, sourcePath, targetPath));
        else movedPaths.add(groupPath);
      }
      movedPaths.add(targetPath ? targetPath : "");

      for (const item of draft.endpoints) {
        const directoryPath = getEndpointDirectoryPath(item);
        if (!isPathInside(directoryPath, sourcePath)) continue;
        const nextPath = reparentPath(directoryPath, sourcePath, targetPath);
        item.groupPath = nextPath;
        movedPaths.add(nextPath);
      }

      draft.groupPaths = normalizeGroupPaths([...movedPaths]);
    });

    setExpandedDirectories((current) => {
      const next = new Set(current);
      next.add(targetPath);
      const nextMovedRoot = reparentPath(sourcePath, sourcePath, targetPath);
      next.add(nextMovedRoot);
      return next;
    });
    setSelectedDirectory(nextSelectedDirectory);
  };

  const persist = useCallback((nextStore: Store) => {
    storeRef.current = nextStore;
    setStore({ ...nextStore, endpoints: [...nextStore.endpoints] });
    send("saveStore", { store: nextStore });
  }, []);

  const mutateStore = useCallback(
    (mutator: (draft: Store) => void) => {
      if (!storeRef.current) return;
      const draft = structuredClone(storeRef.current);
      mutator(draft);
      persist(draft);
    },
    [persist],
  );

  const selectedDirectoryLabel = selectedDirectory || "Overrides 根目录";
  const newEndpointBasePath = "example.com/api/example.json";
  const newEndpointPath = uniqueOverridePath(newEndpointBasePath, endpoints);

  const addEndpoint = () => {
    const defaultCaseId = createId();
    const nextEndpoint: Endpoint = {
      id: createId(),
      name: "新接口",
      method: "GET",
      overridePath: newEndpointPath,
      groupPath: selectedDirectory || null,
      description: "",
      tags: [],
      enabled: true,
      activeCaseId: defaultCaseId,
      cases: [
        { id: defaultCaseId, name: "Default", body: '{\n  "ok": true\n}', status: 200, headers: "" },
        { id: createId(), name: "成功", body: successBody, status: 200, headers: "" },
        { id: createId(), name: "失败", body: failureBody, status: 500, headers: "" },
        { id: createId(), name: "空数据", body: emptyBody, status: 200, headers: "" },
      ],
    };
    mutateStore((draft) => draft.endpoints.unshift(nextEndpoint));
    setSelectedEndpointId(nextEndpoint.id);
    setSelectedCaseId(defaultCaseId);
  };

  const toggleEndpointSelection = (endpointId: string, checked: boolean) => {
    setSelectedEndpointIds((current) => {
      const next = new Set(current);
      if (checked) next.add(endpointId);
      else next.delete(endpointId);
      return next;
    });
    setSelectionAnchorEndpointId(endpointId);
  };

  const selectEndpointRange = (endpointId: string, checked = true) => {
    const anchorId = selectionAnchorEndpointId ?? selectedEndpointId ?? endpointId;
    const anchorIndex = filteredEndpoints.findIndex((item) => item.id === anchorId);
    const targetIndex = filteredEndpoints.findIndex((item) => item.id === endpointId);
    if (anchorIndex === -1 || targetIndex === -1) {
      toggleEndpointSelection(endpointId, checked);
      return;
    }

    const [start, end] = anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
    const rangeIds = filteredEndpoints.slice(start, end + 1).map((item) => item.id);
    setSelectedEndpointIds((current) => {
      const next = new Set(current);
      for (const id of rangeIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const handleEndpointSelectionGesture = (endpointId: string, event: ReactMouseEvent, checked?: boolean) => {
    if (event.shiftKey) {
      selectEndpointRange(endpointId, checked ?? true);
      return;
    }

    toggleEndpointSelection(endpointId, checked ?? !selectedEndpointIds.has(endpointId));
  };

  const handleEndpointRowClick = (item: Endpoint, event: ReactMouseEvent<HTMLButtonElement>) => {
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      event.preventDefault();
      handleEndpointSelectionGesture(item.id, event);
      return;
    }

    setSelectedEndpointId(item.id);
    setSelectedCaseId(item.activeCaseId ?? item.cases[0]?.id ?? null);
    setSelectionAnchorEndpointId(item.id);
    setFocusedTreeNodeId(endpointTreeNodeKey(item.id));
  };

  const selectEndpointFromTree = (endpointId?: string) => {
    const item = endpoints.find((candidate) => candidate.id === endpointId);
    if (!item) return;
    setFocusedTreeNodeId(endpointTreeNodeKey(item.id));
    setSelectedDirectory(getEndpointDirectoryPath(item));
    setSelectedEndpointId(item.id);
    setSelectedCaseId(item.activeCaseId ?? item.cases[0]?.id ?? null);
    setSelectionAnchorEndpointId(item.id);
  };

  const clearEndpointSelection = () => {
    setSelectedEndpointIds(new Set());
    setSelectionAnchorEndpointId(null);
  };

  const deleteSelectedEndpoints = () => {
    if (selectedEndpointIds.size === 0) return;
    const count = selectedEndpointIds.size;
    setDeleteTarget({ type: "bulk", endpointIds: [...selectedEndpointIds], count });
  };

  const getEndpointContextIds = (item: Endpoint) =>
    selectedEndpointIds.has(item.id) && selectedEndpointIds.size > 1 ? [...selectedEndpointIds] : [item.id];

  const prepareEndpointContextMenu = (item: Endpoint) => {
    setSelectedEndpointId(item.id);
    setSelectedCaseId(item.activeCaseId ?? item.cases[0]?.id ?? null);
    if (!selectedEndpointIds.has(item.id)) {
      setSelectedEndpointIds(new Set());
      setSelectionAnchorEndpointId(item.id);
    }
  };

  const revealEndpointDirectory = (item: Endpoint) => {
    const directoryPath = getEndpointDirectoryPath(item);
    setExpandedDirectories((current) => {
      const next = new Set(current);
      for (const path of ancestorDirectoryPaths(directoryPath)) next.add(path);
      return next;
    });
    setSelectedDirectory(directoryPath);
    setSelectedEndpointId(item.id);
    setSelectedCaseId(item.activeCaseId ?? item.cases[0]?.id ?? null);
    setSelectionAnchorEndpointId(item.id);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document
          .querySelector<HTMLElement>(
            `[data-directory-path="${CSS.escape(directoryDomId(item.overridePath))}"]`,
          )
          ?.scrollIntoView({ block: "nearest" });
      });
    });
  };

  const setEndpointIdsEnabled = (endpointIds: string[], enabled: boolean) => {
    const ids = new Set(endpointIds);
    mutateStore((draft) => {
      for (const item of draft.endpoints) {
        if (ids.has(item.id)) item.enabled = enabled;
      }
    });
    showToast(`${enabled ? "已启用" : "已禁用"} ${endpointIds.length} 个接口。`);
  };

  const requestDeleteEndpointFromList = (item: Endpoint) => {
    const endpointIds = getEndpointContextIds(item);
    if (endpointIds.length > 1) {
      setDeleteTarget({ type: "bulk", endpointIds, count: endpointIds.length });
      return;
    }
    setDeleteTarget({ type: "endpoint", endpointId: item.id, name: item.name || "未命名接口" });
  };

  const requestDeleteEndpointFromTree = (item: Endpoint) => {
    setDeleteTarget({ type: "endpoint", endpointId: item.id, name: item.name || "未命名接口" });
  };

  const requestDeleteDirectory = (path: string) => {
    const directoryEndpointIds = endpoints
      .filter((item) => isEndpointInDirectory(item, path))
      .map((item) => item.id);
    const pathParts = path.split("/").filter(Boolean);
    const name = pathParts[pathParts.length - 1] ?? "Overrides 根目录";
    setDeleteTarget({
      type: "directory",
      path,
      name,
      endpointIds: directoryEndpointIds,
      count: directoryEndpointIds.length,
    });
  };

  const confirmDeleteSelectedEndpoints = (endpointIds: string[]) => {
    const ids = new Set(endpointIds);
    let nextSelectedEndpointId: string | null = null;
    mutateStore((draft) => {
      draft.endpoints = draft.endpoints.filter((item) => !ids.has(item.id));
      nextSelectedEndpointId =
        selectedEndpointId && !ids.has(selectedEndpointId)
          ? selectedEndpointId
          : (draft.endpoints[0]?.id ?? null);
    });
    setSelectedEndpointIds(new Set());
    setSelectedEndpointId(nextSelectedEndpointId);
    setSelectedCaseId(null);
    showToast(`已删除 ${endpointIds.length} 个接口。`);
  };

  const confirmDeleteDirectory = (target: Extract<DeleteTarget, { type: "directory" }>) => {
    const ids = new Set(target.endpointIds);
    const parentPath = parentDirectoryPath(target.path);
    let nextSelectedEndpointId: string | null = null;
    mutateStore((draft) => {
      draft.endpoints = draft.endpoints.filter((item) => !ids.has(item.id));
      draft.groupPaths = target.path
        ? normalizeGroupPaths(
            (draft.groupPaths ?? []).filter((groupPath) => !isPathInside(groupPath, target.path)),
          )
        : [];
      nextSelectedEndpointId =
        selectedEndpointId && !ids.has(selectedEndpointId)
          ? selectedEndpointId
          : (draft.endpoints.find((item) => isEndpointInDirectory(item, parentPath))?.id ??
            draft.endpoints[0]?.id ??
            null);
    });
    setExpandedDirectories((current) => {
      const next = new Set([...current].filter((path) => !isPathInside(path, target.path)));
      next.add(parentPath);
      next.add("");
      return next;
    });
    setSelectedDirectory(parentPath);
    setSelectedEndpointIds(new Set());
    setSelectedEndpointId(nextSelectedEndpointId);
    setSelectedCaseId(null);
    if (!target.path) {
      showToast(target.count > 0 ? `已清空根目录下的 ${target.count} 个接口。` : "根目录已经是空的。");
      return;
    }
    showToast(target.count > 0 ? `已删除目录和 ${target.count} 个接口。` : "已删除空目录。");
  };

  const setGlobalEnabled = (enabled: boolean) => {
    if (enabled) {
      mutateStore((draft) => {
        draft.mockEnabled = true;
      });
      return;
    }
    send("disable");
  };

  const setDirectoryEnabledByPath = (path: string, enabled: boolean) => {
    mutateStore((draft) => {
      for (const item of draft.endpoints) {
        if (isEndpointInDirectory(item, path)) item.enabled = enabled;
      }
    });
  };

  const updateEndpointEnabled = (endpointId: string, enabled: boolean) => {
    mutateStore((draft) => {
      const item = draft.endpoints.find((candidate) => candidate.id === endpointId);
      if (item) item.enabled = enabled;
    });
  };

  const updateEndpoint = (field: keyof Endpoint, value: string) => {
    mutateStore((draft) => {
      const item = draft.endpoints.find((candidate) => candidate.id === selectedEndpointId);
      if (!item) return;
      if (field === "overridePath" && selectedDirectory) {
        const cleanPath = value.replace(/^\/+/, "");
        item.overridePath =
          cleanPath === selectedDirectory || cleanPath.startsWith(`${selectedDirectory}/`)
            ? cleanPath
            : `${selectedDirectory}/${cleanPath}`;
      } else {
        (item[field] as string) = value;
      }
    });
  };

  const startEditingTitle = () => {
    if (!endpoint) return;
    setEditingTitleDraft(endpoint.name);
    setEditingTitle(true);
  };

  const commitTitle = () => {
    if (!editingTitle) return;
    updateEndpoint("name", editingTitleDraft);
    setEditingTitle(false);
  };

  const cancelTitleEdit = () => {
    setEditingTitle(false);
    setEditingTitleDraft(endpoint?.name ?? "");
  };

  const startEditingDescription = () => {
    if (!endpoint) return;
    setEditingDescriptionDraft(endpoint.description);
    setEditingDescription(true);
  };

  const commitDescription = () => {
    if (!editingDescription) return;
    updateEndpoint("description", editingDescriptionDraft);
    setEditingDescription(false);
  };

  const cancelDescriptionEdit = () => {
    setEditingDescription(false);
    setEditingDescriptionDraft(endpoint?.description ?? "");
  };

  const applyAiMetadataPreview = useCallback(
    (preview: AiMetadataPreview) => {
      const nextName = preview.name.trim();
      const nextDescription = preview.description.trim();
      const targetEndpointId = preview.endpointId;
      mutateStore((draft) => {
        const item = draft.endpoints.find((candidate) => candidate.id === targetEndpointId);
        if (!item) return;
        if (nextName) item.name = nextName;
        if (nextDescription) item.description = nextDescription;
      });
      if (targetEndpointId === selectedEndpointId) {
        setEditingTitle(false);
        setEditingDescription(false);
        setEditingTitleDraft(nextName || endpoint?.name || "");
        setEditingDescriptionDraft(nextDescription || endpoint?.description || "");
      }
      showToast("已用 AI 更新接口名称和说明。");
    },
    [endpoint?.description, endpoint?.name, mutateStore, selectedEndpointId, showToast],
  );

  useEffect(() => {
    if (!aiMetadataPreview) return;
    applyAiMetadataPreview(aiMetadataPreview);
    setAiMetadataPreview(null);
  }, [aiMetadataPreview, applyAiMetadataPreview]);

  const updateCase = (field: keyof MockCase, value: string) => {
    mutateStore((draft) => {
      const item = draft.endpoints.find((candidate) => candidate.id === selectedEndpointId);
      const targetCaseId = editingCaseId ?? selectedCaseId;
      const scenario = item?.cases.find((candidate) => candidate.id === targetCaseId);
      if (!scenario) return;
      (scenario[field] as string) = value;
    });
  };

  const startRenameCase = (scenario: MockCase) => {
    setSelectedCaseId(scenario.id);
    setEditingCaseId(scenario.id);
    setEditingCaseName(scenario.name);
  };

  const commitRenameCase = () => {
    if (!editingCaseId) return;
    const nextName = editingCaseName.trim() || "未命名场景";
    updateCase("name", nextName);
    setEditingCaseId(null);
    setEditingCaseName("");
  };

  const cancelRenameCase = () => {
    setEditingCaseId(null);
    setEditingCaseName("");
  };

  const persistBody = useCallback(
    (endpointId: string, caseId: string, body: string) => {
      mutateStore((draft) => {
        const item = draft.endpoints.find((candidate) => candidate.id === endpointId);
        const scenario = item?.cases.find((candidate) => candidate.id === caseId);
        if (scenario) scenario.body = body;
      });
    },
    [mutateStore],
  );

  const scheduleBodyPersist = useCallback(
    (body: string) => {
      if (!endpoint || !mockCase) return;
      const endpointId = endpoint.id;
      const caseId = mockCase.id;
      if (bodyPersistTimer.current) window.clearTimeout(bodyPersistTimer.current);
      bodyPersistTimer.current = window.setTimeout(() => {
        bodyPersistTimer.current = null;
        persistBody(endpointId, caseId, body);
      }, 250);
    },
    [endpoint, mockCase, persistBody],
  );

  const flushBodyPersist = useCallback(() => {
    if (!endpoint || !mockCase) return;
    if (bodyPersistTimer.current) {
      window.clearTimeout(bodyPersistTimer.current);
      bodyPersistTimer.current = null;
    }
    persistBody(endpoint.id, mockCase.id, currentBodyDraft);
  }, [currentBodyDraft, endpoint, mockCase, persistBody]);

  const switchCase = (caseId: string) => {
    setSelectedCaseId(caseId);
    mutateStore((draft) => {
      const item = draft.endpoints.find((candidate) => candidate.id === selectedEndpointId);
      if (item) item.activeCaseId = caseId;
    });
  };

  const handleCaseTabsWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    const maxScrollLeft = element.scrollWidth - element.clientWidth;
    if (maxScrollLeft <= 0) return;

    const unit =
      event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? element.clientWidth
        : event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : 1;
    const dominantDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (dominantDelta === 0) return;

    const nextScrollLeft = Math.min(maxScrollLeft, Math.max(0, element.scrollLeft + dominantDelta * unit));
    if (nextScrollLeft === element.scrollLeft) return;

    event.preventDefault();
    element.scrollLeft = nextScrollLeft;
    updateCaseTabsScrollState(element);
  };

  const addCase = () => {
    if (!endpoint) return;
    const nextCase: MockCase = {
      id: createId(),
      name: "新返回场景",
      body: "",
      status: 200,
      headers: "",
    };
    mutateStore((draft) => {
      const item = draft.endpoints.find((candidate) => candidate.id === endpoint.id);
      if (!item) return;
      item.cases.push(nextCase);
      item.activeCaseId = nextCase.id;
    });
    setSelectedCaseId(nextCase.id);
  };

  const requestDeleteCase = (caseId = mockCase?.id) => {
    if (!endpoint || !caseId) return;
    if (endpoint.cases.length <= 1) {
      showToast("每个接口至少需要保留一个返回场景。", true);
      return;
    }
    const targetCase = endpoint.cases.find((candidate) => candidate.id === caseId);
    if (!targetCase) return;
    setDeleteTarget({
      type: "case",
      endpointId: endpoint.id,
      caseId,
      name: targetCase.name || "未命名场景",
    });
  };

  const confirmDeleteCase = (target: Extract<DeleteTarget, { type: "case" }>) => {
    const item = storeRef.current?.endpoints.find((candidate) => candidate.id === target.endpointId);
    if (!item) return;
    if (item.cases.length <= 1) {
      showToast("每个接口至少需要保留一个返回场景。", true);
      return;
    }
    let nextCaseId: string | null = null;
    mutateStore((draft) => {
      const item = draft.endpoints.find((candidate) => candidate.id === target.endpointId);
      if (!item) return;
      item.cases = item.cases.filter((candidate) => candidate.id !== target.caseId);
      if (item.activeCaseId === target.caseId) item.activeCaseId = item.cases[0]?.id ?? null;
      nextCaseId = item.activeCaseId ?? item.cases[0]?.id ?? null;
    });
    setSelectedCaseId(nextCaseId);
    showToast("已删除返回场景。");
  };

  const requestDeleteEndpoint = () => {
    if (!endpoint) return;
    setDeleteTarget({ type: "endpoint", endpointId: endpoint.id, name: endpoint.name || "未命名接口" });
  };

  const confirmDeleteEndpoint = (target: Extract<DeleteTarget, { type: "endpoint" }>) => {
    mutateStore((draft) => {
      draft.endpoints = draft.endpoints.filter((item) => item.id !== target.endpointId);
    });
    setSelectedEndpointId(null);
    setSelectedCaseId(null);
    showToast("已删除接口。");
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === "endpoint") confirmDeleteEndpoint(deleteTarget);
    if (deleteTarget.type === "case") confirmDeleteCase(deleteTarget);
    if (deleteTarget.type === "bulk") confirmDeleteSelectedEndpoints(deleteTarget.endpointIds);
    if (deleteTarget.type === "directory") confirmDeleteDirectory(deleteTarget);
    setDeleteTarget(null);
  };

  const formatResponse = () => {
    if (!mockCase) return;
    try {
      if (bodyPersistTimer.current) {
        window.clearTimeout(bodyPersistTimer.current);
        bodyPersistTimer.current = null;
      }
      const formatted = formatJson(currentBodyDraft);
      setBodyDraft(formatted);
      setBodyDraftKey(bodyDocumentKey);
      if (endpoint) persistBody(endpoint.id, mockCase.id, formatted);
    } catch {
      showToast("响应内容不是有效的 JSON。", true);
    }
  };

  const copyTypeScriptDefinition = () => {
    if (!endpoint) return;
    const caseBodyById = mockCase ? { [mockCase.id]: currentBodyDraft } : undefined;
    setCopyingTypeScript(true);
    void generateEndpointTypeScript(endpoint, { caseBodyById })
      .then((result) =>
        copyTextToClipboard(result.text).then((success) => {
          if (!success) {
            showToast("复制失败，请手动复制 TypeScript 定义。", true);
            return;
          }
          const skippedCount = result.skippedCases.length;
          showToast(
            skippedCount > 0
              ? `已复制 ${result.includedCount} 个场景的 TypeScript 定义，跳过 ${skippedCount} 个无效场景。`
              : `已复制 ${result.includedCount} 个场景的 TypeScript 定义。`,
          );
        }),
      )
      .catch((error) => {
        showToast(error instanceof Error ? error.message : "生成 TypeScript 定义失败。", true);
      })
      .finally(() => setCopyingTypeScript(false));
  };

  const importCurl = () => {
    if (importingCurl) return;
    const curl = curlText.trim();
    if (!curl) {
      showToast("先粘贴一段 cURL。", true);
      return;
    }
    setImportingCurl(true);
    window.requestAnimationFrame(() => {
      send("importCurl", { curl, fetchResponse: curlFetchResponse === true });
    });
  };

  const updateAiSettings = (patch: Partial<AiSettings>) => {
    mutateStore((draft) => {
      const current = { ...defaultAiSettings, ...(draft.aiSettings ?? {}) };
      const currentProvider = current.provider;
      const nextProvider = patch.provider ?? current.provider;
      const nextCliPresetId =
        patch.cliPresetId ??
        (patch.provider && localAiProviders.has(nextProvider)
          ? (current.cliPresetId ?? defaultAiSettings.cliPresetId)
          : current.cliPresetId);
      const apiKeys = {
        ...(current.apiKeys ?? {}),
        [currentProvider]: patch.apiKey ?? current.apiKey,
      };
      if (typeof patch.apiKey === "string") apiKeys[nextProvider] = patch.apiKey;
      const models = {
        ...(current.models ?? {}),
        [currentProvider]: patch.model ?? current.model,
      };
      if (typeof patch.model === "string") models[nextProvider] = patch.model;
      const nextModel =
        patch.provider && patch.provider !== current.provider
          ? (models[nextProvider] ?? defaultModelForProvider(nextProvider))
          : (patch.model ?? current.model);
      draft.aiSettings = {
        ...current,
        ...patch,
        models,
        apiKeys,
        apiKey: typeof patch.apiKey === "string" ? patch.apiKey : (apiKeys[nextProvider] ?? ""),
        provider: nextProvider,
        cliPresetId: nextCliPresetId,
        model: nextModel,
      };
      draft.aiSettings.models = { ...models, [draft.aiSettings.provider]: draft.aiSettings.model };
      draft.aiSettings.apiKeys = { ...apiKeys, [draft.aiSettings.provider]: draft.aiSettings.apiKey };
    });
  };

  const updateUiSettings = (patch: Partial<UiSettings>) => {
    if (patch.theme) pendingThemeRef.current = patch.theme;
    mutateStore((draft) => {
      draft.uiSettings = {
        ...defaultUiSettings,
        ...(draft.uiSettings ?? {}),
        ...patch,
      };
    });
  };

  useEffect(() => {
    if (!aiPreview || aiDialogMode !== "multiple") return;
    const match = /^case-(\d+)$/.exec(aiPreviewTab);
    const activeIndex = match ? Number(match[1]) : -1;
    if (activeIndex < 0 || activeIndex >= aiPreview.cases.length) {
      setAiPreviewTab("case-0");
    }
  }, [aiDialogMode, aiPreview, aiPreviewTab]);

  const openSettings = (section: SettingsSection = "appearance") => {
    setSettingsSection(section);
    setSettingsOpen(true);
  };

  const installCli = () => {
    send("installCli");
  };

  const copyCliText = (text: string) => {
    void copyTextToClipboard(text)
      .then((success) => {
        if (!success) {
          showToast("复制失败，请手动复制命令。", true);
          return;
        }
        showToast("已复制到剪贴板。");
      })
      .catch(() => showToast("复制失败，请手动复制命令。", true));
  };

  const openAiDialog = (mode: "single" | "multiple") => {
    if (!endpoint || !mockCase) return;
    if (!aiEnabled) {
      openSettings("ai");
      return;
    }
    setAiDialogMode(mode);
    setAiInstruction("");
    setAiPreview(null);
    setAiPreviewTab("case-0");
    setAiPreviewEditingIndex(null);
    setAiProgress(null);
  };

  const openAiGroupingScope = () => {
    if (endpoints.length === 0) {
      showToast("还没有可分组的接口。", true);
      return;
    }
    if (!aiEnabled) {
      openSettings("ai");
      return;
    }
    setAiGroupingScopeOpen(true);
  };

  const closeAiGroupingScope = (open: boolean) => {
    if (!open && aiGroupingGenerating) {
      const aiGroupingRequestId = aiGroupingRequestIdRef.current;
      send("cancelAiGrouping", aiGroupingRequestId ? { aiGroupingRequestId } : {});
      aiGroupingRequestIdRef.current = null;
      setAiGroupingGenerating(false);
      setAiGroupingPreviewEndpoints([]);
      setAiProgress(null);
    }
    setAiGroupingScopeOpen(open);
  };

  const generateAiMetadata = () => {
    if (!endpoint || !mockCase) return;
    if (!aiEnabled) {
      openSettings("ai");
      return;
    }
    setAiMetadataGeneratingEndpointIds((current) => new Set(current).add(endpoint.id));
    setAiProgress({ stage: "starting", message: "AI 正在理解接口用途..." });
    send("generateAiMetadata", {
      aiMetadataRequest: {
        instruction: "根据接口真实用途重新命名标题，并同步生成或优化说明。",
        endpoint: {
          id: endpoint.id,
          name: endpoint.name,
          method: endpoint.method,
          overridePath: endpoint.overridePath,
          groupPath: endpoint.groupPath ?? null,
          description: endpoint.description,
          tags: endpoint.tags,
          activeCaseName: mockCase.name,
          activeBody: currentBodyDraft,
          cases: endpoint.cases.map((item) => ({ name: item.name, body: item.body })),
        },
      },
    });
  };

  const generateAiGrouping = (targetEndpoints: Endpoint[]) => {
    if (targetEndpoints.length === 0) {
      showToast("请至少选择 1 个接口。", true);
      return;
    }
    const ungroupedEndpoints = endpoints.filter((item) => !cleanGroupPath(item.groupPath ?? ""));
    const existingGroupSummaries = [
      ...new Set(endpoints.map((item) => cleanGroupPath(item.groupPath ?? "")).filter(Boolean)),
    ]
      .sort((left, right) => left.localeCompare(right))
      .map((groupPath) => {
        const groupEndpoints = endpoints.filter((item) => cleanGroupPath(item.groupPath ?? "") === groupPath);
        const samples = groupEndpoints
          .slice(0, 3)
          .map((item) => item.name || item.overridePath)
          .join("、");
        return `${groupPath}（${groupEndpoints.length} 个${samples ? `，例如：${samples}` : ""}）`;
      });
    const groupingScopeInstruction =
      targetEndpoints.length < endpoints.length
        ? `只需要为用户本次选择的 ${targetEndpoints.length} 个接口建议分组。已有分组是可复用的目录上下文，不要返回未选择的接口。`
        : ungroupedEndpoints.length > 0
          ? "为所有接口建议分组；已有分组可作为上下文，合理的已有分组应尽量沿用。"
          : "所有接口都已有业务分组，请检查是否存在明显不合理的归类；合理的已有分组应尽量沿用。";
    const aiGroupingRequestId = createId();
    aiGroupingRequestIdRef.current = aiGroupingRequestId;
    setAiGroupingGenerating(true);
    setAiGroupingPreview(null);
    setAiGroupingPreviewEndpoints(targetEndpoints);
    setAiProgress({ stage: "starting", message: "AI 正在分析接口目录..." });
    send("generateAiGrouping", {
      aiGroupingRequestId,
      aiGroupingRequest: {
        instruction: [
          (aiSettings.aiGroupingPrompt?.trim() || defaultAiGroupingPrompt).trim(),
          groupingScopeInstruction,
          "根据接口名称、请求方法、Override 路径和说明，按业务域自动归类。",
          existingGroupSummaries.length > 0
            ? `已有分组上下文：${existingGroupSummaries.join("；")}。优先复用语义相近的已有分组。`
            : "当前还没有已有业务分组，可以创建新的简洁分组。",
        ].join("\n"),
        endpoints: targetEndpoints.map((item) => ({
          id: item.id,
          name: item.name,
          method: item.method,
          overridePath: item.overridePath,
          groupPath: item.groupPath ?? null,
          description: item.description,
          tags: item.tags,
        })),
      },
    });
  };

  const applyAiGroupingPreview = (assignments: Array<{ endpointId: string; groupPath: string }>) => {
    const endpointIds = new Set(endpoints.map((item) => item.id));
    const cleanAssignments = assignments
      .map((item) => ({
        endpointId: item.endpointId,
        groupPath: cleanGroupPath(item.groupPath),
      }))
      .filter((item) => endpointIds.has(item.endpointId));

    mutateStore((draft) => {
      const nextGroupPaths = new Set<string>();
      for (const assignment of cleanAssignments) {
        const item = draft.endpoints.find((candidate) => candidate.id === assignment.endpointId);
        if (!item) continue;
        item.groupPath = assignment.groupPath || null;
        if (assignment.groupPath) nextGroupPaths.add(assignment.groupPath);
      }
      draft.groupPaths = normalizeGroupPaths([...nextGroupPaths]);
    });
    setExpandedDirectories((current) => {
      const next = new Set(current);
      next.add("");
      for (const assignment of cleanAssignments) {
        for (const path of ancestorDirectoryPaths(assignment.groupPath)) next.add(path);
      }
      return next;
    });
    setAiGroupingPreview(null);
    setAiGroupingPreviewEndpoints([]);
    showToast(`已应用 ${cleanAssignments.length} 个 AI 分组建议。`);
  };

  const generateAiMock = () => {
    if (!endpoint || !mockCase || !aiDialogMode) return;
    const currentBody = currentBodyDraft;
    setAiGenerating(true);
    setAiPreview(null);
    setAiPreviewTab("case-0");
    setAiPreviewEditingIndex(null);
    setAiProgress({ stage: "starting", message: "AI 生成已开始，正在准备上下文..." });
    send("generateAiMock", {
      aiRequest: {
        mode: aiDialogMode,
        instruction: aiInstruction,
        endpoint: {
          name: endpoint.name,
          method: endpoint.method,
          overridePath: endpoint.overridePath,
          description: endpoint.description,
          activeCaseName: mockCase.name,
          activeBody: currentBody,
          cases: endpoint.cases.map((item) => ({ name: item.name, body: item.body })),
        },
      },
    });
  };

  const applyAiPreview = () => {
    if (!endpoint || !mockCase || !aiPreview) return;
    let nextCaseId = selectedCaseId;
    mutateStore((draft) => {
      const item = draft.endpoints.find((candidate) => candidate.id === endpoint.id);
      if (!item) return;
      if (aiPreview.mode === "single") {
        const targetCase = item.cases.find((candidate) => candidate.id === mockCase.id);
        const generated = aiPreview.cases[0];
        if (targetCase && generated) {
          targetCase.body = generated.body;
          targetCase.name = generated.name || targetCase.name;
          nextCaseId = targetCase.id;
        }
        return;
      }

      let firstGeneratedCaseId: string | null = null;
      for (const generated of aiPreview.cases) {
        const nextCaseId = createId();
        firstGeneratedCaseId ??= nextCaseId;
        item.cases.push({
          id: nextCaseId,
          name: generated.name || "AI 场景",
          body: generated.body,
          status: 200,
          headers: "",
        });
      }
      item.activeCaseId = firstGeneratedCaseId ?? item.cases[0]?.id ?? null;
      nextCaseId = item.activeCaseId;
    });
    setSelectedCaseId(nextCaseId);
    setAiDialogMode(null);
    setAiPreview(null);
    setAiPreviewTab("case-0");
    setAiPreviewEditingIndex(null);
    setAiProgress(null);
    showToast("已应用 AI 生成结果。");
  };

  const updateAiPreviewCaseBody = (index: number, body: string) => {
    setAiPreview((current) => {
      if (!current) return current;
      return {
        ...current,
        cases: current.cases.map((item, itemIndex) => (itemIndex === index ? { ...item, body } : item)),
      };
    });
  };

  const updateAiPreviewCaseName = (index: number, name: string) => {
    setAiPreview((current) => {
      if (!current) return current;
      return {
        ...current,
        cases: current.cases.map((item, itemIndex) => (itemIndex === index ? { ...item, name } : item)),
      };
    });
  };

  const startRenameAiPreviewCase = (index: number) => {
    const item = aiPreviewCases[index];
    if (!item) return;
    setAiPreviewTab(`case-${index}`);
    setAiPreviewEditingIndex(index);
    setAiPreviewEditingName(item.name || `场景 ${index + 1}`);
  };

  const commitRenameAiPreviewCase = () => {
    if (aiPreviewEditingIndex === null) return;
    updateAiPreviewCaseName(aiPreviewEditingIndex, aiPreviewEditingName.trim() || "未命名场景");
    setAiPreviewEditingIndex(null);
    setAiPreviewEditingName("");
  };

  const cancelRenameAiPreviewCase = () => {
    setAiPreviewEditingIndex(null);
    setAiPreviewEditingName("");
  };

  const deleteAiPreviewCase = (index: number) => {
    if (!aiPreview || aiPreview.cases.length <= 1) return;
    const nextCases = aiPreview.cases.filter((_, itemIndex) => itemIndex !== index);
    const nextIndex = Math.min(index, nextCases.length - 1);
    setAiPreview({ ...aiPreview, cases: nextCases });
    setAiPreviewTab(`case-${nextIndex}`);
    if (aiPreviewEditingIndex === index) cancelRenameAiPreviewCase();
  };

  if (!store) {
    return <div className="grid h-screen place-items-center text-[13px] text-muted">正在载入...</div>;
  }

  const aiPreviewCases =
    aiPreview && aiDialogMode === "single" ? aiPreview.cases.slice(0, 1) : (aiPreview?.cases ?? []);
  const activeAiPreviewIndex = Math.max(0, Number(aiPreviewTab.replace("case-", "")) || 0);
  const activeAiPreviewCase = aiPreviewCases[activeAiPreviewIndex] ?? aiPreviewCases[0] ?? null;

  return (
    <TooltipProvider>
      <div className="h-full w-full overflow-visible bg-[var(--bg)]">
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel
            defaultSize="252px"
            groupResizeBehavior="preserve-pixel-size"
            id="sidebar"
            maxSize="360px"
            minSize="232px"
          >
            <AppSidebar
              aiGroupingEnabled={aiEnabled}
              directoryViewMode={directoryViewMode}
              mockEnabled={store.mockEnabled}
              overridesFolder={store.overridesFolder}
              onAiGroup={openAiGroupingScope}
              onCreateGroup={openCreateGroupDialog}
              onDirectoryViewModeChange={setDirectoryViewMode}
              onMockEnabledChange={setGlobalEnabled}
            >
              <ScrollArea
                aria-activedescendant={treeNodeDomId(focusedTreeNodeId)}
                aria-label="目录列表"
                className="min-h-0 flex-1 pr-1 scroll-mask-y-4 source-directory-scroll"
                onKeyDown={handleDirectoryKeyDown}
                role="tree"
                tabIndex={0}
              >
                <DirectoryNode
                  endpoints={endpoints}
                  dragOverPath={dragOverDirectory}
                  expandedPaths={expandedDirectories}
                  node={displayedDirectoryTree}
                  overridesFolder={store.overridesFolder}
                  selectedDirectoryPath={selectedDirectory}
                  selectedEndpointId={selectedEndpointId}
                  onDragOverPath={setDragOverDirectory}
                  onSelect={selectDirectory}
                  onMoveDirectory={moveDirectory}
                  onRequestDeleteDirectory={requestDeleteDirectory}
                  onRequestDeleteEndpoint={requestDeleteEndpointFromTree}
                  onSetEnabled={setDirectoryEnabledByPath}
                  onSetEndpointEnabled={updateEndpointEnabled}
                  onSelectEndpoint={selectEndpointFromTree}
                  onToggle={toggleDirectory}
                  focusedNodeId={focusedTreeNodeId}
                />
              </ScrollArea>
            </AppSidebar>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize="1fr" id="main" minSize="720px">
            <main className="grid h-full min-h-0 min-w-0 grid-rows-[52px_minmax(0,1fr)] overflow-hidden bg-[var(--panel)]">
              <MainToolbar
                endpointCount={store.endpoints.length}
                onImportCurl={() => setImportOpen(true)}
                onOpenAiSettings={() => openSettings("ai")}
              />

              <ResizablePanelGroup direction="horizontal">
                <ResizablePanel
                  defaultSize="348px"
                  groupResizeBehavior="preserve-pixel-size"
                  id="endpoint-list"
                  maxSize="520px"
                  minSize="300px"
                >
                  <EndpointListPanel
                    endpointSearchMatches={endpointSearchMatches}
                    endpoints={endpoints}
                    filteredEndpoints={filteredEndpoints}
                    getEndpointContextIds={getEndpointContextIds}
                    query={query}
                    searchRegexEnabled={searchRegexEnabled}
                    selectedDirectoryLabel={selectedDirectoryLabel}
                    selectedEndpointCount={selectedEndpointCount}
                    selectedEndpointId={selectedEndpointId}
                    selectedEndpointIds={selectedEndpointIds}
                    onAddEndpoint={addEndpoint}
                    onClearSelection={clearEndpointSelection}
                    onDeleteSelectedEndpoints={deleteSelectedEndpoints}
                    onEndpointRowClick={handleEndpointRowClick}
                    onEndpointSelectionGesture={handleEndpointSelectionGesture}
                    onPrepareEndpointContextMenu={prepareEndpointContextMenu}
                    onQueryChange={setQuery}
                    onRegexEnabledChange={setSearchRegexEnabled}
                    onRequestDeleteEndpoint={requestDeleteEndpointFromList}
                    onRevealEndpointDirectory={revealEndpointDirectory}
                    onSetEndpointIdsEnabled={setEndpointIdsEnabled}
                    onToggleEndpointSelection={toggleEndpointSelection}
                  />
                </ResizablePanel>
                <ResizableHandle />
                <ResizablePanel defaultSize="1fr" id="editor" minSize="520px">
                  <section className="grid min-h-0 min-w-0 overflow-hidden bg-[var(--panel)]">
                    {!endpoint || !mockCase ? (
                      <div className="grid h-full place-content-center gap-[7px] p-8 text-center">
                        <div className="text-lg font-bold">还没有选择接口</div>
                        <div className="max-w-[420px] text-[var(--muted)]">
                          选择左侧接口，或新增一个接口来创建返回场景。
                        </div>
                      </div>
                    ) : (
                      <div className="grid h-full min-h-0 grid-rows-[auto_auto_auto_minmax(0,1fr)] gap-3 overflow-hidden px-[18px] pb-3 pt-4">
                        <div className="block min-w-0">
                          <div className="grid min-w-0 gap-[3px]">
                            {editingTitle ? (
                              <Input
                                autoFocus
                                className="h-[30px] border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_82%,var(--panel-2))] px-[9px] py-0 text-left text-[21px] font-[720] text-[var(--text)]"
                                value={editingTitleDraft}
                                onBlur={commitTitle}
                                onChange={(event) => setEditingTitleDraft(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") commitTitle();
                                  if (event.key === "Escape") cancelTitleEdit();
                                }}
                              />
                            ) : (
                              <div className="group block min-w-0 max-w-full">
                                <div className="flex w-full min-w-0 max-w-full items-baseline p-0 text-left text-[21px] font-[720] text-[var(--text)]">
                                  <span className="min-w-0 truncate">{endpoint.name || "未命名接口"}</span>
                                  <Tooltip content="编辑接口名称" side="bottom" sideOffset={7}>
                                    <Button
                                      aria-label="编辑接口名称"
                                      className={cn(editTriggerClass, "ml-[7px] shrink-0 align-[1px]")}
                                      size="icon-xs"
                                      type="button"
                                      variant="ghost"
                                      onClick={startEditingTitle}
                                    >
                                      <Pencil size={12} />
                                    </Button>
                                  </Tooltip>
                                  {aiEnabled ? (
                                    <Tooltip content="AI 重新命名并优化说明" side="bottom" sideOffset={7}>
                                      <Button
                                        aria-label="AI 重新命名接口"
                                        className={cn(
                                          editTriggerClass,
                                          "ml-1 shrink-0 align-[1px] text-[color-mix(in_srgb,var(--accent)_60%,var(--text))]",
                                          isSelectedEndpointGeneratingMetadata && "opacity-100",
                                        )}
                                        disabled={isSelectedEndpointGeneratingMetadata}
                                        size="icon-xs"
                                        type="button"
                                        variant="ghost"
                                        onClick={generateAiMetadata}
                                      >
                                        {isSelectedEndpointGeneratingMetadata ? (
                                          <span className="metadata-ai-spinner" aria-hidden="true" />
                                        ) : (
                                          <Sparkles size={12} />
                                        )}
                                      </Button>
                                    </Tooltip>
                                  ) : null}
                                </div>
                              </div>
                            )}
                            {editingDescription ? (
                              <Textarea
                                autoFocus
                                className="mt-0.5 h-auto max-h-24 min-h-[42px] overflow-auto whitespace-pre-wrap border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_82%,var(--panel-2))] px-[9px] py-0 text-left leading-[18px] text-[var(--muted)]"
                                placeholder="说明"
                                value={editingDescriptionDraft}
                                onBlur={commitDescription}
                                onChange={(event) => setEditingDescriptionDraft(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey))
                                    commitDescription();
                                  if (event.key === "Escape") cancelDescriptionEdit();
                                }}
                              />
                            ) : (
                              <div className="group block min-w-0 max-w-full">
                                <div className="mt-0.5 inline min-w-0 whitespace-pre-wrap p-0 text-left leading-[18px] text-[var(--muted)] [overflow-wrap:anywhere]">
                                  {endpoint.description || "添加说明"}
                                  <Tooltip content="编辑说明" side="bottom" sideOffset={7}>
                                    <Button
                                      aria-label="编辑说明"
                                      className={cn(editTriggerClass, "ml-1.5")}
                                      size="icon-xs"
                                      type="button"
                                      variant="ghost"
                                      onClick={startEditingDescription}
                                    >
                                      <Pencil size={12} />
                                    </Button>
                                  </Tooltip>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2.5 gap-y-2 p-0">
                          <div className="min-w-0">
                            <span className="text-[11px] font-[560] text-[var(--muted)]">
                              Chrome Overrides 路径
                            </span>
                            <div
                              className="endpoint-path-text min-h-[30px] select-text whitespace-normal py-1.5 text-xs leading-[18px] text-[color-mix(in_srgb,var(--muted)_88%,var(--text))]"
                              aria-label="Override 路径"
                            >
                              {renderReadablePath(endpoint.overridePath)}
                            </div>
                          </div>
                          <div className="inline-flex items-center gap-1">
                            <Switch
                              aria-label="当前接口 Mock"
                              checked={endpoint.enabled !== false}
                              onCheckedChange={(checked) => updateEndpointEnabled(endpoint.id, checked)}
                              size="sm"
                            />
                            <Button
                              aria-label="删除接口"
                              className="size-[30px] text-[var(--danger)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                              variant="ghost"
                              type="button"
                              onClick={requestDeleteEndpoint}
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </div>

                        <div className="grid min-w-0 gap-1.5">
                          <div className="flex min-w-0 items-center justify-between gap-3">
                            <div className="inline-flex min-w-0 items-baseline gap-2">
                              <span className={panelLabelClass}>返回场景</span>
                              <span className="truncate text-xs text-[var(--faint)]">双击名称重命名</span>
                            </div>
                            <div className="inline-flex flex-none items-center gap-1">
                              <Tooltip content="复制所有返回场景的 TypeScript 定义" side="bottom">
                                <Button
                                  className="min-h-7 origin-center rounded-lg hover:bg-[color-mix(in_srgb,var(--panel-3)_78%,transparent)] active:scale-95"
                                  size="sm"
                                  variant="outline"
                                  type="button"
                                  disabled={!endpoint || copyingTypeScript}
                                  onClick={copyTypeScriptDefinition}
                                >
                                  {copyingTypeScript ? (
                                    <Loader2 className="animate-spin" size={14} />
                                  ) : (
                                    <Braces size={14} />
                                  )}
                                  复制 TS
                                </Button>
                              </Tooltip>
                              {aiEnabled ? (
                                <Button
                                  className="min-h-7 origin-center rounded-lg hover:bg-[color-mix(in_srgb,var(--panel-3)_78%,transparent)] active:scale-95"
                                  size="sm"
                                  variant="outline"
                                  type="button"
                                  disabled={!endpoint}
                                  onClick={() => openAiDialog("multiple")}
                                >
                                  <Sparkles size={14} />
                                  生成多场景
                                </Button>
                              ) : null}
                            </div>
                          </div>
                          <div>
                            <Tabs
                              className="min-w-0"
                              value={selectedCaseId ?? endpoint.activeCaseId ?? endpoint.cases[0]?.id}
                              onValueChange={(caseId) => switchCase(String(caseId))}
                            >
                              <div className="relative flex min-w-0 items-center gap-1.5">
                                <TabsList
                                  className="scroll-mask-x-4 flex min-w-0 flex-[1_1_auto] flex-nowrap gap-[5px] overflow-auto overscroll-x-contain rounded-none border-0 bg-transparent px-0 pb-[5px] pt-0 shadow-none [scroll-behavior:smooth] [scroll-padding-inline:8px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                                  ref={caseTabsRef}
                                  onScroll={(event) => updateCaseTabsScrollState(event.currentTarget)}
                                  onWheel={handleCaseTabsWheel}
                                >
                                  {endpoint.cases.map((scenario) => {
                                    const isEditingCase = editingCaseId === scenario.id;
                                    const tab = (
                                      <div
                                        className={cn(
                                          "case-tab",
                                          scenario.id === endpoint.activeCaseId && "current",
                                        )}
                                        key={scenario.id}
                                        data-active={scenario.id === selectedCaseId ? "true" : undefined}
                                        data-case-id={scenario.id}
                                        data-editing={isEditingCase ? "true" : undefined}
                                      >
                                        {isEditingCase ? (
                                          <Input
                                            autoFocus
                                            className="case-name-inline"
                                            style={
                                              {
                                                "--case-name-length": editingCaseName.length,
                                              } as CSSProperties
                                            }
                                            value={editingCaseName}
                                            onBlur={commitRenameCase}
                                            onChange={(event) => setEditingCaseName(event.target.value)}
                                            onFocus={(event) => event.currentTarget.select()}
                                            onKeyDown={(event) => {
                                              if (event.key === "Enter") commitRenameCase();
                                              if (event.key === "Escape") cancelRenameCase();
                                            }}
                                          />
                                        ) : (
                                          <TabsTrigger
                                            value={scenario.id}
                                            className="case-tab-main"
                                            onDoubleClick={(event) => {
                                              event.preventDefault();
                                              startRenameCase(scenario);
                                            }}
                                          >
                                            {scenario.id === endpoint.activeCaseId ? (
                                              <span className="case-current-dot" aria-hidden="true" />
                                            ) : null}
                                            <span className="case-tab-label">{scenario.name}</span>
                                          </TabsTrigger>
                                        )}
                                        {!isEditingCase ? (
                                          <Button
                                            aria-label={`删除返回场景 ${scenario.name}`}
                                            className="case-tab-delete"
                                            size="icon-xs"
                                            type="button"
                                            variant="ghost"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              requestDeleteCase(scenario.id);
                                            }}
                                          >
                                            <X size={11} />
                                          </Button>
                                        ) : null}
                                      </div>
                                    );

                                    return isEditingCase ? tab : tab;
                                  })}
                                </TabsList>
                                <Button
                                  className="size-7 min-h-7 flex-none self-start origin-center rounded-[8px] border-[color-mix(in_srgb,var(--border)_74%,transparent)] bg-[color-mix(in_srgb,var(--panel)_86%,var(--panel-2))] shadow-[var(--control-shadow)] hover:border-[color-mix(in_srgb,var(--accent)_32%,var(--border))] hover:bg-[color-mix(in_srgb,var(--accent-soft)_40%,var(--panel))] active:scale-95 [&_svg]:size-4"
                                  size="icon-sm"
                                  variant="outline"
                                  type="button"
                                  onClick={addCase}
                                  aria-label="新增返回场景"
                                >
                                  <Plus size={16} />
                                </Button>
                              </div>
                            </Tabs>
                          </div>
                        </div>

                        <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[11px] border border-[var(--border)] bg-[var(--panel)] shadow-[var(--surface-shadow)]">
                          <div className="flex min-h-11 items-center justify-between gap-3 border-b border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--panel-2)_52%,transparent)] py-2 pl-3 pr-2.5">
                            <div>
                              <div className={panelLabelClass}>响应体</div>
                              <div
                                className={cn(
                                  "text-xs text-[var(--muted)]",
                                  !jsonStatus.valid && "text-[var(--danger)]",
                                )}
                              >
                                {jsonStatus.message}
                              </div>
                            </div>
                            <div className={editorActionsClass}>
                              {aiEnabled ? (
                                <Button
                                  variant="secondary"
                                  type="button"
                                  onClick={() => openAiDialog("single")}
                                >
                                  <Sparkles size={13} /> AI 生成
                                </Button>
                              ) : null}
                              <Button
                                variant="secondary"
                                type="button"
                                onClick={() => navigator.clipboard?.writeText(currentBodyDraft)}
                              >
                                <Copy size={13} /> 复制
                              </Button>
                              <Button variant="secondary" type="button" onClick={formatResponse}>
                                <FileJson size={13} /> 格式化
                              </Button>
                              <Button
                                aria-label="全屏编辑响应体"
                                variant="secondary"
                                type="button"
                                onClick={() => setResponseFullscreenOpen(true)}
                              >
                                <Maximize2 size={13} /> 全屏
                              </Button>
                            </div>
                          </div>
                          <div className="code-editor" data-file={previewFile.name}>
                            <ResponseBodyEditor
                              key={bodyDocumentKey}
                              value={currentBodyDraft}
                              wrapLines={false}
                              onChange={(nextBody) => {
                                setBodyDraft(nextBody);
                                setBodyDraftKey(bodyDocumentKey);
                                scheduleBodyPersist(nextBody);
                              }}
                              onBlur={flushBodyPersist}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </section>
                </ResizablePanel>
              </ResizablePanelGroup>
            </main>
          </ResizablePanel>
        </ResizablePanelGroup>

        <CreateGroupDialog
          cleanGroupPath={cleanGroupPath}
          draft={createGroupDraft}
          open={createGroupOpen}
          onCreate={createGroup}
          onDraftChange={setCreateGroupDraft}
          onOpenChange={setCreateGroupOpen}
        />

        <AiGroupingScopeDialog
          currentDirectory={selectedDirectory}
          endpointDirectoryPath={getEndpointDirectoryPath}
          endpoints={endpoints}
          expandedDirectoryPaths={expandedDirectories}
          generating={aiGroupingGenerating}
          open={aiGroupingScopeOpen}
          selectedEndpointIds={selectedEndpointIds}
          onGenerate={generateAiGrouping}
          onOpenChange={closeAiGroupingScope}
        />

        <AiGroupingDialog
          endpoints={aiGroupingPreviewEndpoints.length > 0 ? aiGroupingPreviewEndpoints : endpoints}
          open={!!aiGroupingPreview}
          preview={aiGroupingPreview}
          onApply={applyAiGroupingPreview}
          onOpenChange={(open) => {
            if (!open) {
              setAiGroupingPreview(null);
              setAiGroupingPreviewEndpoints([]);
            }
          }}
        />

        <DeleteConfirmDialog
          target={deleteTarget}
          onConfirm={confirmDelete}
          onOpenChange={() => setDeleteTarget(null)}
        />

        <ImportCurlDialog
          curlFetchResponse={curlFetchResponse}
          curlText={curlText}
          importingCurl={importingCurl}
          open={importOpen}
          onCurlFetchResponseChange={setCurlFetchResponse}
          onCurlTextChange={setCurlText}
          onImport={importCurl}
          onOpenChange={setImportOpen}
        />

        <AppSettingsDialog
          aiGroupingDefaultPrompt={defaultAiGroupingPrompt}
          aiApiKeyCount={aiApiKeyCount}
          aiApiKeyVisible={aiApiKeyVisible}
          aiEnabled={aiEnabled}
          aiSettings={aiSettings}
          open={settingsOpen}
          section={settingsSection}
          theme={currentTheme}
          onApiKeyVisibleChange={setAiApiKeyVisible}
          onCopyText={copyCliText}
          onInstallCli={installCli}
          onOpenChange={setSettingsOpen}
          onSectionChange={setSettingsSection}
          onThemeChange={(theme: AppTheme) => updateUiSettings({ theme })}
          onUpdateSettings={updateAiSettings}
        />

        <Dialog
          open={Boolean(aiDialogMode)}
          onOpenChange={(open) => {
            if (!open) {
              setAiDialogMode(null);
              setAiPreview(null);
              setAiPreviewTab("case-0");
              setAiPreviewEditingIndex(null);
              setAiProgress(null);
            }
          }}
        >
          <DialogContent
            className={cn(
              "isolate grid max-h-[min(840px,calc(100vh-48px))] w-[min(1120px,calc(100vw-56px))] max-w-none grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-[color-mix(in_srgb,var(--panel)_98%,white)] sm:max-w-[min(1120px,calc(100vw-56px))]",
              aiGenerating && "is-streaming",
            )}
            onKeyDown={(event) => {
              if (event.defaultPrevented) return;
              if (
                event.key !== "Enter" ||
                (!event.metaKey && !event.ctrlKey) ||
                event.nativeEvent.isComposing
              ) {
                return;
              }
              event.preventDefault();
              if (aiPreview) {
                applyAiPreview();
                return;
              }
              if (!aiGenerating) generateAiMock();
            }}
            onInteractOutside={(event) => event.preventDefault()}
          >
            {aiDialogMode ? (
              <>
                <DialogHeader className="pr-11">
                  <DialogTitle>
                    {aiDialogMode === "multiple" ? "AI 生成多个返回场景" : "AI 生成当前响应"}
                  </DialogTitle>
                  <DialogDescription>
                    基于当前响应结构改字段值、数组长度、布尔值和边界状态，生成结果会先预览。
                  </DialogDescription>
                </DialogHeader>
                <div className="grid min-h-0 gap-3 overflow-hidden">
                  <Textarea
                    aria-label="AI 生成要求"
                    className="h-[68px] min-h-[68px] w-full resize-none whitespace-pre-wrap rounded-[10px] border border-[var(--border)] bg-[#fbfbfc] px-3 py-2.5 font-ui text-[13px] leading-normal text-[var(--text)]"
                    placeholder={
                      aiDialogMode === "multiple"
                        ? "例如：保持字段结构，生成 items 为空、1 条、20 条；enabled 为 true/false；金额为 0、最大值；未登录和无权限场景"
                        : "例如：把 result.items 改成 20 条；把 enabled 改为 false；把 name 改成长文本；把 total 改为 0"
                    }
                    value={aiInstruction}
                    onChange={(event) => setAiInstruction(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey)) return;
                      event.preventDefault();
                      if (!aiGenerating) generateAiMock();
                    }}
                  />
                  {!aiPreview ? (
                    <output
                      className="grid max-h-[min(620px,66vh)] min-h-[420px] overflow-hidden rounded-[10px] border border-[color-mix(in_srgb,var(--border)_86%,transparent)] bg-[#fbfbfc]"
                      aria-live="polite"
                    >
                      <div className="flex min-h-[34px] items-center justify-between gap-3 border-b border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--panel-2)_34%,white)] px-[11px] py-[7px] text-xs font-[620] text-[var(--text)]">
                        <span>AI 实时返回</span>
                        <span className="truncate font-[520] text-[var(--muted)]">
                          {aiGenerating
                            ? (aiProgress?.message ?? "正在等待 AI 返回...")
                            : "生成后会在这里预览。"}
                        </span>
                      </div>
                      <div className="ai-code-preview h-[min(586px,60vh)] min-h-[386px]">
                        <ResponseBodyEditor
                          ariaLabel="AI 实时返回内容"
                          value={
                            aiProgress?.content || (aiGenerating ? "正在建立流式响应..." : "等待生成结果...")
                          }
                          wrapLines
                          readOnly
                          onChange={() => {}}
                          onBlur={() => {}}
                        />
                      </div>
                    </output>
                  ) : null}
                  {aiPreview ? (
                    aiDialogMode === "multiple" ? (
                      <Tabs
                        className="grid max-h-[min(620px,66vh)] min-h-[360px] grid-rows-[auto_minmax(0,1fr)] overflow-hidden"
                        value={aiPreviewTab}
                        onValueChange={setAiPreviewTab}
                      >
                        <TabsList
                          className="scroll-mask-x-4 flex min-w-0 max-w-full flex-nowrap justify-start gap-[5px] overflow-auto rounded-none bg-transparent p-0 pb-[5px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                          variant="line"
                        >
                          {aiPreviewCases.map((item, index) => (
                            <div
                              className="case-tab"
                              data-active={aiPreviewTab === `case-${index}` ? "true" : undefined}
                              data-editing={aiPreviewEditingIndex === index ? "true" : undefined}
                              key={`${item.name}-${index}-tab`}
                            >
                              {aiPreviewEditingIndex === index ? (
                                <Input
                                  autoFocus
                                  className="case-name-inline"
                                  style={
                                    {
                                      "--case-name-length": aiPreviewEditingName.length,
                                    } as CSSProperties
                                  }
                                  value={aiPreviewEditingName}
                                  onBlur={commitRenameAiPreviewCase}
                                  onChange={(event) => setAiPreviewEditingName(event.target.value)}
                                  onFocus={(event) => event.currentTarget.select()}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") commitRenameAiPreviewCase();
                                    if (event.key === "Escape") cancelRenameAiPreviewCase();
                                  }}
                                />
                              ) : (
                                <TabsTrigger
                                  className="case-tab-main"
                                  value={`case-${index}`}
                                  onDoubleClick={(event) => {
                                    event.preventDefault();
                                    startRenameAiPreviewCase(index);
                                  }}
                                >
                                  {aiPreviewTab === `case-${index}` ? (
                                    <span className="case-current-dot" aria-hidden="true" />
                                  ) : null}
                                  <span className="case-tab-label">{item.name || `场景 ${index + 1}`}</span>
                                </TabsTrigger>
                              )}
                              {aiPreviewEditingIndex !== index && aiPreviewCases.length > 1 ? (
                                <Button
                                  aria-label={`删除生成场景 ${item.name || `场景 ${index + 1}`}`}
                                  className="case-tab-delete"
                                  size="icon-xs"
                                  type="button"
                                  variant="ghost"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    deleteAiPreviewCase(index);
                                  }}
                                >
                                  <X size={11} />
                                </Button>
                              ) : null}
                            </div>
                          ))}
                        </TabsList>
                        {activeAiPreviewCase ? (
                          <div
                            className="min-h-0 overflow-hidden rounded-[11px] border border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--panel-2)_46%,white)]"
                            key={`active-ai-preview-${activeAiPreviewIndex}`}
                          >
                            <div className="border-b border-[var(--border-soft)] px-[11px] py-[9px]">
                              <div className="text-[13px] font-[680]">
                                {activeAiPreviewCase.name || `场景 ${activeAiPreviewIndex + 1}`}
                              </div>
                              {activeAiPreviewCase.description ? (
                                <div className="pt-0.5 text-xs text-[var(--muted)]">
                                  {activeAiPreviewCase.description}
                                </div>
                              ) : null}
                            </div>
                            <div className="ai-code-preview h-[min(520px,56vh)]">
                              <ResponseBodyEditor
                                key={`ai-preview-editor-${aiPreviewTab}`}
                                ariaLabel={`${
                                  activeAiPreviewCase.name || `场景 ${activeAiPreviewIndex + 1}`
                                } 返回内容`}
                                value={activeAiPreviewCase.body}
                                wrapLines
                                onChange={(body) => updateAiPreviewCaseBody(activeAiPreviewIndex, body)}
                                onBlur={() => {}}
                                onModEnter={applyAiPreview}
                              />
                            </div>
                          </div>
                        ) : null}
                      </Tabs>
                    ) : (
                      aiPreviewCases.map((item, index) => (
                        <div
                          className="min-h-0 overflow-hidden rounded-[11px] border border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--panel-2)_46%,white)]"
                          key={`${item.name}-${index}`}
                        >
                          <div className="border-b border-[var(--border-soft)] px-[11px] py-[9px]">
                            <div className="text-[13px] font-[680]">{item.name || "AI 生成结果"}</div>
                            {item.description ? (
                              <div className="pt-0.5 text-xs text-[var(--muted)]">{item.description}</div>
                            ) : null}
                          </div>
                          <div className="ai-code-preview h-[min(520px,56vh)] min-h-[320px]">
                            <ResponseBodyEditor
                              key="ai-preview-editor-single"
                              ariaLabel={`${item.name || "AI 生成结果"} 返回内容`}
                              value={item.body}
                              wrapLines
                              onChange={(body) => updateAiPreviewCaseBody(index, body)}
                              onBlur={() => {}}
                              onModEnter={applyAiPreview}
                            />
                          </div>
                        </div>
                      ))
                    )
                  ) : null}
                </div>
                <DialogFooter>
                  <Button
                    variant="secondary"
                    type="button"
                    disabled={aiGenerating}
                    onClick={() => {
                      setAiDialogMode(null);
                      setAiPreview(null);
                      setAiPreviewTab("case-0");
                      setAiPreviewEditingIndex(null);
                      setAiProgress(null);
                    }}
                  >
                    取消
                  </Button>
                  {aiPreview ? (
                    <Button type="button" onClick={applyAiPreview}>
                      应用结果
                    </Button>
                  ) : (
                    <Button type="button" disabled={aiGenerating} onClick={generateAiMock}>
                      {aiGenerating ? (
                        <>
                          <Loader2 className="animate-spin" size={14} /> 流式生成中...
                        </>
                      ) : (
                        "生成"
                      )}
                    </Button>
                  )}
                </DialogFooter>
              </>
            ) : null}
          </DialogContent>
        </Dialog>

        <Dialog
          open={responseFullscreenOpen}
          onOpenChange={(open) => {
            if (!open) flushBodyPersist();
            setResponseFullscreenOpen(open);
          }}
        >
          <DialogContent
            className="grid h-[min(860px,calc(100vh-40px))] max-h-none w-[min(1180px,calc(100vw-40px))] max-w-none grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden bg-[color-mix(in_srgb,var(--panel)_98%,white)] sm:max-w-[min(1180px,calc(100vw-40px))]"
            showCloseButton={false}
            onKeyDownCapture={(event) => {
              if (event.key !== "Escape") return;
              if (event.target instanceof Element && event.target.closest(".mockkit-search-panel")) return;
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <Button
              aria-label="关闭全屏编辑"
              className={cn("absolute right-4 top-4 z-[2]", dialogCloseButtonClass)}
              size="icon-sm"
              type="button"
              variant="ghost"
              onClick={() => {
                flushBodyPersist();
                setResponseFullscreenOpen(false);
              }}
            >
              <X size={14} />
            </Button>
            <DialogHeader className="flex items-start justify-between gap-4 pr-[42px]">
              <div>
                <DialogTitle>响应体</DialogTitle>
                <DialogDescription>{previewFile.name}</DialogDescription>
              </div>
              <div className="inline-flex flex-none items-center gap-2">
                <div className={editorActionsClass}>
                  {aiEnabled ? (
                    <Button variant="secondary" type="button" onClick={() => openAiDialog("single")}>
                      <Sparkles size={13} /> AI 编辑
                    </Button>
                  ) : null}
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(currentBodyDraft)}
                  >
                    <Copy size={13} /> 复制
                  </Button>
                  <Button variant="secondary" type="button" onClick={formatResponse}>
                    <FileJson size={13} /> 格式化
                  </Button>
                  <Button
                    aria-pressed={fullscreenWrapLines}
                    variant="secondary"
                    type="button"
                    onClick={() => setFullscreenWrapLines((enabled) => !enabled)}
                  >
                    <WrapText size={13} /> 换行
                  </Button>
                </div>
              </div>
            </DialogHeader>
            <div className="flex min-h-7 items-center border-y border-[var(--border-soft)] px-[18px] text-xs text-[var(--muted)]">
              <span className={cn(!jsonStatus.valid && "text-[var(--danger)]")}>{jsonStatus.message}</span>
            </div>
            <div className="fullscreen-code-editor" data-file={previewFile.name}>
              <ResponseBodyEditor
                key={`${bodyDocumentKey}-fullscreen`}
                ariaLabel="全屏响应内容"
                value={currentBodyDraft}
                wrapLines={fullscreenWrapLines}
                onChange={(nextBody) => {
                  setBodyDraft(nextBody);
                  setBodyDraftKey(bodyDocumentKey);
                  scheduleBodyPersist(nextBody);
                }}
                onBlur={flushBodyPersist}
              />
            </div>
          </DialogContent>
        </Dialog>

        <Toaster duration={2800} position="bottom-right" richColors />
      </div>
    </TooltipProvider>
  );
}

interface DirectoryNodeProps {
  endpoints: Endpoint[];
  dragOverPath: string | null;
  expandedPaths: Set<string>;
  focusedNodeId: string;
  node: TreeNode;
  overridesFolder: string;
  selectedDirectoryPath: string;
  selectedEndpointId: string | null;
  onDragOverPath(path: string | null): void;
  onMoveDirectory(sourcePath: string, targetPath: string): void;
  onRequestDeleteDirectory(path: string): void;
  onRequestDeleteEndpoint(item: Endpoint): void;
  onSelect(path: string): void;
  onSelectEndpoint(endpointId?: string): void;
  onSetEnabled(path: string, enabled: boolean): void;
  onSetEndpointEnabled(endpointId: string, enabled: boolean): void;
  onToggle(path: string): void;
}

function DirectoryNode({
  endpoints,
  dragOverPath,
  expandedPaths,
  focusedNodeId,
  node,
  overridesFolder,
  selectedDirectoryPath,
  selectedEndpointId,
  onDragOverPath,
  onMoveDirectory,
  onRequestDeleteDirectory,
  onRequestDeleteEndpoint,
  onSelect,
  onSelectEndpoint,
  onSetEnabled,
  onSetEndpointEnabled,
  onToggle,
}: DirectoryNodeProps) {
  const endpoint = node.type === "file" ? endpoints.find((item) => item.id === node.endpointId) : null;
  const childEndpoints = endpoints.filter((item) => isEndpointInDirectory(item, node.path));
  const relatedEndpoints = endpoint ? [endpoint] : childEndpoints;
  const enabled = childEndpoints.some((item) => item.enabled !== false);
  const mixed =
    childEndpoints.some((item) => item.enabled !== false) &&
    childEndpoints.some((item) => item.enabled === false);
  const expanded = expandedPaths.has(node.path);
  const hasChildren = node.children.length > 0;
  const active =
    node.type === "file" ? node.endpointId === selectedEndpointId : node.path === selectedDirectoryPath;
  const focused = treeNodeKey(node) === focusedNodeId;
  const dropActive = dragOverPath === node.path;
  const currentDirectoryPath = node.path ? `${overridesFolder}/${node.path}` : overridesFolder;
  const endpointEnabled = endpoint?.enabled !== false;

  if (node.type === "file") {
    return (
      <div className="source-node">
        <div
          className="source-line"
          style={{ "--tree-indent": `${Math.max(0, node.depth) * 14}px` } as CSSProperties}
        >
          <span className="source-disclosure empty" />
          <ContextMenu>
            <ContextMenuTrigger className="source-context-trigger">
              <button
                className={cn(
                  "source-row source-file-row",
                  active && "active",
                  focused && "focused",
                  !endpointEnabled && "disabled",
                )}
                data-directory-path={directoryDomId(node.path)}
                data-tree-node-id={treeNodeKey(node)}
                id={treeNodeDomId(treeNodeKey(node))}
                onClick={() => onSelectEndpoint(node.endpointId)}
                type="button"
              >
                <span className="source-icon">
                  <FileJson size={14} strokeWidth={1.55} />
                </span>
                <span className="source-label">{node.label}</span>
              </button>
            </ContextMenuTrigger>
            <ContextMenuContent className="app-context-menu">
              <ContextMenuItem
                disabled={!endpoint}
                onClick={() => {
                  if (!endpoint) return;
                  onSetEndpointEnabled(endpoint.id, !endpointEnabled);
                }}
              >
                {endpointEnabled ? "禁用接口" : "启用接口"}
              </ContextMenuItem>
              <ContextMenuItem
                disabled={!endpoint}
                onClick={() => {
                  if (!endpoint) return;
                  navigator.clipboard?.writeText(endpoint.overridePath);
                  sonnerToast.success("已复制接口路径");
                }}
              >
                复制接口路径
              </ContextMenuItem>
              <ContextMenuItem
                disabled={!endpoint}
                variant="destructive"
                onClick={() => {
                  if (endpoint) onRequestDeleteEndpoint(endpoint);
                }}
              >
                删除接口
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
          <Switch
            aria-label={`${node.label} Mock`}
            checked={endpointEnabled}
            className="source-switch"
            disabled={!endpoint}
            onCheckedChange={(checked) => {
              if (endpoint) onSetEndpointEnabled(endpoint.id, checked);
            }}
            size="sm"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="source-node">
      <div
        className="source-line"
        data-drop-target={dropActive ? "true" : undefined}
        style={{ "--tree-indent": `${Math.max(0, node.depth) * 14}px` } as CSSProperties}
      >
        <Button
          aria-label={expanded ? "收起目录" : "展开目录"}
          className={cn("source-disclosure", expanded && "expanded", !hasChildren && "empty")}
          disabled={!hasChildren}
          onClick={(event) => {
            event.stopPropagation();
            onToggle(node.path);
          }}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          {hasChildren ? <ChevronRight size={12} /> : null}
        </Button>
        <ContextMenu>
          <ContextMenuTrigger className="source-context-trigger">
            <button
              aria-expanded={hasChildren ? expanded : undefined}
              className={cn("source-row", active && "active", focused && "focused")}
              data-directory-path={directoryDomId(node.path)}
              data-tree-node-id={treeNodeKey(node)}
              draggable={Boolean(node.path)}
              id={treeNodeDomId(treeNodeKey(node))}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                onDragOverPath(node.path);
              }}
              onDragEnter={(event) => {
                event.preventDefault();
                onDragOverPath(node.path);
              }}
              onDragLeave={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                onDragOverPath(null);
              }}
              onDragStart={(event) => {
                if (!node.path) {
                  event.preventDefault();
                  return;
                }
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("application/x-mockkit-directory", node.path);
              }}
              onDragEnd={() => onDragOverPath(null)}
              onDrop={(event) => {
                event.preventDefault();
                onDragOverPath(null);
                const sourcePath = event.dataTransfer.getData("application/x-mockkit-directory");
                if (sourcePath) onMoveDirectory(sourcePath, node.path);
              }}
              onClick={() => onSelect(node.path)}
              onDoubleClick={() => {
                if (hasChildren) onToggle(node.path);
              }}
              type="button"
            >
              <span className="source-icon">
                {expanded ? (
                  <FolderOpen size={15} strokeWidth={1.55} />
                ) : (
                  <FolderClosed size={15} strokeWidth={1.55} />
                )}
              </span>
              <span className="source-label">{node.label}</span>
              <Badge
                className={cn("source-count", node.custom && node.count === 0 && "empty")}
                variant="secondary"
              >
                {node.custom && node.count === 0 ? "新" : node.count}
              </Badge>
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent className="app-context-menu">
            <ContextMenuItem
              onClick={() => {
                navigator.clipboard?.writeText(currentDirectoryPath);
                sonnerToast.success("已复制目录路径");
              }}
            >
              复制目录路径
            </ContextMenuItem>
            <ContextMenuItem onClick={() => send("revealFolder", { path: node.path })}>
              在访达中显示
            </ContextMenuItem>
            <ContextMenuItem variant="destructive" onClick={() => onRequestDeleteDirectory(node.path)}>
              {node.path ? "删除目录" : "清空根目录"}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        <Switch
          aria-label={`${node.label} Mock`}
          checked={enabled}
          className="source-switch"
          disabled={relatedEndpoints.length === 0}
          mixed={mixed}
          onCheckedChange={(checked) => onSetEnabled(node.path, checked)}
          size="sm"
        />
      </div>
      {hasChildren ? (
        <div aria-hidden={!expanded} className={cn("source-children", expanded && "expanded")}>
          <div className="source-children-inner">
            {node.children.map((child) => (
              <DirectoryNode
                endpoints={endpoints}
                dragOverPath={dragOverPath}
                expandedPaths={expandedPaths}
                focusedNodeId={focusedNodeId}
                key={child.id}
                node={child}
                overridesFolder={overridesFolder}
                selectedDirectoryPath={selectedDirectoryPath}
                selectedEndpointId={selectedEndpointId}
                onDragOverPath={onDragOverPath}
                onMoveDirectory={onMoveDirectory}
                onRequestDeleteDirectory={onRequestDeleteDirectory}
                onRequestDeleteEndpoint={onRequestDeleteEndpoint}
                onSelect={onSelect}
                onSelectEndpoint={onSelectEndpoint}
                onSetEnabled={onSetEnabled}
                onSetEndpointEnabled={onSetEndpointEnabled}
                onToggle={onToggle}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
