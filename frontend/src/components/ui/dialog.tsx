"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import type * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { XIcon } from "lucide-react";

const dialogCloseButtonClass =
  "size-8 rounded-lg border border-transparent bg-transparent text-[var(--muted)] shadow-none transition-[background-color,border-color,box-shadow,color,transform] duration-150 hover:border-[var(--border-soft)] hover:bg-[color-mix(in_srgb,var(--panel-3)_64%,transparent)] hover:text-[var(--text)] hover:shadow-none focus-visible:border-[color-mix(in_srgb,var(--accent)_36%,var(--border))] focus-visible:ring-3 focus-visible:ring-[color-mix(in_srgb,var(--accent)_14%,transparent)] active:translate-y-px";

function isToastGuardEvent(event: Event) {
  const eventWithDetail = event as Event & { detail?: { originalEvent?: Event } };
  const target = eventWithDetail.detail?.originalEvent?.target ?? event.target;
  return (
    target instanceof Element &&
    Boolean(target.closest("[data-mockkit-toast-guard], .mockkit-error-toast"))
  );
}

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/20 duration-100 backdrop-blur-[2px] data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  onInteractOutside,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border border-[var(--border-soft)] bg-[var(--panel)] p-6 text-sm text-[var(--text)] shadow-[var(--elevated-shadow)] duration-100 outline-none sm:max-w-lg data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className,
        )}
        onInteractOutside={(event) => {
          if (isToastGuardEvent(event)) {
            event.preventDefault();
          }
          onInteractOutside?.(event);
        }}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button
              variant="ghost"
              className={cn("absolute top-4 right-4", dialogCloseButtonClass)}
              size="icon-sm"
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end [&_[data-slot=button]]:h-9 [&_[data-slot=button]]:px-4",
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("font-heading text-lg leading-none font-semibold tracking-tight", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  dialogCloseButtonClass,
};
