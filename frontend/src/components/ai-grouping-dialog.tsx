import { Badge } from "@/components/ui/badge";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ChevronDown, FileJson, GripVertical } from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import type { AiGroupingPreview, Endpoint } from "../types";

const rootId = "__root__";

interface EditableGroup {
  id: string;
  label: string;
  parentId: string | null;
  children: string[];
  endpointIds: string[];
}

interface GroupingTree {
  groups: Record<string, EditableGroup>;
}

type DragItem = { type: "endpoint"; endpointId: string } | { type: "group"; groupId: string };

type DropTarget =
  | { type: "group-into"; groupId: string }
  | { type: "group-before"; groupId: string }
  | { type: "endpoint-before"; endpointId: string }
  | { type: "group-end"; groupId: string };

interface AiGroupingDialogProps {
  endpoints: Endpoint[];
  onApply(assignments: Array<{ endpointId: string; groupPath: string }>): void;
  onOpenChange(open: boolean): void;
  open: boolean;
  preview: AiGroupingPreview | null;
}

function cleanGroupPath(path: string) {
  return path
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/");
}

function groupPath(tree: GroupingTree, groupId: string) {
  if (groupId === rootId) return "";
  const labels: string[] = [];
  let current: EditableGroup | undefined = tree.groups[groupId];
  while (current && current.id !== rootId) {
    labels.unshift(current.label);
    current = current.parentId ? tree.groups[current.parentId] : undefined;
  }
  return cleanGroupPath(labels.join("/"));
}

function createGroupId(path: string) {
  return path || rootId;
}

function buildTree(endpoints: Endpoint[], preview: AiGroupingPreview | null): GroupingTree {
  const groups: Record<string, EditableGroup> = {
    [rootId]: { id: rootId, label: "建议分组", parentId: null, children: [], endpointIds: [] },
  };
  const assignmentMap = new Map(
    (preview?.groups ?? []).map((item) => [item.endpointId, cleanGroupPath(item.groupPath)]),
  );

  const ensureGroup = (path: string) => {
    const parts = cleanGroupPath(path).split("/").filter(Boolean);
    let parentId = rootId;
    let currentPath = "";
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const id = createGroupId(currentPath);
      if (!groups[id]) {
        groups[id] = { id, label: part, parentId, children: [], endpointIds: [] };
        groups[parentId]?.children.push(id);
      }
      parentId = id;
    }
    return parentId;
  };

  for (const endpoint of endpoints) {
    const targetGroup = assignmentMap.get(endpoint.id) ?? cleanGroupPath(endpoint.groupPath ?? "");
    const groupId = targetGroup ? ensureGroup(targetGroup) : rootId;
    groups[groupId]?.endpointIds.push(endpoint.id);
  }

  return { groups };
}

function removeFromParent(tree: GroupingTree, groupId: string) {
  const group = tree.groups[groupId];
  const parent = group?.parentId ? tree.groups[group.parentId] : null;
  if (!parent) return;
  parent.children = parent.children.filter((id) => id !== groupId);
}

function removeEndpoint(tree: GroupingTree, endpointId: string) {
  for (const group of Object.values(tree.groups)) {
    group.endpointIds = group.endpointIds.filter((id) => id !== endpointId);
  }
}

function endpointParentGroupId(tree: GroupingTree, endpointId: string) {
  return Object.values(tree.groups).find((group) => group.endpointIds.includes(endpointId))?.id ?? rootId;
}

function isGroupInside(tree: GroupingTree, groupId: string, parentId: string) {
  let current = tree.groups[groupId];
  while (current?.parentId) {
    if (current.parentId === parentId) return true;
    current = tree.groups[current.parentId];
  }
  return false;
}

function collectEndpointAssignments(tree: GroupingTree) {
  const assignments: Array<{ endpointId: string; groupPath: string }> = [];
  for (const group of Object.values(tree.groups)) {
    for (const endpointId of group.endpointIds) {
      assignments.push({ endpointId, groupPath: group.id === rootId ? "" : groupPath(tree, group.id) });
    }
  }
  return assignments;
}

function countGroupEndpoints(tree: GroupingTree, groupId: string): number {
  const group = tree.groups[groupId];
  if (!group) return 0;
  return (
    group.endpointIds.length +
    group.children.reduce((count, childId) => count + countGroupEndpoints(tree, childId), 0)
  );
}

function isSameDropTarget(left: DropTarget | null, right: DropTarget | null) {
  if (!left || !right || left.type !== right.type) return false;
  if ("groupId" in left && "groupId" in right) return left.groupId === right.groupId;
  if ("endpointId" in left && "endpointId" in right) return left.endpointId === right.endpointId;
  return false;
}

function canUseDropTarget(item: DragItem | null, target: DropTarget) {
  if (!item) return false;
  if (item.type === "endpoint") return target.type !== "group-before";
  return target.type !== "endpoint-before";
}

function depthStyle(depth: number) {
  return { "--ai-group-depth": depth } as CSSProperties;
}

function createDragPreview(title: string, detail: string, type: DragItem["type"]) {
  const preview = document.createElement("div");
  preview.className = cn("ai-drag-preview-card", type === "group" && "group-preview");

  const icon = document.createElement("span");
  icon.className = "ai-drag-preview-icon";
  icon.textContent = type === "group" ? title.slice(0, 1).toUpperCase() : "{}";

  const content = document.createElement("span");
  content.className = "ai-drag-preview-content";

  const name = document.createElement("span");
  name.className = "ai-drag-preview-title";
  name.textContent = title;

  const meta = document.createElement("span");
  meta.className = "ai-drag-preview-detail";
  meta.textContent = detail;

  content.append(name, meta);
  preview.append(icon, content);
  document.body.appendChild(preview);
  return preview;
}

export function AiGroupingDialog({ endpoints, onApply, onOpenChange, open, preview }: AiGroupingDialogProps) {
  const [tree, setTree] = useState<GroupingTree>(() => buildTree(endpoints, preview));
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(() => new Set());
  const endpointMap = useMemo(
    () => new Map(endpoints.map((endpoint) => [endpoint.id, endpoint])),
    [endpoints],
  );
  const groupCount = Math.max(Object.keys(tree.groups).length - 1, 0);
  const plannedCount = countGroupEndpoints(tree, rootId);

  useEffect(() => {
    if (!open) return;
    setTree(buildTree(endpoints, preview));
    setDragItem(null);
    setDropTarget(null);
    setCollapsedGroupIds(new Set());
  }, [endpoints, open, preview]);

  const setNextDropTarget = (target: DropTarget | null) => {
    setDropTarget((current) => (isSameDropTarget(current, target) ? current : target));
  };

  const toggleCollapsedGroup = (groupId: string) => {
    setCollapsedGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const renameGroup = (groupId: string, label: string) => {
    if (groupId === rootId) return;
    setTree((current) => {
      const next = structuredClone(current);
      if (next.groups[groupId]) next.groups[groupId].label = label;
      return next;
    });
  };

  const normalizeGroupName = (groupId: string) => {
    if (groupId === rootId) return;
    setTree((current) => {
      const next = structuredClone(current);
      const group = next.groups[groupId];
      if (!group) return current;
      group.label = group.label.trim() || "未命名分组";
      return next;
    });
  };

  const moveEndpointToGroup = (endpointId: string, groupId: string) => {
    setTree((current) => {
      const next = structuredClone(current);
      removeEndpoint(next, endpointId);
      next.groups[groupId]?.endpointIds.push(endpointId);
      return next;
    });
  };

  const moveEndpointBeforeEndpoint = (endpointId: string, targetEndpointId: string) => {
    if (endpointId === targetEndpointId) return;
    setTree((current) => {
      const next = structuredClone(current);
      const targetGroupId = endpointParentGroupId(next, targetEndpointId);
      removeEndpoint(next, endpointId);
      const siblings = next.groups[targetGroupId]?.endpointIds ?? [];
      const targetIndex = siblings.indexOf(targetEndpointId);
      siblings.splice(targetIndex >= 0 ? targetIndex : siblings.length, 0, endpointId);
      return next;
    });
  };

  const moveGroupToGroup = (groupId: string, targetGroupId: string) => {
    if (groupId === rootId || groupId === targetGroupId || isGroupInside(tree, targetGroupId, groupId))
      return;
    setTree((current) => {
      const next = structuredClone(current);
      removeFromParent(next, groupId);
      next.groups[groupId].parentId = targetGroupId;
      next.groups[targetGroupId]?.children.push(groupId);
      return next;
    });
  };

  const moveGroupBeforeGroup = (groupId: string, targetGroupId: string) => {
    if (groupId === rootId || groupId === targetGroupId || isGroupInside(tree, targetGroupId, groupId))
      return;
    setTree((current) => {
      const next = structuredClone(current);
      const targetGroup = next.groups[targetGroupId];
      const targetParentId = targetGroup?.parentId ?? rootId;
      removeFromParent(next, groupId);
      next.groups[groupId].parentId = targetParentId;
      const siblings = next.groups[targetParentId]?.children ?? [];
      const targetIndex = siblings.indexOf(targetGroupId);
      siblings.splice(targetIndex >= 0 ? targetIndex : siblings.length, 0, groupId);
      return next;
    });
  };

  const deleteGroup = (groupId: string) => {
    if (groupId === rootId) return;
    setTree((current) => {
      const next = structuredClone(current);
      const endpointIds: string[] = [];
      const visit = (id: string) => {
        const group = next.groups[id];
        if (!group) return;
        endpointIds.push(...group.endpointIds);
        for (const childId of group.children) visit(childId);
      };
      visit(groupId);
      removeFromParent(next, groupId);
      const remove = (id: string) => {
        for (const childId of next.groups[id]?.children ?? []) remove(childId);
        delete next.groups[id];
      };
      remove(groupId);
      next.groups[rootId].endpointIds.push(...endpointIds);
      return next;
    });
  };

  const applyDropTarget = (target = dropTarget) => {
    if (!dragItem || !target || !canUseDropTarget(dragItem, target)) return;
    if (dragItem.type === "endpoint") {
      if (target.type === "endpoint-before")
        moveEndpointBeforeEndpoint(dragItem.endpointId, target.endpointId);
      if (target.type === "group-into" || target.type === "group-end") {
        moveEndpointToGroup(dragItem.endpointId, target.groupId);
      }
    } else {
      if (target.type === "group-before") moveGroupBeforeGroup(dragItem.groupId, target.groupId);
      if (target.type === "group-into" || target.type === "group-end") {
        moveGroupToGroup(dragItem.groupId, target.groupId);
      }
    }
    setDropTarget(null);
    setDragItem(null);
  };

  const renderDropPlaceholder = (target: DropTarget, depth: number, label = "拖到这里") => {
    if (!isSameDropTarget(dropTarget, target) || !canUseDropTarget(dragItem, target)) return null;
    const draggedKind = dragItem?.type ?? "endpoint";
    return (
      <div
        className={cn(
          "ai-drop-placeholder",
          target.type === "group-into" && "into",
          draggedKind === "group" ? "group-placeholder" : "endpoint-placeholder",
        )}
        aria-label={label}
        role="presentation"
        style={depthStyle(depth)}
        onDragOver={(event) => {
          if (!dragItem) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setNextDropTarget(target);
        }}
        onDrop={(event) => {
          event.preventDefault();
          applyDropTarget(target);
        }}
      >
        <span className="ai-drop-placeholder-icon" />
        <span className="ai-drop-placeholder-copy">
          <span className="ai-drop-placeholder-label">{label}</span>
          <span className="ai-drop-placeholder-line wide" />
        </span>
      </div>
    );
  };

  const renderGroup = (groupId: string, depth = 0) => {
    const group = tree.groups[groupId];
    if (!group) return null;
    const isRoot = groupId === rootId;
    const totalCount = countGroupEndpoints(tree, groupId);
    const isCollapsed = collapsedGroupIds.has(groupId);

    if (isRoot) {
      return (
        <div className="ai-group-node root" key={groupId}>
          <div className="ai-group-children">
            {group.children.map((childId) => renderGroup(childId, 0))}
            {group.endpointIds.length > 0 ? (
              <div className="ai-ungrouped-section">
                <div className="ai-ungrouped-title">未分组</div>
                {group.endpointIds.map((endpointId) => {
                  const endpoint = endpointMap.get(endpointId);
                  if (!endpoint) return null;
                  return (
                    <div className="ai-endpoint-row ungrouped" key={endpointId} style={depthStyle(0)}>
                      <FileJson className="ai-endpoint-icon" size={14} strokeWidth={1.65} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-[620] text-[var(--text)]">
                          {endpoint.name}
                        </div>
                        <div className="truncate text-xs text-[var(--muted)]">
                          {endpoint.method} · {endpoint.overridePath}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
            {dragItem ? (
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setNextDropTarget({ type: "group-end", groupId });
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  applyDropTarget({ type: "group-end", groupId });
                }}
              >
                {renderDropPlaceholder({ type: "group-end", groupId }, 0, "移到计划末尾")}
              </div>
            ) : null}
          </div>
        </div>
      );
    }

    const isIntoTarget = isSameDropTarget(dropTarget, { type: "group-into", groupId });

    return (
      <div className="ai-group-node" key={groupId} style={depthStyle(depth)}>
        <div>
          {renderDropPlaceholder({ type: "group-before", groupId }, depth, "移动分组到这里")}
          <div
            className={cn(
              "ai-group-row",
              dragItem && "is-drag-ready",
              isIntoTarget && "is-drop-target",
              dragItem?.type === "group" && dragItem.groupId === groupId && "dragging",
            )}
            style={depthStyle(depth)}
            onDragEnd={() => {
              setDragItem(null);
              setDropTarget(null);
            }}
            onDragOver={(event) => {
              if (!dragItem) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              const rect = event.currentTarget.getBoundingClientRect();
              const isUpperHalf = event.clientY < rect.top + rect.height * 0.42;
              if (dragItem.type === "group" && !isRoot && isUpperHalf) {
                setNextDropTarget({ type: "group-before", groupId });
              } else {
                setNextDropTarget({ type: "group-into", groupId });
              }
            }}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              setDragItem({ type: "group", groupId });
              const preview = createDragPreview(group.label, `${totalCount} 个接口`, "group");
              event.dataTransfer.setDragImage(preview, 24, 24);
              window.setTimeout(() => preview.remove(), 0);
            }}
            onDrop={(event) => {
              event.preventDefault();
              const rect = event.currentTarget.getBoundingClientRect();
              const isUpperHalf = event.clientY < rect.top + rect.height * 0.42;
              applyDropTarget(
                dragItem?.type === "group" && !isRoot && isUpperHalf
                  ? { type: "group-before", groupId }
                  : { type: "group-into", groupId },
              );
            }}
          >
            <span
              className="ai-group-grip"
              aria-hidden="true"
              draggable
              onDragStart={(event) => {
                event.stopPropagation();
                event.dataTransfer.effectAllowed = "move";
                setDragItem({ type: "group", groupId });
                const preview = createDragPreview(group.label, `${totalCount} 个接口`, "group");
                event.dataTransfer.setDragImage(preview, 24, 24);
                window.setTimeout(() => preview.remove(), 0);
              }}
            >
              <GripVertical size={13} />
            </span>
            <span className="ai-group-color-dot" aria-hidden="true" />
            <Input
              aria-label="分组名称"
              className="ai-group-name-input"
              value={group.label}
              onBlur={() => normalizeGroupName(groupId)}
              onChange={(event) => renameGroup(groupId, event.target.value)}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") event.currentTarget.blur();
              }}
            />
            <Badge className="ai-group-count" variant="secondary">
              {totalCount}
            </Badge>
            <Button
              aria-label={isCollapsed ? "展开分组" : "收起分组"}
              aria-expanded={!isCollapsed}
              className={cn("ai-group-collapse", isCollapsed && "collapsed")}
              size="icon-xs"
              type="button"
              variant="ghost"
              onClick={() => toggleCollapsedGroup(groupId)}
            >
              <ChevronDown size={15} strokeWidth={1.8} />
            </Button>
            <Button
              className="ai-group-cancel"
              type="button"
              variant="ghost"
              onClick={() => deleteGroup(groupId)}
            >
              取消
            </Button>
          </div>
        </div>
        <div
          className={cn(
            "ai-group-children",
            isCollapsed && !isSameDropTarget(dropTarget, { type: "group-into", groupId }) && "collapsed",
          )}
        >
          {renderDropPlaceholder(
            { type: "group-into", groupId },
            depth + 1,
            dragItem?.type === "group"
              ? `作为「${group.label || "未命名分组"}」的子分组`
              : `拖入「${group.label || "未命名分组"}」`,
          )}
          {!isCollapsed ? group.children.map((childId) => renderGroup(childId, depth + 1)) : null}
          {!isCollapsed
            ? group.endpointIds.map((endpointId) => {
                const endpoint = endpointMap.get(endpointId);
                if (!endpoint) return null;
                return (
                  <div className="ai-endpoint-node" key={endpointId} style={depthStyle(depth + 1)}>
                    {renderDropPlaceholder(
                      { type: "endpoint-before", endpointId },
                      depth + 1,
                      "移动接口到这里",
                    )}
                    <div
                      className={cn(
                        "ai-endpoint-row",
                        dragItem?.type === "endpoint" && "is-drag-ready",
                        dragItem?.type === "endpoint" && dragItem.endpointId === endpointId && "dragging",
                      )}
                      draggable
                      onDragEnd={() => {
                        setDragItem(null);
                        setDropTarget(null);
                      }}
                      onDragOver={(event) => {
                        if (dragItem?.type !== "endpoint") return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        setNextDropTarget({ type: "endpoint-before", endpointId });
                      }}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        setDragItem({ type: "endpoint", endpointId });
                        const preview = createDragPreview(
                          endpoint.name,
                          `${endpoint.method} · ${endpoint.overridePath}`,
                          "endpoint",
                        );
                        event.dataTransfer.setDragImage(preview, 24, 24);
                        window.setTimeout(() => preview.remove(), 0);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        applyDropTarget({ type: "endpoint-before", endpointId });
                      }}
                    >
                      <span className="ai-group-grip" aria-hidden="true">
                        <GripVertical size={13} />
                      </span>
                      <FileJson className="ai-endpoint-icon" size={14} strokeWidth={1.65} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-[620] text-[var(--text)]">
                          {endpoint.name}
                        </div>
                        <div className="truncate text-xs text-[var(--muted)]">
                          {endpoint.method} · {endpoint.overridePath}
                        </div>
                      </div>
                      <Button
                        className="ai-endpoint-cancel"
                        type="button"
                        variant="ghost"
                        onClick={() => moveEndpointToGroup(endpointId, rootId)}
                      >
                        取消
                      </Button>
                    </div>
                  </div>
                );
              })
            : null}
          {dragItem && !isCollapsed ? (
            <div
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setNextDropTarget({ type: "group-end", groupId });
              }}
              onDrop={(event) => {
                event.preventDefault();
                applyDropTarget({ type: "group-end", groupId });
              }}
            >
              {renderDropPlaceholder({ type: "group-end", groupId }, depth + 1, "移动到末尾")}
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[min(760px,calc(100vh-48px))] w-[min(840px,calc(100vw-56px))] max-w-none grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-[color-mix(in_srgb,var(--panel)_98%,white)] sm:max-w-[min(840px,calc(100vw-56px))]">
        <DialogHeader className="pr-10">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <DialogTitle>AI 分组计划</DialogTitle>
            <Badge className="ai-grouping-summary-badge" variant="secondary">
              计划内共 {plannedCount} 个接口
            </Badge>
          </div>
          <DialogDescription>
            AI 已从 {endpoints.length} 个接口建议 {groupCount} 个分组
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="ai-grouping-tree min-h-[420px] overflow-auto">
          <div className="ai-grouping-tree-content">{renderGroup(rootId)}</div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="secondary" type="button" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={() => onApply(collectEndpointAssignments(tree))}>
            应用分组
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
