import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";
import { FolderOpen, List, ListTree, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { send } from "../lib/native";
import { cn } from "../lib/utils";

const panelLabelClass = "text-[11px] font-[650] uppercase tracking-[0.02em] text-[var(--muted)]";

interface AppSidebarProps {
  children: ReactNode;
  directoryViewMode: "tree" | "flat";
  mockEnabled: boolean;
  onCreateGroup(): void;
  onDirectoryViewModeChange(mode: "tree" | "flat"): void;
  onMockEnabledChange(enabled: boolean): void;
  overridesFolder: string;
}

export function AppSidebar({
  children,
  directoryViewMode,
  mockEnabled,
  onCreateGroup,
  onDirectoryViewModeChange,
  onMockEnabledChange,
  overridesFolder,
}: AppSidebarProps) {
  return (
    <aside className="flex h-full min-w-[232px] flex-col bg-[var(--sidebar)] backdrop-blur-[18px] backdrop-saturate-[1.1]">
      <div className="native-drag-region h-[46px]" data-native-drag-region="true" />
      <section className="px-3.5 pb-4">
        <div className={panelLabelClass}>LOCAL OVERRIDES</div>
        <div className="mt-[7px] flex min-h-7 items-center justify-between gap-2.5">
          <div className="text-sm font-[680]">工作区</div>
          <Switch aria-label="全局 Mock" checked={mockEnabled} onCheckedChange={onMockEnabledChange} />
        </div>
        <div className="mt-[3px] grid grid-cols-[minmax(0,1fr)_28px] items-center gap-[7px]">
          <div className="truncate text-xs text-[var(--muted)]">{overridesFolder}</div>
          <Tooltip content="在访达中打开">
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
          <div className={panelLabelClass}>目录</div>
          <Tooltip content="新建业务分组">
            <Button
              className="source-add-button"
              size="icon-xs"
              variant="ghost"
              onClick={onCreateGroup}
              type="button"
            >
              <Plus size={13} />
            </Button>
          </Tooltip>
          <fieldset className="source-view-toggle" aria-label="目录视图">
            <Tooltip content="树状目录">
              <Button
                aria-pressed={directoryViewMode === "tree"}
                className={cn("source-view-button", directoryViewMode === "tree" && "active")}
                size="icon-xs"
                variant="ghost"
                onClick={() => onDirectoryViewModeChange("tree")}
                type="button"
              >
                <ListTree size={14} />
              </Button>
            </Tooltip>
            <Tooltip content="合并空目录">
              <Button
                aria-pressed={directoryViewMode === "flat"}
                className={cn("source-view-button", directoryViewMode === "flat" && "active")}
                size="icon-xs"
                variant="ghost"
                onClick={() => onDirectoryViewModeChange("flat")}
                type="button"
              >
                <List size={14} />
              </Button>
            </Tooltip>
          </fieldset>
        </div>
        {children}
      </section>
    </aside>
  );
}
