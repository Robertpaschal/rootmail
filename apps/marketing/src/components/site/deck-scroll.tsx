"use client";

import { useEffect } from "react";

/**
 * The scroll rig — twelve lines, on purpose, and now shared by two scenes.
 *
 * `docs/design/05-ENGAGEMENT.md` §1.3 measured the pattern worth stealing: a
 * scene held by `position: sticky` inside a parent 2–4× the viewport, whose
 * surplus height IS the scroll budget, mapped by hand as `progress → state`.
 * §1.4 measured the part not worth stealing: in the reference, the scene's own
 * words are written into the DOM by the scroll handler, so with frames frozen
 * they do not exist.
 *
 * This driver cannot make that mistake, because it does not own any content.
 * Both scenes it drives — the hero deck and the three-sides panel — are radio
 * inputs and server-rendered panels, opened by CSS (`globals.css`, `.deck` and
 * `.tri`). All this does is set `checked` on the radio for the beat the reader
 * is in — the same thing their finger would do. Delete this file and both
 * scenes are still complete, keyboard-operable tab sets.
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
 *    a phone, a short laptop window or a zoomed page gets an ordinary section
 *    and no hijacking of its scroll.
 *
 * WHY IT TAKES IDS RATHER THAN HARDCODING THEM (2026-08-31). The three-sides
 * section stopped being a tab set the reader operates and became a scene the
 * scrollbar indexes into, which is the same mechanic the hero already had. Two
 * copies of a rig whose safety argument is this specific is one copy too many.
 */
export function DeckScroll({
  count,
  rig = "#hero-rig",
  pin = "#hero-pin",
  prefix = "rec",
}: {
  count: number;
  /**
   * CSS SELECTOR for the over-tall parent whose surplus height is the scroll
   * budget. A selector rather than an id, because the three-sides section
   * already carries `id="platform"` — that id is a nav anchor and an element
   * gets exactly one. Passing `"line-rig"` to an `getElementById` lookup made
   * this driver return early on every scroll and the scene never advanced,
   * silently and only in that one section.
   */
  rig?: string;
  /** Selector for the `position: sticky` child. Its computed position is the gate. */
  pin?: string;
  /** Radios are `#{prefix}-0` … `#{prefix}-{count-1}`. */
  prefix?: string;
}) {
  useEffect(() => {
    const rigEl = document.querySelector(rig);
    const pinEl = document.querySelector(pin);
    if (!rigEl || !pinEl) return;

    let last = -1;

    const onScroll = () => {
      if (getComputedStyle(pinEl).position !== "sticky") return;
      const r = rigEl.getBoundingClientRect();
      const surplus = r.height - pinEl.getBoundingClientRect().height;
      if (surplus < 200) return;
      const p = Math.min(Math.max(-r.top / surplus, 0), 1);
      const i = Math.min(count - 1, Math.floor(p * count));
      if (i === last) return;
      last = i;
      const input = document.getElementById(`${prefix}-${i}`);
      if (input instanceof HTMLInputElement && !input.checked) input.checked = true;
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [count, rig, pin, prefix]);

  return null;
}
