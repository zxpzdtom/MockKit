import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type DeleteDialogTarget =
  | { type: "endpoint"; endpointId: string; name: string }
  | { type: "case"; caseId: string; endpointId: string; name: string }
  | { type: "bulk"; endpointIds: string[]; count: number }
  | { type: "directory"; path: string; name: string; endpointIds: string[]; count: number };

interface DeleteConfirmDialogProps {
  onConfirm(): void;
  onOpenChange(open: boolean): void;
  target: DeleteDialogTarget | null;
}

function deleteTitle(target: DeleteDialogTarget) {
  if (target.type === "case") return "删除返回场景？";
  if (target.type === "bulk") return "批量删除接口？";
  if (target.type === "directory" && !target.path) return "清空根目录？";
  if (target.type === "directory") return "删除目录？";
  return "删除接口？";
}

function deleteDescription(target: DeleteDialogTarget) {
  if (target.type === "case") return `确定删除返回场景「${target.name}」吗？`;
  if (target.type === "bulk") return `确定删除选中的 ${target.count} 个接口吗？`;
  if (target.type === "directory") {
    if (!target.path) return `确定删除根目录下的 ${target.count} 个接口和所有分组吗？根目录本身会保留。`;
    if (target.count === 0) return `确定删除空目录「${target.name}」吗？`;
    return `确定删除目录「${target.name}」及其中的 ${target.count} 个接口吗？`;
  }
  return `确定删除接口「${target.name}」吗？`;
}

export function DeleteConfirmDialog({ onConfirm, onOpenChange, target }: DeleteConfirmDialogProps) {
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
              <DialogTitle>{deleteTitle(target)}</DialogTitle>
              <DialogDescription className="pt-0.5 text-[14px] leading-6 text-[var(--muted)] [overflow-wrap:anywhere]">
                {deleteDescription(target)}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="pt-1 [&_[data-slot=button]]:h-9 [&_[data-slot=button]]:min-w-[76px] [&_[data-variant=destructive]]:bg-[color-mix(in_srgb,var(--danger)_9%,transparent)] [&_[data-variant=destructive]]:text-[var(--danger)] hover:[&_[data-variant=destructive]]:bg-[var(--danger)] hover:[&_[data-variant=destructive]]:text-white">
              <Button variant="secondary" type="button" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button variant="destructive" type="button" onClick={onConfirm}>
                删除
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
