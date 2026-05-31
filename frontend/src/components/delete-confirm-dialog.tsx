import { Button } from "@/components/ui/button";
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
  | { type: "bulk"; endpointIds: string[]; count: number }
  | { type: "directory"; path: string; name: string; endpointIds: string[]; count: number };

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
  if (target.type === "directory" && !target.path) return messages.clearRootTitle;
  if (target.type === "directory") return messages.directoryTitle;
  return messages.endpointTitle;
}

function deleteDescription(target: DeleteDialogTarget, messages: AppMessages["deleteConfirm"]) {
  if (target.type === "case") return messages.caseDescription(target.name);
  if (target.type === "bulk") return messages.bulkDescription(target.count);
  if (target.type === "directory") {
    if (!target.path) return messages.clearRootDescription(target.count);
    if (target.count === 0) return messages.emptyDirectoryDescription(target.name);
    return messages.directoryDescription(target.name, target.count);
  }
  return messages.endpointDescription(target.name);
}

export function DeleteConfirmDialog({
  onConfirm,
  onOpenChange,
  messages,
  commonMessages,
  target,
}: DeleteConfirmDialogProps) {
  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => !open && onOpenChange(false)}>
      <DialogContent
        className="w-[min(460px,calc(100vw-48px))] gap-5 bg-[color-mix(in_srgb,var(--panel)_98%,white)] sm:max-w-[460px]"
        onKeyDown={(event) => {
          if (!target || event.key !== "Enter" || event.nativeEvent.isComposing) return;
          event.preventDefault();
          onConfirm();
        }}
      >
        {target ? (
          <>
            <DialogHeader className="pr-10">
              <DialogTitle>{deleteTitle(target, messages)}</DialogTitle>
              <DialogDescription className="pt-0.5 text-[14px] leading-6 text-[var(--muted)] [overflow-wrap:anywhere]">
                {deleteDescription(target, messages)}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="pt-1 [&_[data-slot=button]]:h-9 [&_[data-slot=button]]:min-w-[76px] [&_[data-variant=destructive]]:bg-[color-mix(in_srgb,var(--danger)_9%,transparent)] [&_[data-variant=destructive]]:text-[var(--danger)] hover:[&_[data-variant=destructive]]:bg-[var(--danger)] hover:[&_[data-variant=destructive]]:text-white">
              <Button variant="secondary" type="button" onClick={() => onOpenChange(false)}>
                {commonMessages.cancel}
              </Button>
              <Button variant="destructive" type="button" onClick={onConfirm}>
                {commonMessages.delete}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
