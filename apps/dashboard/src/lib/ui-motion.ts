/** Layout motion enhances a committed layout; it never owns visibility/state. */
export type SurfaceRect = Pick<DOMRect, "left" | "top" | "width" | "height">;

/** Space-aware popup placement; topInset includes any sticky toolbar. */
export function popupPlacement(anchor: SurfaceRect, viewport: { width: number; height: number; topInset: number }, preferUp: boolean) {
  const width = Math.min(320, Math.max(1, viewport.width - 32));
  const above = Math.max(0, anchor.top - viewport.topInset - 8);
  const below = Math.max(0, viewport.height - anchor.top - anchor.height - 12);
  const up = preferUp ? above >= 180 || above >= below : below < 180 && above > below;
  return {
    up,
    width,
    left: Math.max(16, Math.min(anchor.left + anchor.width - width, viewport.width - width - 16)),
    maxHeight: Math.min(512, up ? above : below),
  };
}

export function surfaceLayoutFrames(before: SurfaceRect, after: SurfaceRect): Keyframe[] | null {
  const values = [before.left, before.top, before.width, before.height, after.left, after.top, after.width, after.height];
  if (!values.every(Number.isFinite) || before.width <= 0 || before.height <= 0 || after.width <= 0 || after.height <= 0) return null;
  if (Math.abs(before.left - after.left) < 0.5 && Math.abs(before.top - after.top) < 0.5 && Math.abs(before.width - after.width) < 0.5 && Math.abs(before.height - after.height) < 0.5) return null;
  return [
    // Use physical coordinates for both ends: changing width on a right-anchored
    // panel also changes its left edge, so a translate-only FLIP jumps sideways.
    { left: `${before.left}px`, top: `${before.top}px`, right: "auto", bottom: "auto", margin: "0px", width: `${before.width}px`, height: `${before.height}px`, transform: "none" },
    { left: `${after.left}px`, top: `${after.top}px`, right: "auto", bottom: "auto", margin: "0px", width: `${after.width}px`, height: `${after.height}px`, transform: "none" },
  ];
}

export function animateSurface(element: HTMLElement, before?: SurfaceRect | null): Animation | null {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof element.animate !== "function") return null;
  const frames = before ? surfaceLayoutFrames(before, element.getBoundingClientRect()) : [{ translate: "0px 8px" }, { translate: "0px 0px" }];
  if (!frames) return null;
  // The final geometry already exists in CSS. Cancellation/unsupported motion
  // therefore leaves a usable panel, with no timeout or animation-end dependency.
  try {
    return element.animate(frames, { duration: 700, easing: "cubic-bezier(0.32, 0.72, 0, 1)" });
  } catch { return null; }
}
