import { ScrollArea as ScrollAreaPrimitive } from "radix-ui";
import type * as React from "react";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

function ScrollArea({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const viewport = viewportRef.current;
    if (!root || !viewport) return;

    const updateScrollMaskState = () => {
      const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      root.dataset.scrollTop = viewport.scrollTop > 1 ? "true" : "";
      root.dataset.scrollBottom = viewport.scrollTop < maxScrollTop - 1 ? "true" : "";
    };

    updateScrollMaskState();
    const frame = window.requestAnimationFrame(updateScrollMaskState);
    const resizeObserver = new ResizeObserver(updateScrollMaskState);
    resizeObserver.observe(viewport);
    if (viewport.firstElementChild) resizeObserver.observe(viewport.firstElementChild);

    viewport.addEventListener("scroll", updateScrollMaskState, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      viewport.removeEventListener("scroll", updateScrollMaskState);
    };
  });

  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn(className, "relative overflow-hidden")}
      ref={rootRef}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className="size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1"
        ref={viewportRef}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "flex touch-none p-px opacity-55 transition-[opacity,background-color] select-none hover:opacity-100 data-horizontal:h-1.5 data-horizontal:flex-col data-vertical:h-full data-vertical:w-1.5",
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-[color-mix(in_srgb,var(--muted)_42%,transparent)] transition-colors hover:bg-[color-mix(in_srgb,var(--muted)_68%,transparent)]"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
}

export { ScrollArea, ScrollBar };
