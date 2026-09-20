"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A quiet (i) that reveals an explanation on hover/focus — the definition is
 * there when you want it and out of the way when you don't. Used to carry the
 * transactional-vs-marketing definitions next to the meters they explain.
 */
export function InfoHint({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const hintId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = () => { clearTimeout(closeTimer.current); setOpen(true); };
  const scheduleClose = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  const [position, setPosition] = useState({ left: 16, top: 0 });
  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const width = Math.min(256, window.innerWidth - 32);
    const height = tooltip.current?.getBoundingClientRect().height ?? 0;
    const top = rect.bottom + 8 + height <= window.innerHeight - 16 ? rect.bottom + 8 : Math.max(16, rect.top - height - 8);
    setPosition({ left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)), top });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [open]);
  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={show}
      onMouseLeave={scheduleClose}
    >
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? hintId : undefined}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
        onClick={show}
        onFocus={show}
        onBlur={scheduleClose}
        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Info className="size-3.5" />
      </button>
        {open ? createPortal(
          <span
            ref={tooltip}
            onMouseEnter={show}
            onMouseLeave={scheduleClose}
            role="tooltip"
            id={hintId}
            style={position}
            className="fixed z-50 max-h-[calc(100dvh-2rem)] w-64 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border bg-popover p-3 text-sm font-normal leading-relaxed text-popover-foreground shadow-e2"
          >
            {children}
          </span>, document.body,
        ) : null}
    </span>
  );
}
