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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Bot, Check, Eye, EyeOff, Info, Palette, X } from "lucide-react";
import type React from "react";
import type { AiProvider, AiSettings, AppTheme } from "../types";

const aiProviderLabels: Record<AiProvider, string> = {
  openrouter: "OpenRouter",
  openai: "OpenAI",
  gemini: "Gemini",
  compatible: "OpenAI 兼容",
};

const aiProviderItems = Object.entries(aiProviderLabels).map(([value, label]) => ({
  value: value as AiProvider,
  label,
}));

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
const settingsPanelClass =
  "rounded-[11px] border border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--panel)_78%,var(--panel-2))] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]";
const themeOptionClass =
  "grid min-h-[78px] grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-[11px] border border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--panel)_82%,var(--panel-2))] p-3 text-left text-[var(--text)] transition-[background-color,border-color,box-shadow] duration-[120ms] hover:border-[color-mix(in_srgb,var(--accent)_24%,var(--border))] hover:bg-[color-mix(in_srgb,var(--panel)_72%,var(--panel-2))]";
const activeThemeOptionClass =
  "border-[color-mix(in_srgb,var(--accent)_42%,var(--border))] bg-[color-mix(in_srgb,var(--accent-soft)_42%,var(--panel))] shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_10%,transparent)]";
const selectTriggerClass = cn(
  inputClass,
  "justify-between gap-2.5 hover:border-[color-mix(in_srgb,var(--accent)_30%,var(--border))] [&_svg]:text-[var(--muted)]",
);

interface AppSettingsDialogProps {
  aiApiKeyCount: number;
  aiApiKeyVisible: boolean;
  aiEnabled: boolean;
  aiSettings: AiSettings;
  onApiKeyVisibleChange(value: boolean | ((visible: boolean) => boolean)): void;
  onOpenChange(open: boolean): void;
  onSectionChange(section: "appearance" | "ai"): void;
  onThemeChange(theme: AppTheme): void;
  onUpdateSettings(patch: Partial<AiSettings>): void;
  open: boolean;
  section: "appearance" | "ai";
  theme: AppTheme;
}

export function AppSettingsDialog({
  aiApiKeyCount,
  aiApiKeyVisible,
  aiEnabled,
  aiSettings,
  onApiKeyVisibleChange,
  onOpenChange,
  onSectionChange,
  onThemeChange,
  onUpdateSettings,
  open,
  section,
  theme,
}: AppSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="grid h-[min(860px,calc(100vh-40px))] max-h-none w-[min(1180px,calc(100vw-40px))] max-w-none grid-cols-[240px_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden bg-[var(--panel)] p-0 sm:max-w-[min(1180px,calc(100vw-40px))]"
        showCloseButton={false}
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
          ) : (
            <section className="grid max-w-[680px] gap-5">
              <SettingsSectionHeader title="AI 生成" description="配置用于生成 Mock 数据的模型和 Key。" />
              <Alert variant="warning">
                <div className="flex items-center gap-[7px]">
                  <Info className="text-[var(--warning)]" size={14} />
                  <AlertTitle>本地保存</AlertTitle>
                </div>
                <AlertDescription>
                  API Key 仅保存在本机应用数据中，不会随配置文件导入或导出。
                </AlertDescription>
              </Alert>
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
              <div className={cn(settingsPanelClass, "grid gap-4")}>
                <div className={fieldClass}>
                  <span>服务商</span>
                  <Select
                    value={aiSettings.provider}
                    onValueChange={(provider) => {
                      if (provider) onUpdateSettings({ provider: provider as AiProvider });
                    }}
                  >
                    <SelectTrigger id="settings-ai-provider-trigger" className={selectTriggerClass}>
                      <SelectValue className="min-w-0 truncate font-medium text-[var(--text)]" />
                    </SelectTrigger>
                    <SelectContent
                      position="popper"
                      className="z-[80] min-w-[var(--radix-select-trigger-width)] border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] shadow-[var(--elevated-shadow)]"
                    >
                      {aiProviderItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
