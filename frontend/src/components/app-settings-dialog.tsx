import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  dialogCloseButtonClass,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Bot,
  Check,
  Clipboard,
  Download,
  Eye,
  EyeOff,
  Info,
  Palette,
  Plus,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import type React from "react";
import type { AiCliPreset, AiProvider, AiSettings, AppTheme } from "../types";

const aiProviderLabels: Record<AiProvider, string> = {
  openrouter: "OpenRouter",
  openai: "OpenAI",
  gemini: "Gemini",
  compatible: "OpenAI 兼容",
  "codex-cli": "Codex CLI",
  "claude-cli": "Claude CLI",
  "custom-cli": "自定义 CLI",
};

const apiProviderItems = (["openrouter", "openai", "gemini", "compatible"] as const).map((value) => ({
  value: value as AiProvider,
  label: aiProviderLabels[value],
}));
const localCliProviders = new Set<AiProvider>(["codex-cli", "claude-cli", "custom-cli"]);
const builtinCliPresetIds = new Set(["codex-cli", "claude-cli"]);
const themeItems: Array<{
  value: AppTheme;
  label: string;
  description: string;
  swatches: string[];
}> = [
  {
    value: "mockkit",
    label: "MockKit",
    description: "默认的 macOS 工具风格。",
    swatches: ["#f6f6f8", "#fbfbfd", "#007aff"],
  },
  {
    value: "claude",
    label: "Claude",
    description: "温暖、克制的文档感。",
    swatches: ["#f7f4ed", "#ffffff", "#c96442"],
  },
  {
    value: "kodama-grove",
    label: "Kodama Grove",
    description: "偏自然的柔和绿色。",
    swatches: ["#ddd1a9", "#e9ddb9", "#7aa85b"],
  },
  {
    value: "soft-pop",
    label: "Soft Pop",
    description: "明快、高饱和的轻量风格。",
    swatches: ["#f7fbf2", "#ffffff", "#6b46ff"],
  },
  {
    value: "spotify",
    label: "Spotify",
    description: "深色控制台配 Spotify 绿。",
    swatches: ["#1b1e2a", "#11140d", "#3fdb82"],
  },
  {
    value: "modern-minimal",
    label: "Modern Minimal",
    description: "干净白底配现代蓝。",
    swatches: ["#ffffff", "#f7f8fb", "#2f7df4"],
  },
  {
    value: "violet-bloom",
    label: "Violet Bloom",
    description: "柔和白底配高饱和紫。",
    swatches: ["#fefefe", "#f2f3f7", "#7f22fe"],
  },
  {
    value: "nature",
    label: "Nature",
    description: "纸感浅底配自然绿。",
    swatches: ["#f3f0e8", "#edf4e9", "#3e8f3f"],
  },
  {
    value: "retro-arcade",
    label: "Retro Arcade",
    description: "复古街机的粉蓝撞色。",
    swatches: ["#f7efcf", "#55b5bd", "#d73591"],
  },
  {
    value: "bubblegum",
    label: "Bubblegum",
    description: "泡泡糖粉和糖果蓝。",
    swatches: ["#f2dce8", "#9bd4e7", "#d84294"],
  },
];

const fieldClass = "grid gap-1.5 [&>span]:text-xs [&>span]:font-[560] [&>span]:text-[var(--muted)]";
const inputClass =
  "h-[34px] w-full rounded-[10px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_86%,var(--panel-2))] px-3 text-[13px] text-[var(--text)] shadow-[var(--control-shadow)]";
const textareaClass =
  "min-h-[88px] w-full resize-none rounded-[10px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_86%,var(--panel-2))] px-3 py-2 text-[13px] leading-5 text-[var(--text)] shadow-[var(--control-shadow)]";
const settingsPanelClass =
  "rounded-[11px] border border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--panel)_78%,var(--panel-2))] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]";
const themeOptionClass =
  "grid min-h-[78px] grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-[11px] border border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--panel)_82%,var(--panel-2))] p-3 text-left text-[var(--text)] transition-[background-color,border-color,box-shadow] duration-[120ms] hover:border-[color-mix(in_srgb,var(--accent)_24%,var(--border))] hover:bg-[color-mix(in_srgb,var(--panel)_72%,var(--panel-2))]";
const activeThemeOptionClass =
  "border-[color-mix(in_srgb,var(--accent)_42%,var(--border))] bg-[color-mix(in_srgb,var(--accent-soft)_42%,var(--panel))] shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_10%,transparent)]";
const optionButtonClass =
  "relative block min-h-[66px] rounded-[10px] border border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--panel)_72%,var(--panel-2))] p-3 text-left text-[var(--text)] transition-[background-color,border-color,box-shadow,scale] duration-[140ms] hover:border-[color-mix(in_srgb,var(--accent)_28%,var(--border))] hover:bg-[color-mix(in_srgb,var(--panel)_64%,var(--panel-2))] active:scale-[0.98]";
const activeOptionButtonClass =
  "border-[color-mix(in_srgb,var(--accent)_46%,var(--border))] bg-[color-mix(in_srgb,var(--accent-soft)_46%,var(--panel))] shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_10%,transparent)]";
const cliCommands = [
  {
    command: "mockkit status",
    description: "查看当前 Store、Overrides 文件夹、Mock 开关和端点数量。",
    params: [] as Array<{ name: string; description: string }>,
    example: "",
  },
  {
    command: "mockkit list",
    description: "列出接口短 ID、启用状态、当前场景和完整路径。",
    params: [],
    example: "",
  },
  {
    command: "mockkit show <endpoint> [case]",
    description: "查看某个接口/场景的详情和完整 Mock 内容，适合复制给 AI。",
    params: [
      { name: "<endpoint>", description: "list 里显示的短 ID、接口名称或路径片段" },
      { name: "[case]", description: "可选场景名称；省略时使用当前场景" },
      { name: "--body", description: "只输出响应 body" },
    ],
    example: 'mockkit show "example.com/api/users" "成功"',
  },
  {
    command: "mockkit scan",
    description: "从 Chrome Overrides 文件夹扫描现有文件并同步到 MockKit。",
    params: [],
    example: "",
  },
  {
    command: "mockkit import-curl <curl>",
    description: "把浏览器或 Charles 复制出来的 cURL 导入为 Mock 接口。",
    params: [
      { name: "<curl>", description: "完整 cURL 文本" },
      { name: "--fetch", description: "真实请求一次并保存响应" },
    ],
    example: "mockkit import-curl \"curl 'https://example.com/api/users'\"",
  },
  {
    command: "mockkit use <endpoint> <case> [--publish]",
    description: "切换某个接口当前使用的返回场景，可立即发布到 Overrides。",
    params: [
      { name: "<endpoint>", description: "list 里显示的短 ID、接口名称或路径片段" },
      { name: "<case>", description: "场景名称" },
      { name: "--publish", description: "切换后立刻发布" },
    ],
    example: 'mockkit use "example.com/api/users" "成功" --publish',
  },
  {
    command: "mockkit edit <endpoint> [options]",
    description: "修改接口标题、说明、路径、方法、分组或标签。",
    params: [
      { name: "<endpoint>", description: "list 里显示的短 ID、接口名称或路径片段" },
      { name: "--name <text>", description: "设置接口标题" },
      { name: "--description <text>", description: "设置接口说明" },
      { name: "--publish", description: "保存后立刻发布" },
    ],
    example: 'mockkit edit "example.com/api/users" --name "用户列表" --description "分页返回用户。"',
  },
  {
    command: "mockkit case add <endpoint> [options]",
    description: "给接口新增一个返回场景，默认会切换为当前场景。",
    params: [
      { name: "<endpoint>", description: "list 里显示的短 ID、接口名称或路径片段" },
      { name: "--name <text>", description: "场景名称" },
      { name: "--body-file <path>", description: "从文件读取响应 body" },
      { name: "--no-activate", description: "新增后不切换当前场景" },
      { name: "--publish", description: "保存后立刻发布" },
    ],
    example:
      'mockkit case add "example.com/api/users" --name "空列表" --body-file ./empty-users.json --publish',
  },
  {
    command: "mockkit case update <endpoint> <case> [options]",
    description: "修改某个返回场景的名称、响应 body、状态码或响应头。",
    params: [
      { name: "<endpoint>", description: "list 里显示的短 ID、接口名称或路径片段" },
      { name: "<case>", description: "场景名称或 ID" },
      { name: "--body <text>", description: "直接设置响应 body" },
      { name: "--body-file <path>", description: "从文件读取响应 body" },
      { name: "--body-stdin", description: "从 stdin 读取响应 body" },
      { name: "--activate", description: "修改后切换为当前场景" },
      { name: "--publish", description: "保存后立刻发布" },
    ],
    example: 'mockkit case update "example.com/api/users" "成功" --body-file ./users.json --publish',
  },
  {
    command: "mockkit case delete <endpoint> <case> [--publish]",
    description: "删除某个返回场景；每个接口至少会保留一个场景。",
    params: [
      { name: "<endpoint>", description: "list 里显示的短 ID、接口名称或路径片段" },
      { name: "<case>", description: "场景名称或 ID" },
      { name: "--publish", description: "删除后立刻发布" },
    ],
    example: 'mockkit case delete "example.com/api/users" "失败" --publish',
  },
  {
    command: "mockkit disable <endpoint...> [--publish]",
    description: "禁用一个或多个接口；不带参数的 mockkit disable 会关闭全部 Mock。",
    params: [
      { name: "<endpoint...>", description: "一个或多个短 ID、接口名称或路径片段" },
      { name: "--publish", description: "禁用后立刻发布" },
    ],
    example: 'mockkit disable "example.com/api/users" --publish',
  },
  {
    command: "mockkit disable --group <path> [--publish]",
    description: "按分组禁用接口，包含该分组下的子路径。",
    params: [
      { name: "--group <path>", description: "分组路径" },
      { name: "--publish", description: "禁用后立刻发布" },
    ],
    example: 'mockkit disable --group "订单/列表" --publish',
  },
  {
    command: "mockkit enable --matching <text> [--publish]",
    description: "按名称、路径、分组或标签批量启用匹配到的接口。",
    params: [
      { name: "--matching <text>", description: "用于匹配接口的文本" },
      { name: "--publish", description: "启用后立刻发布" },
    ],
    example: 'mockkit enable --matching "users" --publish',
  },
];
type SettingsSection = "appearance" | "ai" | "cli";

function inferCliStreamMode(command: string): AiCliPreset["streamMode"] {
  const normalizedCommand = command.toLowerCase();
  if (normalizedCommand.includes("stream-json")) return "claude-stream-json";
  if (normalizedCommand.includes("--json") || normalizedCommand.includes("jsonl")) return "json-events";
  return "plain";
}

interface AppSettingsDialogProps {
  aiGroupingDefaultPrompt: string;
  aiApiKeyCount: number;
  aiApiKeyVisible: boolean;
  aiEnabled: boolean;
  aiSettings: AiSettings;
  onApiKeyVisibleChange(value: boolean | ((visible: boolean) => boolean)): void;
  onCopyText(text: string): void;
  onInstallCli(): void;
  onOpenChange(open: boolean): void;
  onSectionChange(section: SettingsSection): void;
  onThemeChange(theme: AppTheme): void;
  onUpdateSettings(patch: Partial<AiSettings>): void;
  open: boolean;
  section: SettingsSection;
  theme: AppTheme;
}

export function AppSettingsDialog({
  aiGroupingDefaultPrompt,
  aiApiKeyCount,
  aiApiKeyVisible,
  aiEnabled,
  aiSettings,
  onApiKeyVisibleChange,
  onCopyText,
  onInstallCli,
  onOpenChange,
  onSectionChange,
  onThemeChange,
  onUpdateSettings,
  open,
  section,
  theme,
}: AppSettingsDialogProps) {
  const localCliProvider = localCliProviders.has(aiSettings.provider);
  const aiGroupingPrompt = aiSettings.aiGroupingPrompt?.trim()
    ? aiSettings.aiGroupingPrompt
    : aiGroupingDefaultPrompt;
  const cliPresets = aiSettings.cliPresets ?? [];
  const activeCliPreset =
    cliPresets.find((preset) => preset.id === aiSettings.cliPresetId) ??
    cliPresets.find((preset) => preset.id === aiSettings.provider) ??
    cliPresets[0];
  const selectCliPreset = (preset: AiCliPreset) => {
    onUpdateSettings({
      provider: "custom-cli",
      cliPresetId: preset.id,
    });
  };
  const activateLocalCli = () => {
    const preset =
      (activeCliPreset && cliPresets.some((item) => item.id === activeCliPreset.id)
        ? activeCliPreset
        : null) ??
      cliPresets.find((preset) => preset.id === "codex-cli") ??
      cliPresets[0];
    if (preset) {
      selectCliPreset(preset);
    } else {
      onUpdateSettings({ provider: "codex-cli", cliPresetId: "codex-cli" });
    }
  };
  const updateActiveCliPreset = (patch: Partial<AiCliPreset>) => {
    if (!activeCliPreset) return;
    onUpdateSettings({
      cliPresets: cliPresets.map((preset) =>
        preset.id === activeCliPreset.id ? { ...preset, ...patch } : preset,
      ),
    });
  };
  const addCliPreset = () => {
    const id = `custom-cli-${Date.now().toString(36)}`;
    const preset: AiCliPreset = {
      id,
      name: "自定义 CLI",
      model: "",
      command: "your-command {prompt}",
      streamMode: inferCliStreamMode("your-command {prompt}"),
    };
    onUpdateSettings({
      provider: "custom-cli",
      cliPresetId: id,
      cliPresets: [...cliPresets, preset],
    });
  };
  const deleteActiveCliPreset = () => {
    if (!activeCliPreset || builtinCliPresetIds.has(activeCliPreset.id)) return;
    const nextPresets = cliPresets.filter((preset) => preset.id !== activeCliPreset.id);
    onUpdateSettings({
      cliPresets: nextPresets,
      cliPresetId: "codex-cli",
      provider: "codex-cli",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="grid h-[min(860px,calc(100vh-40px))] max-h-none w-[min(1180px,calc(100vw-40px))] max-w-none grid-cols-[240px_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden bg-[var(--panel)] p-0 sm:max-w-[min(1180px,calc(100vw-40px))]"
        showCloseButton={false}
        onKeyDown={(event) => {
          if (event.defaultPrevented) return;
          if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey) || event.nativeEvent.isComposing) {
            return;
          }
          event.preventDefault();
          onOpenChange(false);
        }}
      >
        <DialogHeader className="col-span-2 flex min-h-[66px] flex-row items-start justify-between border-b border-[var(--border-soft)] bg-[linear-gradient(180deg,var(--panel),color-mix(in_srgb,var(--panel-2)_22%,var(--panel)))] px-5 py-4">
          <div>
            <DialogTitle>设置</DialogTitle>
            <DialogDescription>配置主题、AI 生成和本机偏好。</DialogDescription>
          </div>
          <Button
            aria-label="关闭设置"
            className={dialogCloseButtonClass}
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            <X size={15} />
          </Button>
        </DialogHeader>

        <aside className="border-r border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--panel-2)_46%,transparent)] p-3">
          <SettingsNavItem
            active={section === "appearance"}
            icon={<Palette size={15} />}
            label="外观"
            onClick={() => onSectionChange("appearance")}
          />
          <SettingsNavItem
            active={section === "ai"}
            icon={<Bot size={15} />}
            label="AI 生成"
            onClick={() => onSectionChange("ai")}
          />
          <SettingsNavItem
            active={section === "cli"}
            icon={<Terminal size={15} />}
            label="命令行"
            onClick={() => onSectionChange("cli")}
          />
        </aside>

        <div className="scroll-mask-y-direct-4 min-h-0 overflow-auto p-6">
          {section === "appearance" ? (
            <section className="grid max-w-[680px] gap-5">
              <SettingsSectionHeader
                title="外观"
                description="主题来自 tweakcn 的 shadcn token，并映射到 MockKit 的界面变量。"
              />
              <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
                {themeItems.map((item) => (
                  <button
                    className={cn(themeOptionClass, theme === item.value && activeThemeOptionClass)}
                    key={item.value}
                    type="button"
                    onClick={() => onThemeChange(item.value)}
                  >
                    <span
                      className="inline-grid h-[34px] grid-cols-[repeat(3,18px)] overflow-hidden rounded-lg border border-[var(--border-soft)]"
                      aria-hidden="true"
                    >
                      {item.swatches.map((swatch) => (
                        <span className="block" key={swatch} style={{ background: swatch }} />
                      ))}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center justify-between gap-2 text-[13px] font-[680]">
                        {item.label}
                        {theme === item.value ? <Check size={14} /> : null}
                      </span>
                      <span className="mt-[3px] block text-xs leading-[1.35] text-[var(--muted)]">
                        {item.description}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : section === "cli" ? (
            <section className="grid max-w-[720px] gap-5">
              <SettingsSectionHeader
                title="命令行"
                description="把 MockKit 的扫描、导入、切换场景和发布能力带到终端、脚本和 CI 流程里。"
              />
              <div className={cn(settingsPanelClass, "grid gap-4")}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[13px] font-[680] text-[var(--text)]">
                      <Terminal size={15} />
                      mockkit
                    </div>
                    <p className="mt-1 max-w-[520px] text-xs leading-5 text-[var(--muted)]">
                      安装后会在终端提供全局命令，默认读取和 App 相同的本机配置。
                    </p>
                  </div>
                  <Button type="button" onClick={onInstallCli}>
                    <Download size={14} /> 一键安装 CLI
                  </Button>
                </div>
                <Alert variant="warning">
                  <div className="flex items-center gap-[7px]">
                    <Info className="text-[var(--warning)]" size={14} />
                    <AlertTitle>安装位置</AlertTitle>
                  </div>
                  <AlertDescription>
                    会安装到当前终端可直接识别的位置；需要时会弹出 macOS 管理员授权。
                  </AlertDescription>
                </Alert>
              </div>
              <div className={cn(settingsPanelClass, "grid gap-3")}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[13px] font-[660] text-[var(--text)]">常用命令</div>
                    <div className="mt-0.5 text-xs text-[var(--muted)]">复制后可直接在终端里运行。</div>
                  </div>
                  <Button
                    size="sm"
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      onCopyText(cliCommands.map((item) => item.example || item.command).join("\n"))
                    }
                  >
                    <Clipboard size={13} /> 复制全部
                  </Button>
                </div>
                <div className="grid gap-2">
                  {cliCommands.map((item) => {
                    const showExample = Boolean(item.example && item.example !== item.command);
                    return (
                      <div
                        className="grid gap-3 rounded-[10px] border border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--panel)_68%,var(--panel-2))] p-3"
                        key={item.command}
                      >
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                          <div className="min-w-0">
                            <code className="block min-w-0 overflow-x-auto whitespace-nowrap text-[12px] leading-5 text-[var(--text)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                              {item.command}
                            </code>
                            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{item.description}</p>
                          </div>
                          <Button
                            aria-label={`复制命令模板 ${item.command}`}
                            className="size-7 rounded-[8px]"
                            size="icon-sm"
                            type="button"
                            variant="ghost"
                            onClick={() => onCopyText(item.command)}
                          >
                            <Clipboard size={13} />
                          </Button>
                        </div>
                        {item.params.length > 0 ? (
                          <div className="grid gap-1.5 border-t border-[var(--border-soft)] pt-2">
                            {item.params.map((param) => (
                              <div
                                className="grid grid-cols-[128px_minmax(0,1fr)] gap-3 text-xs leading-5"
                                key={param.name}
                              >
                                <code className="min-w-0 text-[11px] font-[650] text-[var(--accent)]">
                                  {param.name}
                                </code>
                                <span className="min-w-0 text-[var(--muted)]">{param.description}</span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {showExample ? (
                          <div className="rounded-[9px] border border-[color-mix(in_srgb,var(--border)_76%,transparent)] bg-[color-mix(in_srgb,var(--panel-3)_58%,var(--panel))] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.44)]">
                            <div className="mb-1.5 text-[11px] font-[650] leading-4 text-[var(--faint)]">
                              示例
                            </div>
                            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-[7px] bg-[color-mix(in_srgb,var(--bg)_72%,var(--panel))] px-2.5 py-2">
                              <code className="block min-w-0 overflow-x-auto whitespace-nowrap text-[12px] leading-5 text-[var(--text)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                {item.example}
                              </code>
                              <Button
                                aria-label={`复制示例 ${item.example}`}
                                className="size-6 rounded-[7px]"
                                size="icon-xs"
                                type="button"
                                variant="ghost"
                                onClick={() => onCopyText(item.example)}
                              >
                                <Clipboard size={12} />
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          ) : (
            <section className="grid max-w-[680px] gap-5">
              <SettingsSectionHeader title="AI 生成" description="配置用于生成 Mock 数据的模型。" />
              <div className={settingsPanelClass}>
                <div className="flex min-h-[46px] items-center justify-between gap-3.5">
                  <div>
                    <div className="text-[13px] font-[660] text-[var(--text)]">启用 AI 功能</div>
                    <div className="mt-0.5 text-xs text-[var(--muted)]">开启后显示 AI 生成相关按钮。</div>
                  </div>
                  <Switch
                    aria-label="启用 AI 功能"
                    checked={aiEnabled}
                    onCheckedChange={(enabled) => onUpdateSettings({ enabled })}
                  />
                </div>
              </div>
              {localCliProvider ? (
                <Alert variant="warning">
                  <div className="flex items-center gap-[7px]">
                    <Info className="text-[var(--warning)]" size={14} />
                    <AlertTitle>本地 CLI</AlertTitle>
                  </div>
                  <AlertDescription>
                    使用本机已登录的命令行工具生成；模型留空时使用 CLI 默认模型。
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert variant="warning">
                  <div className="flex items-center gap-[7px]">
                    <Info className="text-[var(--warning)]" size={14} />
                    <AlertTitle>本地保存</AlertTitle>
                  </div>
                  <AlertDescription>
                    API Key 仅保存在本机应用数据中，不会随配置文件导入或导出。
                  </AlertDescription>
                </Alert>
              )}
              <div className={cn(settingsPanelClass, "grid gap-4")}>
                <div className="grid gap-2">
                  <div className="text-xs font-[560] text-[var(--muted)]">运行方式</div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      className={cn(optionButtonClass, !localCliProvider && activeOptionButtonClass)}
                      type="button"
                      onClick={() => onUpdateSettings({ provider: "openrouter" })}
                    >
                      <span className="min-w-0">
                        <span className="block text-[13px] font-[680]">云端 API</span>
                        <span className="mt-1 block text-xs leading-[1.45] text-[var(--muted)]">
                          使用 OpenRouter、OpenAI、Gemini 或兼容接口。
                        </span>
                      </span>
                      {!localCliProvider ? (
                        <Check className="absolute right-3 top-3 text-[var(--text)]" size={14} />
                      ) : null}
                    </button>
                    <button
                      className={cn(optionButtonClass, localCliProvider && activeOptionButtonClass)}
                      type="button"
                      onClick={activateLocalCli}
                    >
                      <span className="min-w-0">
                        <span className="block text-[13px] font-[680]">本地 CLI</span>
                        <span className="mt-1 block text-xs leading-[1.45] text-[var(--muted)]">
                          复用本机已登录的命令行工具。
                        </span>
                      </span>
                      {localCliProvider ? (
                        <Check className="absolute right-3 top-3 text-[var(--text)]" size={14} />
                      ) : null}
                    </button>
                  </div>
                </div>
                {localCliProvider ? null : (
                  <div className="grid gap-2">
                    <div className="text-xs font-[560] text-[var(--muted)]">服务商</div>
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(132px,1fr))] gap-2">
                      {apiProviderItems.map((item) => (
                        <button
                          className={cn(
                            "relative flex h-10 items-center rounded-[10px] border border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--panel)_74%,var(--panel-2))] px-3 text-left text-[13px] font-[620] text-[var(--text)] transition-[background-color,border-color,box-shadow,scale] duration-[140ms] hover:border-[color-mix(in_srgb,var(--accent)_28%,var(--border))] hover:bg-[color-mix(in_srgb,var(--panel)_66%,var(--panel-2))] active:scale-[0.98]",
                            aiSettings.provider === item.value && activeOptionButtonClass,
                          )}
                          key={item.value}
                          type="button"
                          onClick={() => onUpdateSettings({ provider: item.value })}
                        >
                          {item.label}
                          {aiSettings.provider === item.value ? (
                            <Check
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text)]"
                              size={14}
                            />
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {localCliProvider ? null : (
                  <label className={fieldClass} htmlFor="settings-ai-model">
                    <span>模型</span>
                    <Input
                      id="settings-ai-model"
                      className={inputClass}
                      value={aiSettings.model}
                      placeholder={
                        aiSettings.provider === "openrouter"
                          ? "anthropic/claude-3.5-sonnet 或 google/gemini-2.5-flash"
                          : aiSettings.provider === "gemini"
                            ? "gemini-2.5-flash"
                            : "gpt-4.1-mini"
                      }
                      onChange={(event) => onUpdateSettings({ model: event.target.value })}
                    />
                  </label>
                )}
                {aiSettings.provider === "compatible" ? (
                  <label className={fieldClass} htmlFor="settings-ai-base-url">
                    <span>Base URL</span>
                    <Input
                      id="settings-ai-base-url"
                      className={inputClass}
                      value={aiSettings.baseUrl}
                      placeholder="https://api.example.com/v1"
                      onChange={(event) => onUpdateSettings({ baseUrl: event.target.value })}
                    />
                  </label>
                ) : null}
                {localCliProvider ? (
                  <div className="grid gap-3 rounded-[10px] border border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--panel)_68%,var(--panel-2))] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[13px] font-[660] text-[var(--text)]">CLI 预设</div>
                        <div className="mt-0.5 text-xs text-[var(--muted)]">
                          选择要调用的命令模板，然后在右侧调整名称和命令。
                        </div>
                      </div>
                      <Button size="sm" type="button" variant="secondary" onClick={addCliPreset}>
                        <Plus size={13} /> 新增预设
                      </Button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-[190px_minmax(0,1fr)]">
                      <div className="grid content-start gap-1.5">
                        {cliPresets.map((preset) => {
                          const active = activeCliPreset?.id === preset.id;
                          return (
                            <button
                              className={cn(
                                "relative flex min-h-10 items-center rounded-[9px] px-2.5 py-2 text-left text-[13px] font-[620] text-[var(--muted)] transition-[background-color,color,box-shadow,scale] duration-[140ms] hover:bg-[color-mix(in_srgb,var(--panel)_78%,transparent)] hover:text-[var(--text)] active:scale-[0.98]",
                                active &&
                                  "bg-[var(--accent-row)] text-[var(--text)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_16%,transparent)]",
                              )}
                              key={preset.id}
                              type="button"
                              onClick={() => selectCliPreset(preset)}
                            >
                              <span className="min-w-0 truncate">{preset.name}</span>
                              {active ? (
                                <Check
                                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text)]"
                                  size={13}
                                />
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                      <div className="grid min-w-0 gap-3 rounded-[10px] border border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--panel)_74%,var(--panel-2))] p-3">
                        {activeCliPreset ? (
                          <>
                            <label className={fieldClass} htmlFor="settings-cli-preset-name">
                              <span>名称</span>
                              <Input
                                id="settings-cli-preset-name"
                                className={inputClass}
                                value={activeCliPreset.name}
                                onChange={(event) => updateActiveCliPreset({ name: event.target.value })}
                              />
                            </label>
                            <label className={fieldClass} htmlFor="settings-cli-preset-model">
                              <span>模型</span>
                              <Input
                                id="settings-cli-preset-model"
                                className={inputClass}
                                value={activeCliPreset.model ?? ""}
                                placeholder="可留空，使用 CLI 默认模型"
                                onChange={(event) => updateActiveCliPreset({ model: event.target.value })}
                              />
                            </label>
                            <label className={fieldClass} htmlFor="settings-cli-preset-command">
                              <span>命令</span>
                              <Textarea
                                id="settings-cli-preset-command"
                                className={textareaClass}
                                value={activeCliPreset.command}
                                placeholder="claude -p --output-format stream-json --verbose {prompt}"
                                onChange={(event) =>
                                  updateActiveCliPreset({
                                    command: event.target.value,
                                    streamMode: inferCliStreamMode(event.target.value),
                                  })
                                }
                              />
                              <span className="text-[11px] leading-[1.45] text-[var(--faint)]">
                                支持 {"{prompt}"}、{"{model}"} 和 Codex 专用 {"{output}"} 占位符；没有{" "}
                                {"{prompt}"} 时会把 prompt 写入 stdin。
                              </span>
                            </label>
                            {!builtinCliPresetIds.has(activeCliPreset.id) ? (
                              <Button
                                className="justify-self-start text-[var(--danger)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                                type="button"
                                variant="ghost"
                                onClick={deleteActiveCliPreset}
                              >
                                <Trash2 size={13} /> 删除预设
                              </Button>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}
                {localCliProvider ? null : (
                  <label className={fieldClass} htmlFor="settings-ai-api-key">
                    <span>API Key</span>
                    <div className="relative min-w-0">
                      <Input
                        id="settings-ai-api-key"
                        className={cn(inputClass, "pr-[118px]")}
                        value={aiSettings.apiKey}
                        type={aiApiKeyVisible ? "text" : "password"}
                        placeholder="sk-...，多个 Key 用逗号分隔"
                        onChange={(event) => onUpdateSettings({ apiKey: event.target.value })}
                      />
                      <div className="absolute right-1.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-[5px]">
                        {aiApiKeyCount > 1 ? (
                          <span className="max-w-[68px] whitespace-nowrap rounded-full bg-[var(--accent-soft)] px-[7px] py-0.5 text-[11px] font-[620] leading-4 text-[var(--accent)]">
                            {aiApiKeyCount} 个 Key
                          </span>
                        ) : null}
                        <Button
                          aria-label={aiApiKeyVisible ? "隐藏 API Key" : "查看 API Key"}
                          className="grid size-6 place-items-center rounded-[7px] border-0 bg-transparent p-0 text-[var(--muted)] hover:bg-[color-mix(in_srgb,var(--panel-3)_78%,transparent)] hover:text-[var(--text)]"
                          size="icon-xs"
                          type="button"
                          variant="ghost"
                          onClick={() => onApiKeyVisibleChange((visible) => !visible)}
                        >
                          {aiApiKeyVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                        </Button>
                      </div>
                    </div>
                  </label>
                )}
              </div>
              <div className={cn(settingsPanelClass, "grid gap-3")}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[13px] font-[660] text-[var(--text)]">AI 分组 Prompt</div>
                    <div className="mt-0.5 text-xs leading-5 text-[var(--muted)]">
                      用于控制业务分组的命名和归类偏好。
                    </div>
                  </div>
                  <Button
                    size="sm"
                    type="button"
                    variant="secondary"
                    disabled={aiGroupingPrompt === aiGroupingDefaultPrompt}
                    onClick={() => onUpdateSettings({ aiGroupingPrompt: aiGroupingDefaultPrompt })}
                  >
                    恢复默认
                  </Button>
                </div>
                <label className={fieldClass} htmlFor="settings-ai-grouping-prompt">
                  <span>Prompt</span>
                  <Textarea
                    id="settings-ai-grouping-prompt"
                    className={cn(textareaClass, "min-h-[150px]")}
                    value={aiGroupingPrompt}
                    placeholder="输入 AI 分组 Prompt"
                    onChange={(event) => onUpdateSettings({ aiGroupingPrompt: event.target.value })}
                  />
                </label>
              </div>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettingsNavItem({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick(): void;
}) {
  return (
    <Button
      className={cn(
        "mb-1 h-[34px] w-full justify-start gap-2 bg-transparent px-2.5 text-[var(--muted)] hover:bg-[color-mix(in_srgb,var(--panel)_74%,transparent)] hover:text-[var(--text)]",
        active &&
          "bg-[var(--accent-row)] text-[var(--text)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_16%,transparent)]",
      )}
      type="button"
      variant="ghost"
      onClick={onClick}
    >
      {icon}
      {label}
    </Button>
  );
}

function SettingsSectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-[18px] font-[720] leading-tight text-[var(--text)]">{title}</h2>
      <p className="mt-1 max-w-[540px] text-[13px] leading-5 text-[var(--muted)]">{description}</p>
    </div>
  );
}
