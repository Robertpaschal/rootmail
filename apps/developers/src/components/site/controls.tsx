"use client";

import { cn } from "@/lib/utils";

/**
 * THE CONTROLS, IN ONE FILE, SO THE RULE IS WRITTEN ONCE.
 *
 * `docs/design/00-PHILOSOPHY.md` §10.2 replaced "saturated colour is reserved
 * for state" with something narrower that survives the same test:
 *
 *   **brass = you can act on this.** Buttons, links, focus.
 *   **witnessed / acted / stopped = what happened to a message or a sender.**
 *   They never appear on a control.
 *
 * The five run buttons on the homepage were `bg-foreground text-background`,
 * which was the old rule showing: under it the only permitted accent was state,
 * so a control had nowhere to go but ink. That made the one thing on the page
 * we most want pressed — "run this against the real sandbox" — look exactly
 * like a table header. They are brass now, and the segmented tabs deliberately
 * are NOT: a selected tab reports which panel you are looking at, which is a
 * state of the page rather than an action, so it keeps the ink fill. That
 * distinction is the whole reason a coloured thing here is still unambiguous.
 */

const base =
  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-[12.5px] transition-[color,background-color,box-shadow,transform] duration-interaction ease-interaction focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none";

/** The one that runs something. Brass, and the only glow on the section. */
export function RunButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        base,
        "bg-primary text-primary-foreground shadow-[0_6px_18px_-8px_hsl(var(--brass)/0.85)]",
        "hover:brightness-[1.07] hover:-translate-y-px active:translate-y-0",
        "disabled:pointer-events-none disabled:opacity-60 motion-reduce:hover:transform-none",
        className,
      )}
    />
  );
}

/** The secondary one — "Change one byte", "Replay". Outlined, no accent. */
export function QuietButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        base,
        "border border-rule text-ink-muted hover:bg-muted hover:text-foreground",
        "disabled:pointer-events-none disabled:opacity-60",
        className,
      )}
    />
  );
}

/**
 * A tab set. Roving tabindex plus arrow keys, which is what `role="tablist"`
 * promises a screen reader and what a keyboard user will try.
 *
 * Used by D1 (language) and D4 (sending identity), and it is a real tab set in
 * both: every panel it switches between is present in the DOM at all times, so
 * nothing here is the only route to a piece of content.
 */
export function Segmented({
  options,
  active,
  onChange,
  label,
  idBase,
  className,
}: {
  options: readonly { id: string; label: string }[];
  active: number;
  onChange: (i: number) => void;
  label: string;
  idBase: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn("flex flex-wrap gap-0.5 rounded-lg bg-muted/60 p-0.5", className)}
    >
      {options.map((o, i) => (
        <button
          key={o.id}
          role="tab"
          id={`${idBase}-tab-${o.id}`}
          aria-selected={i === active}
          aria-controls={`${idBase}-panel-${o.id}`}
          tabIndex={i === active ? 0 : -1}
          type="button"
          onClick={() => onChange(i)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") onChange((active + 1) % options.length);
            if (e.key === "ArrowLeft") onChange((active - 1 + options.length) % options.length);
          }}
          className={cn(
            "rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-interaction ease-interaction motion-reduce:transition-none",
            i === active
              ? "bg-paper-raised text-foreground shadow-e1"
              : "text-ink-muted hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
