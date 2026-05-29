import { Button } from "@/components/ui/button";
import { Braces, Settings2 } from "lucide-react";
import { send } from "../lib/native";

interface MainToolbarProps {
  endpointCount: number;
  onImportCurl(): void;
  onOpenAiSettings(): void;
}

export function MainToolbar({ endpointCount, onImportCurl, onOpenAiSettings }: MainToolbarProps) {
  return (
    <header
      className="native-drag-region flex min-w-0 items-center gap-2.5 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_92%,transparent)] px-3 py-2 pl-4"
      data-native-drag-region="true"
      onDoubleClick={(event) => !event.defaultPrevented && send("toggleZoom")}
    >
      <div className="whitespace-nowrap text-xs text-[var(--muted)]">{endpointCount} 个接口</div>
      <div className="flex-1" />
      <Button
        aria-label="AI 设置"
        className="min-h-8 px-3"
        variant="secondary"
        type="button"
        onClick={onOpenAiSettings}
      >
        <Settings2 size={14} />
        AI 设置
      </Button>
      <Button className="min-h-8 px-3" variant="secondary" type="button" onClick={onImportCurl}>
        <Braces size={14} />
        导入 cURL
      </Button>
    </header>
  );
}
