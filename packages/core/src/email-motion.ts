// Motion for email: entrance animations and button hover states, delivered as a
// <style> block. Shared by the template studio's serializer (apps/dashboard's
// email-doc.ts) and our own platform mail (apps/api's lib/emails.ts) so both
// animate the same way.
//
// Like `constants`, this module is intentionally dependency-free and
// side-effect-free — it only builds strings. That's what lets the dashboard
// import it via `@rootmail/core/email-motion` (a leaf subpath export) from code
// that also runs in the browser, without dragging env parsing, Redis or the
// queue into the client bundle. Keep it that way: no imports belong here.
//
// WHAT ACTUALLY RENDERS THIS
// --------------------------
// Apple Mail (macOS + iOS) runs it. Gmail keeps embedded <style> but strips
// `animation`/`@keyframes`. Outlook on Windows renders through Word and ignores
// essentially all of this. So motion is PROGRESSIVE ENHANCEMENT: a decoration
// for the clients that support it, never a carrier of meaning. If the email
// doesn't read correctly frozen at its final state, it is broken.
//
// THE BLANK-EMAIL TRAP
// --------------------
// The obvious way to write an entrance is:
//
//     .rm-a { opacity: 0; animation: rm-rise .5s forwards; }
//
// Do NOT do this. Gmail keeps the `opacity: 0` (a property it supports) and
// drops the `animation` (a property it doesn't) — leaving every animated block
// permanently invisible. The email arrives blank, and it arrives blank only in
// the single most popular client, which is exactly where you're least likely to
// have tested it.
//
// So the starting state lives ONLY inside the @keyframes, and the element
// carries no static opacity or transform of its own. `animation-fill-mode:both`
// supplies the `from` state during the stagger delay. A client that drops the
// `animation` shorthand drops the whole effect with it and renders the element
// in its natural, fully-visible state. That is the entire design constraint
// here, and it's why these rules look more roundabout than they need to.

export type MotionLevel = "none" | "subtle" | "lively";

export const MOTION_LEVELS: { value: MotionLevel; label: string; hint: string }[] = [
  { value: "none", label: "None", hint: "Everything renders static." },
  { value: "subtle", label: "Subtle", hint: "A soft fade-up as the email opens." },
  { value: "lively", label: "Lively", hint: "Staggered entrances with a little more travel." },
];

export function isMotionLevel(v: unknown): v is MotionLevel {
  return v === "none" || v === "subtle" || v === "lively";
}

/** How many stagger steps we emit; blocks past this share the last delay. */
export const MOTION_STAGGER_STEPS = 8;

/**
 * The class list for the nth animated block. Returns "" for `none` so callers
 * can drop it straight into a class attribute without branching.
 */
export function motionClass(level: MotionLevel, index: number): string {
  if (level === "none") return "";
  const step = Math.min(Math.max(index, 0), MOTION_STAGGER_STEPS - 1);
  return `rm-a rm-d${step}`;
}

/** Marks an element as a hover-reactive button (see `.rm-btn` below). */
export const MOTION_BUTTON_CLASS = "rm-btn";

function keyframes(level: MotionLevel): string {
  // `lively` travels further and scales; `subtle` only lifts and fades.
  const travel = level === "lively" ? 16 : 8;
  const scale = level === "lively" ? "scale(.985)" : "";
  return (
    `@keyframes rm-rise{from{opacity:0;transform:translateY(${travel}px)${scale ? ` ${scale}` : ""}}` +
    `to{opacity:1;transform:translateY(0)${scale ? " scale(1)" : ""}}}`
  );
}

/**
 * The CSS text (no <style> wrapper). Empty string when motion is off, so the
 * caller can skip emitting a style block entirely.
 */
export function motionCss(level: MotionLevel): string {
  if (level === "none") return "";
  const duration = level === "lively" ? "0.62s" : "0.45s";
  const gap = level === "lively" ? 70 : 45; // ms between blocks

  const delays = Array.from(
    { length: MOTION_STAGGER_STEPS },
    (_, i) => `.rm-d${i}{animation-delay:${(i * gap) / 1000}s}`,
  ).join("");

  return [
    keyframes(level),
    // No static opacity/transform here — see THE BLANK-EMAIL TRAP above.
    `.rm-a{animation:rm-rise ${duration} cubic-bezier(.22,.61,.36,1) both}`,
    delays,
    // Buttons: a hover state costs nothing where it isn't supported, and the
    // static appearance is already correct without it.
    `.${MOTION_BUTTON_CLASS} a{transition:opacity .2s ease,transform .2s ease}`,
    `.${MOTION_BUTTON_CLASS}:hover a{opacity:.88;transform:translateY(-1px)}`,
    // Honour the reader's system setting. Apple Mail passes this through, and
    // it's the same audience that actually runs the animation.
    `@media (prefers-reduced-motion:reduce){.rm-a{animation:none}` +
      `.${MOTION_BUTTON_CLASS} a{transition:none}}`,
  ].join("");
}

/** The full `<style>…</style>` block, or "" when motion is off. */
export function motionStyleBlock(level: MotionLevel): string {
  const css = motionCss(level);
  return css ? `<style type="text/css">${css}</style>` : "";
}
