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
import { Label } from "@/components/ui/label";

interface CreateGroupDialogProps {
  cleanGroupPath(path: string): string;
  draft: string;
  onCreate(): void;
  onDraftChange(value: string): void;
  onOpenChange(open: boolean): void;
  open: boolean;
}

export function CreateGroupDialog({
  cleanGroupPath,
  draft,
  onCreate,
  onDraftChange,
  onOpenChange,
  open,
}: CreateGroupDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[min(480px,calc(100vw-48px))] bg-[color-mix(in_srgb,var(--panel)_98%,white)]"
        onKeyDown={(event) => {
          if (event.defaultPrevented) return;
          if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey) || event.nativeEvent.isComposing) {
            return;
          }
          event.preventDefault();
          if (cleanGroupPath(draft)) onCreate();
        }}
      >
        <form
          className="grid gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            onCreate();
          }}
        >
          <DialogHeader className="pr-10">
            <DialogTitle>新建业务分组</DialogTitle>
            <DialogDescription>支持多层级目录，例如 用户中心/登录。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="create-group-path">业务分组路径</Label>
            <Input
              id="create-group-path"
              aria-label="业务分组路径"
              autoComplete="off"
              autoFocus
              className="h-10 px-3"
              placeholder="用户中心/登录"
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" type="button" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={!cleanGroupPath(draft)}>
              新建
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
