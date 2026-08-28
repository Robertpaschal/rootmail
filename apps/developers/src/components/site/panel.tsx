import { cn } from "@/lib/utils";

/**
 * A PANEL IS A RECORD — AND RECORDS ARE ALLOWED TO HAVE DEPTH.
 *
 * The whole surface vocabulary of the six artifacts in one file, so they
 * cannot each invent their own.
 *
 * WHAT THIS FILE USED TO SAY, AND WHY IT NO LONGER SAYS IT.
 * It opened "a panel is a record, so it has corners", pinned the radius at
 * `0.25rem`, and banned drop shadows in favour of a hairline ring. Both of
 * those are rules `docs/design/00-PHILOSOPHY.md` §10 explicitly withdrew: §10.3
 * moves `--radius` to `1rem` with a real scale, and §10.4 makes depth a token
 * (`--elev-1/2/3`) because §9.5's blanket ban is a third of what produced "flat
 * and boring and square". The comment survived the token change, which is the
 * more dangerous half of a stale comment — it was still instructing the next
 * person to undo the correction.
 *
 * What survives from the old text is the part that was actually an insight,
 * and §10.4 keeps it too: a 1px ring often beats a soft drop. So a panel is a
 * hairline AND one step of elevation (`e1`) — enough to sit on the slab rather
 * than be printed on it, not enough to float.
 *
 * The head stays mono. A panel head names a route, a status, a language or a
 * filename, and §10.1 narrowed mono to exactly that: ids, timestamps and
 * sourcing lines. This is the one place the old rule and the new one agree.
 *
 * (`SectionHead` used to live here and is gone: the homepage now composes each
 * section head differently on purpose — a sticky rail, a baseline row, a bare
 * `display-l`, a mono line — and a shared "title + lead" component is what made
 * seven sections look like one section seven times.)
 */
export function Panel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-lg border border-rule bg-card shadow-e1", className)}>
      {children}
    </div>
  );
}

export function PanelHead({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-rule px-3 py-2 font-mono text-[11px] text-ink-muted",
        className,
      )}
      data-fact
    >
      {children}
    </div>
  );
}
