"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface TooltipProps {
  content: React.ReactNode;
  className?: string;
  wide?: boolean;
}

export function Tooltip({ content, className, wide }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-muted-foreground text-muted-foreground text-[10px] leading-none hover:border-foreground hover:text-foreground transition-colors"
        aria-label="More information"
      >
        i
      </button>
      {open && (
        <div
          className={cn(
            "absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50",
            "rounded-md border border-border bg-popover text-popover-foreground shadow-xl",
            "px-3 py-2.5 text-xs leading-relaxed",
            wide ? "w-80" : "w-64"
          )}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="float-right ml-2 -mt-0.5 -mr-1 text-muted-foreground hover:text-foreground text-xs"
            aria-label="Close"
          >
            ✕
          </button>
          {content}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-border" />
        </div>
      )}
    </div>
  );
}
