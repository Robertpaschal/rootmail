"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const TRANSPARENT = new Set(["rgba(0, 0, 0, 0)", "transparent", ""]);

/**
 * Whatever is actually painted directly beneath the bar.
 *
 * "The corresponding colour as the topmost section beneath it" is not one
 * token, which is the thing that made this need code. On the marketing home the
 * first thing under the header is the hero SLAB, painted `--card`. On the
 * developer home the first section is transparent and sits straight on the page
 * ground, painted `--paper`. And a page whose first section is inverted paints
 * neither. Hard-coding `--card` was right on most pages and visibly wrong on the
 * rest — a dark bar over a light opening section.
 *
 * So: start at the first child of `<main>` and walk UP for the first ancestor
 * that actually paints something. A painted first section answers immediately;
 * a transparent one falls through to `<body>` and yields the page ground. Both
 * cases come out right without any page having to declare anything.
 */
function groundBeneath(): string | null {
  const first = document.querySelector("main")?.firstElementChild;
  let node: Element | null = first ?? document.body;
  while (node) {
    const bg = getComputedStyle(node).backgroundColor;
    if (!TRANSPARENT.has(bg)) return bg;
    node = node.parentElement;
  }
  return null;
}

/**
 * The bar's container, and the two facts it has to know: what is underneath it,
 * and whether it is floating yet.
 *
 * At the top of a page the island paints the colour of the section below it,
 * with no border and no lift, so it reads as part of that section. Once the page
 * scrolls it is genuinely floating over something and it becomes glass — see
 * `.nav-island` in `globals.css` for why that is the right moment for it.
 *
 * THE LISTENER IS CHEAP ON PURPOSE. `passive: true` so it never blocks the
 * scroll, and it only calls `setState` when the threshold is actually CROSSED —
 * a naive `setStuck(scrollY > 8)` on every scroll event re-renders this subtree
 * dozens of times a second for no change in output. The ref holds the last value
 * so the comparison costs nothing.
 *
 * It reads once on mount as well as on scroll, because a browser restoring a
 * scroll position on back-navigation fires no scroll event, and the bar would
 * otherwise render at-rest halfway down the page.
 *
 * The ground is re-read when the theme changes, because every one of those
 * colours has a different value in the other theme and nothing else would tell
 * us. `<html class="dark">` is the signal the toggle already writes.
 */
export function NavIsland({ className, children }: { className?: string; children: ReactNode }) {
  const [stuck, setStuck] = useState(false);
  const [ground, setGround] = useState<string | null>(null);
  const last = useRef(false);

  useEffect(() => {
    const read = () => {
      // 8px, not 0: a trackpad's elastic overscroll and the browser's own
      // scroll anchoring both produce 1–2px of movement that is not a scroll.
      const next = window.scrollY > 8;
      if (next !== last.current) {
        last.current = next;
        setStuck(next);
      }
    };
    read();
    window.addEventListener("scroll", read, { passive: true });
    return () => window.removeEventListener("scroll", read);
  }, []);

  useEffect(() => {
    const sync = () => setGround(groundBeneath());
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  return (
    <div
      className={cn("nav-island", className)}
      data-stuck={stuck ? "true" : undefined}
      // Until this resolves (one frame, and forever in a browser with JS off)
      // the CSS fallback is `--card`, which is correct on most pages.
      style={ground ? ({ "--nav-rest": ground } as React.CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}
