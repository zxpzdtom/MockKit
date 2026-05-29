import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, Info } from "lucide-react";
import type { AiProvider, AiSettings } from "../types";

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

const aiFieldClass = "grid gap-1.5 [&>span]:text-xs [&>span]:font-[560] [&>span]:text-[var(--muted)]";
const aiInputClass =
  "h-[34px] w-full rounded-[10px] border border-[var(--border)] bg-[#fbfbfc] px-3 text-[13px] text-[var(--text)] shadow-[var(--control-shadow)]";
const aiSelectTriggerClass = cn(
  aiInputClass,
  "justify-between gap-2.5 hover:border-[color-mix(in_srgb,var(--accent)_30%,var(--border))] hover:bg-[color-mix(in_srgb,var(--panel)_96%,white)]",
  "focus:border-[color-mix(in_srgb,var(--accent)_52%,var(--border))] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_14%,transparent),var(--control-shadow)]",
  "focus-visible:border-[color-mix(in_srgb,var(--accent)_52%,var(--border))] focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_14%,transparent),var(--control-shadow)]",
  "data-[popup-open]:border-[color-mix(in_srgb,var(--accent)_52%,var(--border))] data-[popup-open]:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_14%,transparent),var(--control-shadow)] [&_svg]:text-[var(--muted)]",
);

interface AiSettingsDialogProps {
  aiApiKeyCount: number;
  aiApiKeyVisible: boolean;
  aiEnabled: boolean;
  aiSettings: AiSettings;
  onApiKeyVisibleChange(value: boolean | ((visible: boolean) => boolean)): void;
  onOpenChange(open: boolean): void;
  onUpdateSettings(patch: Partial<AiSettings>): void;
  open: boolean;
}

export function AiSettingsDialog({
  aiApiKeyCount,
  aiApiKeyVisible,
  aiEnabled,
  aiSettings,
  onApiKeyVisibleChange,
  onOpenChange,
  onUpdateSettings,
  open,
}: AiSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(640px,calc(100vw-56px))] max-w-[min(640px,calc(100vw-56px))] overflow-hidden bg-[color-mix(in_srgb,var(--panel)_98%,white)] sm:max-w-[640px]">
        <DialogHeader className="pr-10">
          <DialogTitle>AI 设置</DialogTitle>
          <DialogDescription>配置用于生成 Mock 数据的模型。</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Alert variant="warning">
            <div className="flex items-center gap-[7px]">
              <Info className="text-[var(--warning)]" size={14} />
              <AlertTitle>本地保存</AlertTitle>
            </div>
            <AlertDescription>API Key 仅保存在本机应用数据中，不会随配置文件导入或导出。</AlertDescription>
          </Alert>
          <div className="flex min-h-[46px] items-center justify-between gap-3.5 rounded-[10px] border border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--panel)_78%,var(--panel-2))] px-3 py-2.5">
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
          <div className={aiFieldClass}>
            <span>服务商</span>
            <Select
              value={aiSettings.provider}
              onValueChange={(provider) => {
                if (provider) onUpdateSettings({ provider: provider as AiProvider });
              }}
            >
              <SelectTrigger id="ai-provider-trigger" className={aiSelectTriggerClass}>
                <SelectValue className="min-w-0 truncate font-medium text-[var(--text)]" />
              </SelectTrigger>
              <SelectContent
                position="popper"
                className="z-[80] min-w-[var(--radix-select-trigger-width)] border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_98%,white)] text-[var(--text)] shadow-[0_14px_34px_rgba(15,23,42,0.18),0_2px_7px_rgba(15,23,42,0.12)]"
              >
                {aiProviderItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className={aiFieldClass} htmlFor="ai-model">
            <span>模型</span>
            <Input
              id="ai-model"
              className={aiInputClass}
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
            <label className={aiFieldClass} htmlFor="ai-base-url">
              <span>Base URL</span>
              <Input
                id="ai-base-url"
                className={aiInputClass}
                value={aiSettings.baseUrl}
                placeholder="https://api.example.com/v1"
                onChange={(event) => onUpdateSettings({ baseUrl: event.target.value })}
              />
            </label>
          ) : null}
          <label className={aiFieldClass} htmlFor="ai-api-key">
            <span>API Key</span>
            <div className="relative min-w-0">
              <Input
                id="ai-api-key"
                className={cn(aiInputClass, "pr-[118px]")}
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
        <DialogFooter>
          <Button variant="secondary" type="button" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            完成
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
