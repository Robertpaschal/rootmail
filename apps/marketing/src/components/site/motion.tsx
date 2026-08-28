"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Entrance reveal — rebuilt to obey the site's own motion rule.
 *
 * The old version shipped `initial={{ opacity: 0 }}` on 41 wrappers, which
 * means every section of the server-rendered page arrived invisible and stayed
 * that way until a `requestAnimationFrame` loop ran. rAF does not tick in a
 * hidden tab, in the browser preview pane, on a throttled device, or when the
 * animation chunk fails to load, and the single mount-time escape hatch covered
 * only the first of those. Content that is invisible until an animation runs is
 * content that sometimes does not exist — `00-PHILOSOPHY.md §6` refuses it and
 * `tailwind.config.ts` already said so in a comment.
 *
 * Two changes fix it permanently:
 *
 * 1. **Nothing fades.** The only animated property is `transform`. At rest the
 *    element is 10px lower than its final position and FULLY OPAQUE, so a
 *    transition that never runs costs ten pixels, not the paragraph.
 * 2. **It is a CSS transition, not a JS animation loop** — the mechanic
 *    `carousel.tsx` already documents: a CSS transition still ARRIVES at its
 *    end state when frames cannot be animated. The only JS is an
 *    IntersectionObserver toggling one class, and if that never runs the
 *    element stays ten pixels low.
 *
 * Timing comes from the two-tier system: 700ms on `--ease-narrative`. There is
 * nothing at 300ms in this codebase on purpose.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  inView = false,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  /** Trigger on scroll-into-view (once) instead of on mount. */
  inView?: boolean;
  /** Accepted and ignored — kept so call sites that passed it still compile. */
  y?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!inView || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "-40px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView]);

  return (
    <div
      ref={ref}
      className={[
        className,
        "transition-transform duration-narrative ease-narrative motion-reduce:transition-none",
        shown ? "translate-y-0" : "translate-y-2.5",
      ]
        .filter(Boolean)
        .join(" ")}
      style={delay ? { transitionDelay: `${Math.round(delay * 1000)}ms` } : undefined}
    >
      {children}
    </div>
  );
}
