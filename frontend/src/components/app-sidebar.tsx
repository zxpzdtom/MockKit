import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";
import { CircleAlert, FolderOpen, List, ListTree, Plus, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import type { AppMessages } from "../i18n";
import { send } from "../lib/native";
import { cn } from "../lib/utils";

const panelLabelClass = "text-[11px] font-[650] uppercase tracking-[0.02em] text-[var(--muted)]";

interface AppSidebarProps {
  children: ReactNode;
  directoryViewMode: "tree" | "flat";
  aiGroupingEnabled: boolean;
  messages: AppMessages["sidebar"];
  mockEnabled: boolean;
  onAiGroup(): void;
  onCreateGroup(): void;
  onDirectoryViewModeChange(mode: "tree" | "flat"): void;
  onMockEnabledChange(enabled: boolean): void;
  overridesFolder: string;
}

export function AppSidebar({
  children,
  directoryViewMode,
  aiGroupingEnabled,
  messages,
  mockEnabled,
  onAiGroup,
  onCreateGroup,
  onDirectoryViewModeChange,
  onMockEnabledChange,
  overridesFolder,
}: AppSidebarProps) {
  const sourceActionTooltipProps = {
    side: "bottom" as const,
    align: "center" as const,
    sideOffset: 7,
    avoidCollisions: false,
  };

  return (
    <aside className="flex h-full min-w-[232px] flex-col bg-[var(--sidebar)] backdrop-blur-[18px] backdrop-saturate-[1.1]">
      <div className="native-drag-region h-[46px]" data-native-drag-region="true" />
      <section className="px-3.5 pb-4">
        <div className={panelLabelClass}>{messages.localOverrides}</div>
        <div className="mt-[7px] flex min-h-7 items-center justify-between gap-2.5">
          <div className="text-sm font-[680]">{messages.workspace}</div>
          <div className="workspace-switch-cluster">
            <Tooltip content={messages.globalMockHint} side="bottom" align="end" sideOffset={7}>
              <span
                aria-label={messages.globalMockConditionAria}
                className="workspace-switch-hint"
                role="img"
              >
                <CircleAlert size={14} strokeWidth={1.9} />
              </span>
            </Tooltip>
            <Switch
              aria-label={messages.globalMockAria}
              checked={mockEnabled}
              onCheckedChange={onMockEnabledChange}
            />
          </div>
        </div>
        <div className="mt-[3px] grid grid-cols-[minmax(0,1fr)_28px] items-center gap-[7px]">
          <div className="truncate text-xs text-[var(--muted)]">{overridesFolder}</div>
          <Tooltip content={messages.revealFolder}>
            <Button
              className="grid h-7 w-[30px] place-items-center rounded-[7px] border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--panel)_70%,transparent)] text-[var(--muted)] shadow-[var(--control-shadow)] hover:border-[var(--border-soft)] hover:bg-[color-mix(in_srgb,var(--panel-3)_78%,transparent)] active:scale-95"
              size="icon-sm"
              variant="outline"
              type="button"
              onClick={() => send("revealFolder")}
            >
              <FolderOpen size={15} strokeWidth={1.7} />
            </Button>
          </Tooltip>
        </div>
      </section>

      <section className="source-list">
        <div className="source-section-row">
          <div className={panelLabelClass}>{messages.directory}</div>
          {aiGroupingEnabled ? (
            <Tooltip content={messages.aiAutoGroup} {...sourceActionTooltipProps}>
              <span className="source-tooltip-trigger">
                <Button
                  aria-label={messages.aiAutoGroup}
                  className="source-add-button source-ai-button"
                  size="icon-xs"
                  variant="ghost"
                  onClick={onAiGroup}
                  type="button"
                >
                  <Sparkles size={13} />
                </Button>
              </span>
            </Tooltip>
          ) : null}
          <Tooltip content={messages.createGroup} {...sourceActionTooltipProps}>
            <span className="source-tooltip-trigger">
              <Button
                aria-label={messages.createGroup}
                className="source-add-button"
                size="icon-xs"
                variant="ghost"
                onClick={onCreateGroup}
                type="button"
              >
                <Plus size={13} />
              </Button>
            </span>
          </Tooltip>
          <fieldset className="source-view-toggle" aria-label={messages.directoryView}>
            <Tooltip content={messages.treeDirectory} {...sourceActionTooltipProps}>
              <span className="source-tooltip-trigger">
                <Button
                  aria-label={messages.treeDirectory}
                  aria-pressed={directoryViewMode === "tree"}
                  className={cn("source-view-button", directoryViewMode === "tree" && "active")}
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => onDirectoryViewModeChange("tree")}
                  type="button"
                >
                  <ListTree size={14} />
                </Button>
              </span>
            </Tooltip>
            <Tooltip content={messages.flattenEmptyDirs} {...sourceActionTooltipProps}>
              <span className="source-tooltip-trigger">
                <Button
                  aria-label={messages.flattenEmptyDirs}
                  aria-pressed={directoryViewMode === "flat"}
                  className={cn("source-view-button", directoryViewMode === "flat" && "active")}
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => onDirectoryViewModeChange("flat")}
                  type="button"
                >
                  <List size={14} />
                </Button>
              </span>
            </Tooltip>
          </fieldset>
        </div>
        {children}
      </section>
    </aside>
  );
}
