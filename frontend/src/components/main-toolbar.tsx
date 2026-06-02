import { Button } from "@/components/ui/button";
import { Braces, RotateCw, Settings2 } from "lucide-react";
import type { AppMessages } from "../i18n";
import { send } from "../lib/native";

interface MainToolbarProps {
  endpointCount: number;
  messages: AppMessages["toolbar"];
  commonMessages: AppMessages["common"];
  updateReady: boolean;
  onImportCurl(): void;
  onInstallUpdate(): void;
  onOpenAiSettings(): void;
}

export function MainToolbar({
  endpointCount,
  messages,
  commonMessages,
  updateReady,
  onImportCurl,
  onInstallUpdate,
  onOpenAiSettings,
}: MainToolbarProps) {
  return (
    <header
      className="native-drag-region flex min-w-0 items-center gap-2.5 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_92%,transparent)] px-3 py-2 pl-4"
      data-native-drag-region="true"
      onDoubleClick={(event) => !event.defaultPrevented && send("toggleZoom")}
    >
      <div className="whitespace-nowrap text-xs text-[var(--muted)]">
        {commonMessages.endpointCount(endpointCount)}
      </div>
      <div className="flex-1" />
      {updateReady ? (
        <Button className="min-h-8 px-3" variant="secondary" type="button" onClick={onInstallUpdate}>
          <RotateCw size={14} />
          {messages.restartUpdate}
        </Button>
      ) : null}
      <Button
        aria-label={messages.aiSettings}
        className="min-h-8 px-3"
        variant="secondary"
        type="button"
        onClick={onOpenAiSettings}
      >
        <Settings2 size={14} />
        {messages.aiSettings}
      </Button>
      <Button className="min-h-8 px-3" variant="secondary" type="button" onClick={onImportCurl}>
        <Braces size={14} />
        {messages.importCurl}
      </Button>
    </header>
  );
}
