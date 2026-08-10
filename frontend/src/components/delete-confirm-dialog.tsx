import { Button } from "@/components/ui/button";
import { FileJson, FolderClosed, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AppMessages } from "../i18n";

export type DeleteDialogTarget =
  | { type: "endpoint"; endpointId: string; name: string }
  | { type: "case"; caseId: string; endpointId: string; name: string }
  | { type: "bulk"; endpointIds: string[]; endpointNames: string[]; count: number }
  | {
      type: "directory";
      path: string;
      name: string;
      endpointIds: string[];
      endpointNames: string[];
      count: number;
    }
  | {
      type: "directories";
      paths: string[];
      directoryNames: string[];
      endpointIds: string[];
      endpointNames: string[];
      directoryCount: number;
      endpointCount: number;
    };

interface DeleteConfirmDialogProps {
  onConfirm(): void;
  onOpenChange(open: boolean): void;
  messages: AppMessages["deleteConfirm"];
  commonMessages: AppMessages["common"];
  target: DeleteDialogTarget | null;
}

function deleteTitle(target: DeleteDialogTarget, messages: AppMessages["deleteConfirm"]) {
  if (target.type === "case") return messages.caseTitle;
  if (target.type === "bulk") return messages.bulkTitle;
  if (target.type === "directories") return messages.directoriesTitle;
  if (target.type === "directory" && !target.path) return messages.clearRootTitle;
  if (target.type === "directory") return messages.directoryTitle;
  return messages.endpointTitle;
}

function deleteDescription(target: DeleteDialogTarget, messages: AppMessages["deleteConfirm"]) {
  if (target.type === "case") return messages.caseDescription(target.name);
  if (target.type === "bulk") return messages.bulkDescription(target.count);
  if (target.type === "directories") {
    return messages.directoriesDescription(target.directoryCount, target.endpointCount);
  }
  if (target.type === "directory") {
    if (!target.path) return messages.clearRootDescription(target.count);
    if (target.count === 0) return messages.emptyDirectoryDescription(target.name);
    return messages.directoryDescription(target.name, target.count);
  }
  return messages.endpointDescription(target.name);
}

function affectedItemNames(target: DeleteDialogTarget) {
  if (target.type === "directories") return target.directoryNames;
  if (target.type !== "bulk" && target.type !== "directory") return [];
  return target.endpointNames;
}

export function DeleteConfirmDialog({
  onConfirm,
  onOpenChange,
  messages,
  commonMessages,
  target,
}: DeleteConfirmDialogProps) {
  const affectedNames = target ? affectedItemNames(target) : [];
  const listingDirectories = target?.type === "directories";

  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => !open && onOpenChange(false)}>
      <DialogContent
        className="w-[min(420px,calc(100vw-40px))] gap-0 overflow-hidden bg-[color-mix(in_srgb,var(--panel)_98%,white)] p-0 sm:max-w-[420px]"
        showCloseButton={false}
        onKeyDown={(event) => {
          if (!target || event.key !== "Enter" || event.nativeEvent.isComposing) return;
          event.preventDefault();
          onConfirm();
        }}
      >
        {target ? (
          <>
            <div className="px-5 pb-5 pt-5">
              <DialogHeader className="gap-0">
                <div className="flex items-center gap-2.5">
                  <div className="grid size-7 shrink-0 place-items-center rounded-[8px] bg-[color-mix(in_srgb,var(--danger)_9%,transparent)] text-[var(--danger)]">
                    <Trash2 size={14} strokeWidth={1.8} />
                  </div>
                  <DialogTitle className="min-w-0 flex-1 text-[16px] leading-5">
                    {deleteTitle(target, messages)}
                  </DialogTitle>
                </div>
                <DialogDescription asChild>
                  <div className="mt-2 text-[13px] leading-5 text-[var(--muted)] [overflow-wrap:anywhere]">
                    <p>{deleteDescription(target, messages)}</p>
                    <p className="mt-1 text-[12px] text-[color-mix(in_srgb,var(--muted)_82%,var(--danger))]">
                      {messages.irreversible}
                    </p>
                  </div>
                </DialogDescription>
              </DialogHeader>

              {affectedNames.length > 0 ? (
                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between px-0.5 text-[11px] font-medium text-[var(--muted)]">
                    <span>{listingDirectories ? messages.directoryList : messages.endpointList}</span>
                    <span className="tabular-nums">{affectedNames.length}</span>
                  </div>
                  <div className="max-h-[164px] overflow-y-auto rounded-[9px] border border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--panel-2)_72%,transparent)]">
                    <ul className="divide-y divide-[var(--border-soft)]">
                      {affectedNames.slice(0, 50).map((name) => (
                        <li
                          className="flex min-h-8 items-center gap-2 px-2.5 py-1.5 text-[12px] leading-5 text-[color-mix(in_srgb,var(--text)_82%,var(--muted))]"
                          key={name}
                          title={name}
                        >
                          <span className="grid size-5 shrink-0 place-items-center text-[var(--muted)]">
                            {listingDirectories ? (
                              <FolderClosed size={13} strokeWidth={1.6} />
                            ) : (
                              <FileJson size={13} strokeWidth={1.6} />
                            )}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{name}</span>
                        </li>
                      ))}
                    </ul>
                    {affectedNames.length > 50 ? (
                      <p className="border-t border-[var(--border-soft)] px-3 py-1.5 text-[11px] tabular-nums text-[var(--muted)]">
                        {messages.moreItems(affectedNames.length - 50)}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <DialogFooter className="border-t border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--panel-2)_46%,transparent)] px-5 py-3 [&_[data-slot=button]]:h-8 [&_[data-slot=button]]:min-w-[72px]">
              <Button variant="secondary" type="button" onClick={() => onOpenChange(false)}>
                {commonMessages.cancel}
              </Button>
              <Button
                className="bg-[var(--danger)] text-white hover:bg-[color-mix(in_srgb,var(--danger)_88%,black)]"
                variant="destructive"
                type="button"
                onClick={onConfirm}
              >
                {commonMessages.delete}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
