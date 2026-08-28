// Next remounts a template on every navigation, which is exactly what a page
// transition needs — but it also means this file decides whether EVERY page in
// the app is visible.
//
// It used to render `initial={{ opacity: 0, y: 8 }}` through framer, so every
// page in this console arrived invisible and stayed that way until a
// `requestAnimationFrame` loop ran. The escape hatch it carried covered only
// the tab-hidden-at-mount case, and the browser pane has since been observed
// freezing `setTimeout` as well — silently, twice. Content that needs an
// animation to finish before it can be read is content that sometimes cannot be
// read at all (`docs/design/00-PHILOSOPHY.md` §6).
//
// So nothing fades. The only animated property is `transform`, the element is
// FULLY OPAQUE at rest, and it is a CSS transition rather than a JS animation
// loop — a transition still ARRIVES at its end state when frames cannot be
// animated. If the transition never runs at all, the page is eight pixels low
// and completely readable, which is the correct failure.
//
// No JavaScript is involved, so there is no hydration seam and no effect to
// guard. Timing comes from the two-tier system: 700ms on `--ease-narrative`.
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return (
    <div className="motion-safe:animate-fade-rise">
      {children}
    </div>
  );
}
