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
    <div
      className={cn(
        // A code block is a QUOTATION — a window onto something that is not
        // this page — so it carries its own ground rather than a tint of the
        // section's. It was `bg-card`, which on a card-backed section measured
        // 1.00 contrast against its own background: brown on brown, invisible
        // as a panel. Dark in both themes, ringed, and pressed in.
        "overflow-hidden rounded-lg bg-code text-code-fg shadow-well",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-code-ring/40 bg-white/[0.03] px-3 py-2">
        <span className="truncate font-mono text-[12.5px] text-code-fg/60" data-fact>
          {filename}
        </span>
        <button
          type="button"
          onClick={copy}
          className="-my-1 inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[12.5px] text-code-fg/60 transition-colors duration-interaction ease-interaction hover:bg-white/10 hover:text-code-fg"
          aria-label={`Copy ${filename ?? "code"}`}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre
        className="overflow-x-auto px-3 py-3 text-[13.5px] leading-[1.7]"
        style={minLines ? { minHeight: `${minLines * 1.65 + 1.5}em` } : undefined}
      >
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}
