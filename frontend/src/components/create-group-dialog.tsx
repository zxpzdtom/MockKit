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
import type { AppMessages } from "../i18n";

interface CreateGroupDialogProps {
  cleanGroupPath(path: string): string;
  draft: string;
  messages: AppMessages["createGroup"];
  commonMessages: AppMessages["common"];
  onCreate(): void;
  onDraftChange(value: string): void;
  onOpenChange(open: boolean): void;
  open: boolean;
}

export function CreateGroupDialog({
  cleanGroupPath,
  draft,
  messages,
  commonMessages,
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
            <DialogTitle>{messages.title}</DialogTitle>
            <DialogDescription>{messages.description}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="create-group-path">{messages.label}</Label>
            <Input
              id="create-group-path"
              aria-label={messages.label}
              autoComplete="off"
              autoFocus
              className="h-10 px-3"
              placeholder={messages.placeholder}
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" type="button" onClick={() => onOpenChange(false)}>
              {commonMessages.cancel}
            </Button>
            <Button type="submit" disabled={!cleanGroupPath(draft)}>
              {messages.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
