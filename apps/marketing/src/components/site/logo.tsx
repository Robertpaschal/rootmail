import { cn } from "@/lib/utils";

/**
 * The rootmail mark: a solid envelope whose flap is an actual hole.
 *
 * Two decisions worth keeping. It is FILLED, not stroked — the previous mark
 * was 2px strokes and turned to mush below about 20px, which is where a
 * favicon lives. And the flap is cut with fill-rule="evenodd" rather than
 * painted over in the tile colour, so the mark drops onto any background —
 * brand tile, the staff console's near-black, or nothing at all — without
 * knowing what is behind it.
 *
 * A note for whoever revisits this: the name invites drawing a root, and it
 * was tried. Rendered at real sizes, a root under the envelope reads as a
 * camera tripod, a root inside it crosses the flap into an X, and a taproot
 * through the body splits it into a crown. Three attempts, all rejected on
 * screen. The envelope alone is what survives 16px.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M6.3 4.5H17.7A2.8 2.8 0 0 1 20.5 7.3V16.7A2.8 2.8 0 0 1 17.7 19.5H6.3A2.8 2.8 0 0 1 3.5 16.7V7.3A2.8 2.8 0 0 1 6.3 4.5ZM4.9 6 12 11.9 19.1 6 19.1 4.5 4.9 4.5Z" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex min-h-11 items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="grid size-7 place-items-center rounded bg-primary text-primary-foreground">
        <LogoMark className="size-[17px]" />
      </span>
      <span className="text-base">rootmail</span>
    </span>
  );
}
