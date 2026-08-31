"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * D7's install line. One command, one copy button.
 *
 * What it replaces: a `rounded-2xl border bg-card p-8 text-center` pricing card
 * with a 38-word paragraph about blocks of 25,000 sends. The close on a
 * developer site is not a pricing pitch, it is the first thing they type.
 *
 * The button is the only interactive element and it fails quietly: when the
 * clipboard is unavailable the command is still on screen, selectable, in mono.
 */
export function CopyLine({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex w-full max-w-md items-center gap-3 rounded-lg border border-rule bg-card px-3 py-2.5 shadow-e1">
      <code className="min-w-0 flex-1 truncate font-mono text-[13px]" data-fact>
        {command}
      </code>
      <button
        type="button"
        aria-label={`Copy ${command}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(command);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard unavailable — the command is still on screen */
          }
        }}
        className="-my-1 inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[12.5px] text-ink-muted transition-colors duration-interaction ease-interaction hover:bg-muted hover:text-foreground"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}
