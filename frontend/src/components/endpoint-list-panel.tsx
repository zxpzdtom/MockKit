import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { FileSearch2, Plus, Search } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { toast as sonnerToast } from "sonner";
import type { AppMessages } from "../i18n";
import type { Endpoint, EndpointSearchMatch } from "../types";

const endpointRowBadgeClass =
  "col-start-2 row-span-2 row-start-1 w-max max-w-28 justify-self-end truncate rounded-full bg-[var(--accent-soft)] px-[7px] py-0.5 text-[11px] font-[620] text-[var(--accent)]";

function activeCase(endpoint: Endpoint) {
  return endpoint.cases.find((item) => item.id === endpoint.activeCaseId) ?? endpoint.cases[0] ?? null;
}

interface EndpointListPanelProps {
  endpointSearchMatches: Map<string, EndpointSearchMatch>;
  endpoints: Endpoint[];
  filteredEndpoints: Endpoint[];
  messages: AppMessages["endpointList"];
  commonMessages: AppMessages["common"];
  getEndpointContextIds(endpoint: Endpoint): string[];
  onAddEndpoint(): void;
  onClearSelection(): void;
  onDeleteSelectedEndpoints(): void;
  onEndpointRowClick(endpoint: Endpoint, event: ReactMouseEvent<HTMLButtonElement>): void;
  onEndpointSelectionGesture(
    endpointId: string,
    event: ReactMouseEvent<HTMLElement>,
    selected: boolean,
  ): void;
  onPrepareEndpointContextMenu(endpoint: Endpoint): void;
  onQueryChange(value: string): void;
  onRegexEnabledChange(value: boolean | ((enabled: boolean) => boolean)): void;
  onRequestDeleteEndpoint(endpoint: Endpoint): void;
  onRevealEndpointDirectory(endpoint: Endpoint): void;
  onSetEndpointIdsEnabled(endpointIds: string[], enabled: boolean): void;
  onToggleEndpointSelection(endpointId: string, checked: boolean): void;
  query: string;
  searchRegexEnabled: boolean;
  selectedDirectoryLabel: string;
  selectedEndpointCount: number;
  selectedEndpointId: string | null;
  selectedEndpointIds: Set<string>;
}

export function EndpointListPanel({
  endpointSearchMatches,
  endpoints,
  filteredEndpoints,
  messages,
  commonMessages,
  getEndpointContextIds,
  onAddEndpoint,
  onClearSelection,
  onDeleteSelectedEndpoints,
  onEndpointRowClick,
  onEndpointSelectionGesture,
  onPrepareEndpointContextMenu,
  onQueryChange,
  onRegexEnabledChange,
  onRequestDeleteEndpoint,
  onRevealEndpointDirectory,
  onSetEndpointIdsEnabled,
  onToggleEndpointSelection,
  query,
  searchRegexEnabled,
  selectedDirectoryLabel,
  selectedEndpointCount,
  selectedEndpointId,
  selectedEndpointIds,
}: EndpointListPanelProps) {
  const endpointActionTooltipProps = {
    side: "bottom" as const,
    align: "center" as const,
    sideOffset: 7,
  };

  return (
    <section className="grid h-full min-h-0 min-w-[300px] grid-rows-[auto_minmax(0,1fr)_28px] overflow-hidden bg-[color-mix(in_srgb,var(--panel)_97%,var(--panel-2))]">
      <div className="grid grid-cols-[minmax(0,1fr)_30px] gap-2 border-b border-[var(--border-soft)] px-3 pb-2 pt-2.5">
        <div className="relative min-w-0">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 z-[1] -translate-y-1/2 text-[var(--muted)]"
            size={16}
            strokeWidth={1.7}
          />
          <Input
            aria-label={messages.searchEndpoint}
            autoComplete="off"
            className="h-8 rounded-lg border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_82%,var(--panel-2))] pl-8 pr-[34px] text-[var(--text)]"
            enterKeyHint="search"
            id="endpoint-search-input"
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={searchRegexEnabled ? messages.searchRegexPlaceholder : messages.searchPlaceholder}
            title="Command/Ctrl+F"
            type="text"
            value={query}
          />
          <Tooltip
            content={searchRegexEnabled ? messages.regexOn : messages.regexOff}
            {...endpointActionTooltipProps}
          >
            <span className="absolute right-[5px] top-1/2 z-[1] inline-flex -translate-y-1/2">
              <Button
                aria-label={messages.regexAria}
                aria-pressed={searchRegexEnabled}
                className={cn(
                  "grid size-[23px] place-items-center rounded-md border-0 bg-transparent p-0 font-mono text-[11px] font-bold tracking-[-0.04em] text-[var(--muted)] outline-none transition-[background-color,color,box-shadow,transform] duration-[120ms] hover:bg-[color-mix(in_srgb,var(--panel-3)_82%,transparent)] hover:text-[var(--text)] active:scale-95 focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_22%,transparent)]",
                  searchRegexEnabled &&
                    "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)]",
                )}
                size="icon-xs"
                variant="ghost"
                onClick={() => onRegexEnabledChange((enabled) => !enabled)}
                type="button"
              >
                <span aria-hidden="true">.*</span>
              </Button>
            </span>
          </Tooltip>
        </div>
        <Tooltip content={messages.addEndpoint} {...endpointActionTooltipProps}>
          <span className="inline-flex">
            <Button
              className="text-[var(--accent)]"
              size="icon"
              variant="outline"
              type="button"
              onClick={onAddEndpoint}
              aria-label={messages.addEndpoint}
            >
              <Plus size={16} strokeWidth={2} />
            </Button>
          </span>
        </Tooltip>
        {selectedEndpointCount > 0 ? (
          <div className="col-span-full flex min-h-8 items-center justify-between gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--accent)_24%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_8%,var(--panel))] py-[3px] pl-2 pr-1 text-xs text-[var(--muted)] shadow-[inset_0_1px_0_rgba(255,255,255,0.58)]">
            <span className="min-w-0 truncate font-[560] tabular-nums text-[color-mix(in_srgb,var(--text)_72%,var(--muted))]">
              {commonMessages.selectedEndpointCount(selectedEndpointCount)}
            </span>
            <div className="inline-flex flex-none items-center gap-0.5">
              <Button
                aria-label={messages.clearSelection}
                className="h-[26px] min-h-[26px] gap-1 rounded-[7px] px-[7px] text-xs font-[560] leading-none text-[var(--muted)] hover:bg-[color-mix(in_srgb,var(--panel)_72%,transparent)] hover:text-[var(--text)] [&_svg]:block [&_svg]:size-3"
                size="sm"
                variant="ghost"
                type="button"
                onClick={onClearSelection}
              >
                {messages.clear}
              </Button>
              <Button
                className="h-[26px] min-h-[26px] gap-1 rounded-[7px] px-[7px] text-xs font-[560] leading-none text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_9%,transparent)] hover:text-[var(--danger)] [&_svg]:block [&_svg]:size-3"
                size="sm"
                variant="ghost"
                type="button"
                onClick={onDeleteSelectedEndpoints}
              >
                {messages.delete}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
      <ScrollArea className="scroll-mask-y-4 flex min-h-0 w-full min-w-0 flex-col gap-[3px] overflow-hidden p-2">
        {filteredEndpoints.map((item) => {
          const scenario = activeCase(item);
          const searchMatch = endpointSearchMatches.get(item.id);
          const responseMatch = searchMatch?.responseBody;
          const selected = selectedEndpointIds.has(item.id);
          const contextEndpointIds = getEndpointContextIds(item);
          const contextEndpoints = endpoints.filter((endpoint) => contextEndpointIds.includes(endpoint.id));
          const contextAllEnabled = contextEndpoints.every((endpoint) => endpoint.enabled !== false);
          const contextCount = contextEndpointIds.length;
          return (
            <ContextMenu key={item.id}>
              <ContextMenuTrigger
                className="endpoint-context-trigger"
                onContextMenu={() => onPrepareEndpointContextMenu(item)}
              >
                <div
                  className={cn(
                    "row",
                    item.enabled === false && "disabled",
                    item.id === selectedEndpointId && "active",
                    selected && "selected",
                  )}
                >
                  <span
                    className="row-select"
                    onClickCapture={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onEndpointSelectionGesture(item.id, event, !selected);
                    }}
                  >
                    <Checkbox
                      aria-label={messages.selectEndpoint(item.name)}
                      checked={selected}
                      className="endpoint-row-checkbox"
                      onCheckedChange={(checked) => onToggleEndpointSelection(item.id, checked === true)}
                    />
                  </span>
                  <button
                    className="row-hit"
                    type="button"
                    onClick={(event) => onEndpointRowClick(item, event)}
                  >
                    <span className="row-title">{item.name}</span>
                    <span className="row-subtitle">{item.overridePath}</span>
                    {responseMatch ? (
                      <span className="row-response-match">
                        <span className="row-response-match-label">
                          <FileSearch2 size={12} strokeWidth={1.8} />
                          {responseMatch.caseName}
                        </span>
                        <span className="row-response-match-snippet">
                          {responseMatch.snippet || messages.responseBodyMatch}
                        </span>
                      </span>
                    ) : null}
                    <Tooltip
                      content={
                        item.enabled === false ? messages.disabled : scenario?.name || messages.noResponse
                      }
                    >
                      <Badge
                        className={cn(
                          endpointRowBadgeClass,
                          item.enabled === false &&
                            "bg-[color-mix(in_srgb,var(--panel-3)_72%,transparent)] text-[var(--muted)]",
                        )}
                        variant={item.enabled === false ? "secondary" : "default"}
                      >
                        <span className="min-w-0 truncate">
                          {item.enabled === false ? messages.disabled : scenario?.name || messages.noResponse}
                        </span>
                      </Badge>
                    </Tooltip>
                  </button>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className="app-context-menu">
                <ContextMenuItem onClick={() => onRevealEndpointDirectory(item)}>
                  {messages.revealInDirectory}
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() => onSetEndpointIdsEnabled(contextEndpointIds, !contextAllEnabled)}
                >
                  {contextAllEnabled ? messages.disable : messages.enable}
                  {messages.endpointNoun(contextCount)}
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() => {
                    navigator.clipboard?.writeText(item.overridePath);
                    sonnerToast.success(messages.copiedEndpointPath);
                  }}
                >
                  {messages.copyEndpointPath}
                </ContextMenuItem>
                <ContextMenuItem variant="destructive" onClick={() => onRequestDeleteEndpoint(item)}>
                  {messages.deleteEndpoint(contextCount)}
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </ScrollArea>
      <div className="flex min-w-0 items-center truncate border-t border-[var(--border-soft)] px-3 text-xs text-[var(--muted)]">
        {messages.footer(filteredEndpoints.length, selectedDirectoryLabel)}
      </div>
    </section>
  );
}
