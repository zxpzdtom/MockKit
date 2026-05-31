import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ChevronRight, FileJson, FolderOpen, Loader2, Sparkles } from "lucide-react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Endpoint } from "../types";

type ScopePreset = "ungrouped" | "selected" | "directory" | "all" | "custom";
const ROOT_SCOPE_NODE_ID = "__root__";
const UNGROUPED_SCOPE_NODE_ID = "__ungrouped__";

interface AiGroupingScopeDialogProps {
  currentDirectory: string;
  endpointDirectoryPath(endpoint: Endpoint): string;
  endpoints: Endpoint[];
  expandedDirectoryPaths: Set<string>;
  generating: boolean;
  onGenerate(endpoints: Endpoint[]): void;
  onOpenChange(open: boolean): void;
  open: boolean;
  selectedEndpointIds: Set<string>;
}

interface ScopeTreeNode {
  children: ScopeTreeNode[];
  endpoints: Endpoint[];
  id: string;
  label: string;
  path: string;
}

type ScopeVisibleNode =
  | { key: string; type: "directory"; node: ScopeTreeNode; depth: number }
  | { key: string; type: "endpoint"; endpoint: Endpoint; depth: number; parentNode: ScopeTreeNode };

function cleanGroupPath(path: string) {
  return path
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/");
}

function buildScopeTree(endpoints: Endpoint[]) {
  const root: ScopeTreeNode = {
    children: [],
    endpoints: [],
    id: ROOT_SCOPE_NODE_ID,
    label: "全部接口",
    path: "",
  };
  const nodesByPath = new Map<string, ScopeTreeNode>([["", root]]);

  const ensureNode = (path: string, label: string, parent: ScopeTreeNode) => {
    const existing = nodesByPath.get(path);
    if (existing) return existing;
    const node: ScopeTreeNode = { children: [], endpoints: [], id: path, label, path };
    nodesByPath.set(path, node);
    parent.children.push(node);
    return node;
  };

  const ensureUngroupedNode = () => ensureNode(UNGROUPED_SCOPE_NODE_ID, "未分组", root);

  for (const endpoint of endpoints) {
    const groupPath = cleanGroupPath(endpoint.groupPath ?? "");
    if (!groupPath) {
      ensureUngroupedNode().endpoints.push(endpoint);
      continue;
    }

    let parent = root;
    let currentPath = "";
    for (const part of groupPath.split("/")) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      parent = ensureNode(currentPath, part, parent);
    }
    parent.endpoints.push(endpoint);
  }

  const sortNode = (node: ScopeTreeNode) => {
    node.children.sort((left, right) => left.label.localeCompare(right.label));
    node.endpoints.sort(
      (left, right) =>
        left.name.localeCompare(right.name) || left.overridePath.localeCompare(right.overridePath),
    );
    for (const child of node.children) sortNode(child);
  };
  sortNode(root);
  return root;
}

function compactEmptyDirectoryChain(node: ScopeTreeNode) {
  const labels = [node.label];
  let displayNode = node;
  while (displayNode.endpoints.length === 0 && displayNode.children.length === 1) {
    displayNode = displayNode.children[0];
    labels.push(displayNode.label);
  }
  return { label: labels.join("/"), node: displayNode };
}

function scopeNodeEndpointIds(node: ScopeTreeNode): string[] {
  return [
    ...node.endpoints.map((endpoint) => endpoint.id),
    ...node.children.flatMap((child) => scopeNodeEndpointIds(child)),
  ];
}

function scopeNodeEndpointCount(node: ScopeTreeNode): number {
  return node.endpoints.length + node.children.reduce((sum, child) => sum + scopeNodeEndpointCount(child), 0);
}

function scopeNodeSelectedCount(node: ScopeTreeNode, checkedIds: Set<string>): number {
  return (
    node.endpoints.filter((endpoint) => checkedIds.has(endpoint.id)).length +
    node.children.reduce((sum, child) => sum + scopeNodeSelectedCount(child, checkedIds), 0)
  );
}

function defaultExpandedScopeNodeIds(nodes: ScopeTreeNode[], expandedDirectoryPaths: Set<string>): string[] {
  return nodes.flatMap((node) => {
    const { node: displayNode } = compactEmptyDirectoryChain(node);
    const childIds = defaultExpandedScopeNodeIds(displayNode.children, expandedDirectoryPaths);
    return expandedDirectoryPaths.has(displayNode.path) ? [displayNode.id, ...childIds] : childIds;
  });
}

function scopeCheckboxId(scopeId: string) {
  return `scope-checkbox-${encodeURIComponent(scopeId).replace(/%/g, "_")}`;
}

function scopeTreeNodeKey(node: ScopeTreeNode) {
  return `directory:${node.id}`;
}

function scopeEndpointKey(endpointId: string) {
  return `endpoint:${endpointId}`;
}

function scopeTreeDomId(key: string) {
  return `scope-tree-${encodeURIComponent(key).replace(/%/g, "_")}`;
}

function visibleScopeTreeNodes(
  nodes: ScopeTreeNode[],
  expandedNodeIds: Set<string>,
  depth = 0,
): ScopeVisibleNode[] {
  return nodes.flatMap((node) => {
    const { node: displayNode } = compactEmptyDirectoryChain(node);
    const row: ScopeVisibleNode = {
      key: scopeTreeNodeKey(displayNode),
      type: "directory",
      node: displayNode,
      depth,
    };
    if (!expandedNodeIds.has(displayNode.id)) return [row];

    return [
      row,
      ...visibleScopeTreeNodes(displayNode.children, expandedNodeIds, depth + 1),
      ...displayNode.endpoints.map(
        (endpoint): ScopeVisibleNode => ({
          key: scopeEndpointKey(endpoint.id),
          type: "endpoint",
          endpoint,
          depth: depth + 1,
          parentNode: displayNode,
        }),
      ),
    ];
  });
}

function isEndpointInDirectory(
  endpoint: Endpoint,
  directory: string,
  endpointDirectoryPath: (endpoint: Endpoint) => string,
) {
  const path = endpointDirectoryPath(endpoint);
  return !directory || path === directory || path.startsWith(`${directory}/`);
}

export function AiGroupingScopeDialog({
  currentDirectory,
  endpointDirectoryPath,
  endpoints,
  expandedDirectoryPaths,
  generating,
  onGenerate,
  onOpenChange,
  open,
  selectedEndpointIds,
}: AiGroupingScopeDialogProps) {
  const ungroupedIds = useMemo(
    () => endpoints.filter((item) => !cleanGroupPath(item.groupPath ?? "")).map((item) => item.id),
    [endpoints],
  );
  const selectedIds = useMemo(
    () => endpoints.filter((item) => selectedEndpointIds.has(item.id)).map((item) => item.id),
    [endpoints, selectedEndpointIds],
  );
  const directoryIds = useMemo(
    () =>
      endpoints
        .filter((item) => isEndpointInDirectory(item, currentDirectory, endpointDirectoryPath))
        .map((item) => item.id),
    [currentDirectory, endpointDirectoryPath, endpoints],
  );
  const showSelectedPreset = selectedIds.length > 0;
  const showDirectoryPreset =
    Boolean(currentDirectory) && directoryIds.length > 0 && directoryIds.length < endpoints.length;
  const defaultPreset: ScopePreset =
    ungroupedIds.length > 0
      ? "ungrouped"
      : showSelectedPreset
        ? "selected"
        : showDirectoryPreset
          ? "directory"
          : "all";
  const [preset, setPreset] = useState<ScopePreset>(defaultPreset);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(
    () => new Set(ungroupedIds.length > 0 ? ungroupedIds : endpoints.map((item) => item.id)),
  );
  const scopeTree = useMemo(() => buildScopeTree(endpoints), [endpoints]);
  const defaultExpandedNodeIds = useMemo(
    () => defaultExpandedScopeNodeIds(scopeTree.children, expandedDirectoryPaths),
    [expandedDirectoryPaths, scopeTree],
  );
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(() => new Set(defaultExpandedNodeIds));
  const [focusedNodeKey, setFocusedNodeKey] = useState("");
  const treeRef = useRef<HTMLDivElement | null>(null);
  const visibleNodes = useMemo(
    () => visibleScopeTreeNodes(scopeTree.children, expandedNodeIds),
    [expandedNodeIds, scopeTree],
  );

  useEffect(() => {
    if (!open) return;
    const nextPreset: ScopePreset =
      ungroupedIds.length > 0
        ? "ungrouped"
        : showSelectedPreset
          ? "selected"
          : showDirectoryPreset
            ? "directory"
            : "all";
    const nextIds =
      nextPreset === "ungrouped"
        ? ungroupedIds
        : nextPreset === "selected"
          ? selectedIds
          : nextPreset === "directory"
            ? directoryIds
            : endpoints.map((item) => item.id);
    setPreset(nextPreset);
    setCheckedIds(new Set(nextIds));
    const nextExpandedNodeIds = new Set(defaultExpandedNodeIds);
    setExpandedNodeIds(nextExpandedNodeIds);
    const nextVisibleNodes = visibleScopeTreeNodes(scopeTree.children, nextExpandedNodeIds);
    setFocusedNodeKey(nextVisibleNodes[0]?.key ?? "");
  }, [
    defaultExpandedNodeIds,
    directoryIds,
    endpoints,
    open,
    selectedIds,
    showDirectoryPreset,
    showSelectedPreset,
    scopeTree,
    ungroupedIds,
  ]);

  useEffect(() => {
    if (!open || generating) return;
    window.requestAnimationFrame(() => treeRef.current?.focus());
  }, [generating, open]);

  function idsForPreset(nextPreset: ScopePreset) {
    if (nextPreset === "ungrouped") return ungroupedIds;
    if (nextPreset === "selected") return selectedIds;
    if (nextPreset === "directory") return directoryIds;
    if (nextPreset === "all") return endpoints.map((item) => item.id);
    return [...checkedIds];
  }

  const applyPreset = (nextPreset: ScopePreset) => {
    setPreset(nextPreset);
    if (nextPreset !== "custom") setCheckedIds(new Set(idsForPreset(nextPreset)));
  };

  const toggleEndpoint = (endpointId: string, checked: boolean) => {
    setPreset("custom");
    setCheckedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(endpointId);
      else next.delete(endpointId);
      return next;
    });
  };

  const toggleEndpointIds = (endpointIds: string[], checked: boolean) => {
    setPreset("custom");
    setCheckedIds((current) => {
      const next = new Set(current);
      for (const endpointId of endpointIds) {
        if (checked) next.add(endpointId);
        else next.delete(endpointId);
      }
      return next;
    });
  };

  const toggleExpandedNode = (nodeId: string) => {
    setExpandedNodeIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const scrollFocusedNodeIntoView = (key: string) => {
    window.requestAnimationFrame(() => {
      document.getElementById(scopeTreeDomId(key))?.scrollIntoView({ block: "nearest" });
    });
  };

  const focusScopeNode = (key: string) => {
    setFocusedNodeKey(key);
    scrollFocusedNodeIntoView(key);
  };

  const toggleVisibleNodeChecked = (node: ScopeVisibleNode, checked?: boolean) => {
    if (generating) return;
    if (node.type === "endpoint") {
      toggleEndpoint(node.endpoint.id, checked ?? !checkedIds.has(node.endpoint.id));
      return;
    }
    const endpointIds = scopeNodeEndpointIds(node.node);
    const selectedCount = scopeNodeSelectedCount(node.node, checkedIds);
    toggleEndpointIds(endpointIds, checked ?? selectedCount !== endpointIds.length);
  };

  const handleScopeTreeKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", " "].includes(event.key)) return;
    const safeFocusedKey = visibleNodes.some((node) => node.key === focusedNodeKey)
      ? focusedNodeKey
      : (visibleNodes[0]?.key ?? "");
    const currentIndex = visibleNodes.findIndex((node) => node.key === safeFocusedKey);
    const safeIndex = currentIndex === -1 ? 0 : currentIndex;
    const currentNode = visibleNodes[safeIndex];
    if (!currentNode) return;

    event.preventDefault();
    if (event.key === "ArrowUp") {
      const nextNode = visibleNodes[Math.max(0, safeIndex - 1)] ?? currentNode;
      focusScopeNode(nextNode.key);
      return;
    }
    if (event.key === "ArrowDown") {
      const nextNode = visibleNodes[Math.min(visibleNodes.length - 1, safeIndex + 1)] ?? currentNode;
      focusScopeNode(nextNode.key);
      return;
    }
    if (currentNode.type === "endpoint") {
      if (event.key === "ArrowLeft") focusScopeNode(scopeTreeNodeKey(currentNode.parentNode));
      if (event.key === "Enter" || event.key === " ") toggleVisibleNodeChecked(currentNode);
      return;
    }

    if (event.key === "ArrowRight") {
      if (currentNode.node.children.length > 0 || currentNode.node.endpoints.length > 0) {
        if (!expandedNodeIds.has(currentNode.node.id)) {
          setExpandedNodeIds((current) => new Set(current).add(currentNode.node.id));
          return;
        }
        const firstChild = visibleScopeTreeNodes([currentNode.node], expandedNodeIds)[1];
        if (firstChild) focusScopeNode(firstChild.key);
      }
      return;
    }
    if (event.key === "ArrowLeft") {
      if (expandedNodeIds.has(currentNode.node.id)) {
        setExpandedNodeIds((current) => {
          const next = new Set(current);
          next.delete(currentNode.node.id);
          return next;
        });
        return;
      }
      const parentNode = visibleNodes
        .slice(0, safeIndex)
        .reverse()
        .find((node) => node.type === "directory" && node.depth === currentNode.depth - 1);
      if (parentNode) focusScopeNode(parentNode.key);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      toggleVisibleNodeChecked(currentNode);
    }
  };

  const selectedEndpoints = endpoints.filter((item) => checkedIds.has(item.id));
  const handleOpenChange = (nextOpen: boolean) => {
    if (generating && !nextOpen) return;
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="grid max-h-[min(760px,calc(100vh-48px))] w-[min(760px,calc(100vw-56px))] max-w-none grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden bg-[color-mix(in_srgb,var(--panel)_98%,white)] sm:max-w-[min(760px,calc(100vw-56px))]">
        <DialogHeader className="pr-10">
          <DialogTitle>选择 AI 分组范围</DialogTitle>
          <DialogDescription>
            先选择要交给 AI 整理的接口；已有分组会作为上下文帮助复用目录。
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(128px,1fr))] gap-2">
          <ScopeButton
            active={preset === "ungrouped"}
            count={ungroupedIds.length}
            label="未分组"
            disabled={generating}
            onClick={() => applyPreset("ungrouped")}
          />
          {showSelectedPreset ? (
            <ScopeButton
              active={preset === "selected"}
              count={selectedIds.length}
              label="已选接口"
              disabled={generating}
              onClick={() => applyPreset("selected")}
            />
          ) : null}
          {showDirectoryPreset ? (
            <ScopeButton
              active={preset === "directory"}
              count={directoryIds.length}
              label="当前目录"
              disabled={generating}
              onClick={() => applyPreset("directory")}
            />
          ) : null}
          <ScopeButton
            active={preset === "all"}
            count={endpoints.length}
            label="全部接口"
            disabled={generating}
            onClick={() => applyPreset("all")}
          />
        </div>
        <ScrollArea className="min-h-[360px] overflow-hidden rounded-[12px] border border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--panel)_86%,var(--panel-2))] p-2">
          <div
            className="scope-tree"
            role="tree"
            aria-label="接口分组树"
            aria-activedescendant={focusedNodeKey ? scopeTreeDomId(focusedNodeKey) : undefined}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: This tree uses aria-activedescendant keyboard navigation.
            tabIndex={0}
            ref={treeRef}
            onKeyDown={handleScopeTreeKeyDown}
          >
            {scopeTree.children.map((node) => (
              <ScopeTreeNodeRow
                checkedIds={checkedIds}
                depth={0}
                expandedNodeIds={expandedNodeIds}
                focusedNodeKey={focusedNodeKey}
                key={node.id}
                node={node}
                onToggleExpanded={toggleExpandedNode}
                onToggleEndpoint={toggleEndpoint}
                onToggleNode={(treeNode, checked) =>
                  !generating && toggleEndpointIds(scopeNodeEndpointIds(treeNode), checked)
                }
              />
            ))}
            {scopeTree.children.length === 0 ? (
              <div className="grid min-h-[220px] place-items-center text-sm text-[var(--muted)]">
                暂无可分组接口
              </div>
            ) : null}
          </div>
        </ScrollArea>
        <DialogFooter>
          <div className="mr-auto flex items-center gap-2 text-xs text-[var(--muted)]">
            <Sparkles size={13} />
            已选择 {selectedEndpoints.length} 个接口
          </div>
          <Button variant="secondary" type="button" disabled={generating} onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            type="button"
            disabled={selectedEndpoints.length === 0 || generating}
            onClick={() => onGenerate(selectedEndpoints)}
          >
            {generating ? (
              <>
                <Loader2 className="animate-spin" size={14} />
                生成中...
              </>
            ) : (
              "开始 AI 分组"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScopeTreeNodeRow({
  checkedIds,
  depth,
  expandedNodeIds,
  focusedNodeKey,
  node,
  onToggleExpanded,
  onToggleEndpoint,
  onToggleNode,
}: {
  checkedIds: Set<string>;
  depth: number;
  expandedNodeIds: Set<string>;
  focusedNodeKey: string;
  node: ScopeTreeNode;
  onToggleExpanded(nodeId: string): void;
  onToggleEndpoint(endpointId: string, checked: boolean): void;
  onToggleNode(node: ScopeTreeNode, checked: boolean): void;
}) {
  const { label, node: displayNode } = compactEmptyDirectoryChain(node);
  const endpointCount = scopeNodeEndpointCount(displayNode);
  const selectedCount = scopeNodeSelectedCount(displayNode, checkedIds);
  const checked = endpointCount > 0 && selectedCount === endpointCount;
  const mixed = selectedCount > 0 && !checked;
  const indentStyle = { "--scope-tree-indent": `${depth * 18}px` } as CSSProperties;
  const checkboxId = scopeCheckboxId(`node:${displayNode.id}`);
  const expanded = expandedNodeIds.has(displayNode.id);
  const rowKey = scopeTreeNodeKey(displayNode);
  const focused = focusedNodeKey === rowKey;
  const selected = selectedCount > 0;

  return (
    <div className="scope-tree-node" role="presentation">
      <div
        id={scopeTreeDomId(rowKey)}
        className={cn("scope-tree-row scope-tree-directory-row", focused && "focused")}
        role="treeitem"
        aria-level={depth + 1}
        aria-expanded={expanded}
        style={indentStyle}
      >
        <Button
          aria-label={expanded ? `收起 ${label}` : `展开 ${label}`}
          className={cn("scope-tree-disclosure", expanded && "expanded")}
          size="icon-xs"
          type="button"
          variant="ghost"
          onClick={() => onToggleExpanded(displayNode.id)}
        >
          <ChevronRight size={12} />
        </Button>
        <span className={cn("scope-tree-icon", selected && "selected")}>
          <FolderOpen size={15} strokeWidth={1.65} />
        </span>
        <span className="scope-tree-label">{label}</span>
        <Badge className="scope-tree-count" variant="secondary">
          {selectedCount}/{endpointCount}
        </Badge>
        <label className="scope-tree-checkbox-target" htmlFor={checkboxId}>
          <Checkbox
            id={checkboxId}
            checked={mixed ? "indeterminate" : checked}
            disabled={endpointCount === 0}
            onCheckedChange={(value) => onToggleNode(displayNode, value === true)}
          />
        </label>
      </div>
      <div className={cn("scope-tree-children", expanded && "expanded")}>
        <div className="scope-tree-children-inner">
          {displayNode.children.map((child) => (
            <ScopeTreeNodeRow
              checkedIds={checkedIds}
              depth={depth + 1}
              expandedNodeIds={expandedNodeIds}
              focusedNodeKey={focusedNodeKey}
              key={child.id}
              node={child}
              onToggleExpanded={onToggleExpanded}
              onToggleEndpoint={onToggleEndpoint}
              onToggleNode={onToggleNode}
            />
          ))}
          {displayNode.endpoints.map((endpoint) => {
            const endpointCheckboxId = scopeCheckboxId(`endpoint:${endpoint.id}`);
            const endpointKey = scopeEndpointKey(endpoint.id);
            const endpointFocused = focusedNodeKey === endpointKey;
            const endpointSelected = checkedIds.has(endpoint.id);
            return (
              <label
                id={scopeTreeDomId(endpointKey)}
                className={cn("scope-tree-row scope-tree-endpoint-row", endpointFocused && "focused")}
                htmlFor={endpointCheckboxId}
                key={endpoint.id}
                role="treeitem"
                aria-level={depth + 2}
                style={{ "--scope-tree-indent": `${(depth + 1) * 18}px` } as CSSProperties}
              >
                <span className={cn("scope-tree-icon endpoint", endpointSelected && "selected")}>
                  <FileJson size={14} strokeWidth={1.6} />
                </span>
                <span className="min-w-0">
                  <span className="scope-tree-endpoint-name">{endpoint.name}</span>
                  <span className="scope-tree-endpoint-path">{endpoint.overridePath}</span>
                </span>
                <Checkbox
                  id={endpointCheckboxId}
                  checked={checkedIds.has(endpoint.id)}
                  onCheckedChange={(value) => onToggleEndpoint(endpoint.id, value === true)}
                />
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ScopeButton({
  active,
  count,
  disabled = false,
  label,
  onClick,
}: { active: boolean; count: number; disabled?: boolean; label: string; onClick(): void }) {
  return (
    <button
      className={cn(
        "grid min-h-14 rounded-[10px] border border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--panel)_78%,var(--panel-2))] px-3 py-2 text-left transition-[background-color,border-color,box-shadow,scale] duration-[140ms] active:scale-[0.98] disabled:cursor-default disabled:opacity-65 disabled:active:scale-100",
        active &&
          "border-[color-mix(in_srgb,var(--accent)_42%,var(--border))] bg-[color-mix(in_srgb,var(--accent-soft)_42%,var(--panel))] shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_10%,transparent)]",
      )}
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      <span className="text-[13px] font-[680] text-[var(--text)]">{label}</span>
      <span className="text-xs tabular-nums text-[var(--muted)]">{count} 个接口</span>
    </button>
  );
}
