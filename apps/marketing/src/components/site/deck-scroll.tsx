"use client";

import { useEffect } from "react";

/**
 * The scroll rig for the hero deck — eleven lines, on purpose.
 *
 * `docs/design/05-ENGAGEMENT.md` §1.3 measured the pattern worth stealing: a
 * scene held by `position: sticky` inside a parent 2–4× the viewport, whose
 * surplus height IS the scroll budget, mapped by hand as `progress → state`.
 * §1.4 measured the part not worth stealing: in the reference, the scene's own
 * words are written into the DOM by the scroll handler, so with frames frozen
 * they do not exist.
 *
 * This driver cannot make that mistake, because it does not own any content.
 * The deck is four radio inputs and four panels, all server-rendered, opened by
 * CSS (`globals.css`, `.deck`). All this does is set `checked` on the radio for
 * the beat the reader is in — the same thing their finger would do. Delete this
 * file and the hero is still a complete, keyboard-operable tab set.
 *
 * THREE THINGS IT DELIBERATELY DOES NOT DO
 * 1. **It never focuses.** Moving focus on scroll yanks a reader who is tabbing
 *    through the page, and scrolls the viewport a second time underneath them.
 * 2. **It only writes on a beat CHANGE.** So a reader who clicked a record by
 *    hand keeps it until they scroll into a different beat, rather than having
 *    their choice overwritten by every pixel of scroll.
 * 3. **It refuses to run unless the pin is actually engaged.** The surplus
 *    height only exists inside the `min-width`/`min-height` media query that
 *    turns on `position: sticky`, so the computed position is the exact test —
 *    a phone, a short laptop window or a zoomed page gets an ordinary hero and
 *    no hijacking of its scroll.
 */
export function DeckScroll({ count }: { count: number }) {
  useEffect(() => {
    const rig = document.getElementById("hero-rig");
    const pin = document.getElementById("hero-pin");
    if (!rig || !pin) return;

    let last = -1;

    const onScroll = () => {
      if (getComputedStyle(pin).position !== "sticky") return;
      const r = rig.getBoundingClientRect();
      const surplus = r.height - pin.getBoundingClientRect().height;
      if (surplus < 200) return;
      const p = Math.min(Math.max(-r.top / surplus, 0), 1);
      const i = Math.min(count - 1, Math.floor(p * count));
      if (i === last) return;
      last = i;
      const input = document.getElementById(`rec-${i}`);
      if (input instanceof HTMLInputElement && !input.checked) input.checked = true;
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [count]);

  return null;
}
