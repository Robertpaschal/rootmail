"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A code sample, drawn as a record rather than as a screenshot of a terminal.
 *
 * What went: the `bg-zinc-950` slab with three fake macOS traffic lights and
 * `shadow-2xl shadow-primary/10`. Three separate problems with it. The colours
 * were hardcoded, so the block ignored the theme and sat as a black hole on a
 * paper ground. The traffic lights are decoration asserting nothing — they are
 * a picture of a window, on a page that is not a window. And the coloured drop
 * shadow was the last surviving indigo on the site.
 *
 * What replaced it obeys the same rule as every other panel here: ground and
 * ink from the tokens, a hairline plus one step of elevation, corners off the
 * radius scale (§10.3 moved `--radius` to 1rem — the old 0.25rem this file used
 * to specify is the exact corner that amendment removed), and the filename in
 * mono because a filename is a recorded value. The copy button is the only
 * interactive thing, and it is the reason this component exists at all.
 */
export function CodeBlock({
  code,
  filename,
  className,
  /** Locks the height so a language switch above it cannot move the page. */
  minLines,
}: {
  code: string;
  filename?: string;
  className?: string;
  minLines?: number;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

  return (
    <div className={cn("overflow-hidden rounded-lg border border-rule bg-card shadow-e1", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-rule bg-muted/40 px-3 py-2">
        <span className="truncate font-mono text-[11px] text-ink-muted" data-fact>
          {filename}
        </span>
        <button
          type="button"
          onClick={copy}
          className="-my-1 inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11px] text-ink-muted transition-colors duration-interaction ease-interaction hover:bg-muted hover:text-foreground"
          aria-label={`Copy ${filename ?? "code"}`}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre
        className="overflow-x-auto px-3 py-3 text-[12.5px] leading-[1.65]"
        style={minLines ? { minHeight: `${minLines * 1.65 + 1.5}em` } : undefined}
      >
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}
