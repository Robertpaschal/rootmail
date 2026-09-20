"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** One persistent native-CSS slider. Labels and pressed state never wait for it. */
export function SegmentedControl<T extends string>({ options, value, onChange, label, className }: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const layoutKey = options.map((option) => `${option.value}:${option.label}`).join("|");
  const [rect, setRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () => {
      const selected = element.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
      if (!selected) return;
      setRect({ x: selected.offsetLeft, y: selected.offsetTop, width: selected.offsetWidth, height: selected.offsetHeight });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [value, layoutKey]);
  return <div ref={root} role="group" aria-label={label} className={cn("relative isolate flex flex-wrap gap-1 rounded-xl bg-secondary p-1", className)}>
    {rect ? <span aria-hidden="true" className="ui-segment-slider pointer-events-none absolute left-0 top-0 rounded-lg bg-card shadow-e1" style={{ width: rect.width, height: rect.height, transform: `translate(${rect.x}px, ${rect.y}px)` }} /> : null}
    {options.map((option) => <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)} className={cn("ui-button relative z-10 min-h-11 flex-1 whitespace-nowrap rounded-lg px-2 text-sm", value === option.value ? "font-semibold text-foreground" : "font-medium text-muted-foreground hover:text-foreground")}>{option.label}</button>)}
  </div>;
}
