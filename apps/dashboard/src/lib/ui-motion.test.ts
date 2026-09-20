import { deepEqual, equal } from "node:assert/strict";
import { test } from "node:test";
import { animateSurface, popupPlacement, surfaceLayoutFrames } from "./ui-motion";

test("an upward popup respects the sticky toolbar and narrow content viewport", () => {
  deepEqual(popupPlacement({ left: 16, top: 532, width: 112, height: 36 }, { width: 305, height: 844, topInset: 132 }, true),
    { up: true, width: 273, left: 16, maxHeight: 392 });
});

test("a popup flips below when its preferred upper side has no room", () => {
  const placed = popupPlacement({ left: 240, top: 145, width: 48, height: 44 }, { width: 305, height: 844, topInset: 132 }, true);
  deepEqual(placed, { up: false, width: 273, left: 16, maxHeight: 512 });
});

test("a lower popup flips above near the viewport edge", () => {
  const placed = popupPlacement({ left: 900, top: 700, width: 120, height: 44 }, { width: 1200, height: 800, topInset: 80 }, false);
  deepEqual(placed, { up: true, width: 320, left: 700, maxHeight: 512 });
});

test("docking animates from the observed floating position into committed geometry", () => {
  deepEqual(surfaceLayoutFrames({ left: 800, top: 280, width: 448, height: 704 }, { left: 768, top: 12, width: 480, height: 976 }), [
    { left: "800px", top: "280px", right: "auto", bottom: "auto", margin: "0px", width: "448px", height: "704px", transform: "none" },
    { left: "768px", top: "12px", right: "auto", bottom: "auto", margin: "0px", width: "480px", height: "976px", transform: "none" },
  ]);
});

test("undocking retains the actual position when a switch interrupts motion", () => {
  deepEqual(surfaceLayoutFrames({ left: 780.5, top: 100.25, width: 460, height: 850 }, { left: 800, top: 280, width: 448, height: 704 })?.[0],
    { left: "780.5px", top: "100.25px", right: "auto", bottom: "auto", margin: "0px", width: "460px", height: "850px", transform: "none" });
});

test("unchanged and hidden surfaces do not animate", () => {
  const rect = { left: 12, top: 12, width: 281, height: 820 };
  equal(surfaceLayoutFrames(rect, rect), null);
  equal(surfaceLayoutFrames({ ...rect, height: 0 }, rect), null);
  equal(surfaceLayoutFrames(rect, { ...rect, width: Number.NaN }), null);
});

test("reduced motion skips native animations entirely", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { matchMedia: () => ({ matches: true }) } });
  try {
    let called = false;
    const element = { animate: () => { called = true; } } as unknown as HTMLElement;
    equal(animateSurface(element), null);
    equal(called, false);
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("unsupported animation leaves the already committed surface alone", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { matchMedia: () => ({ matches: false }) } });
  try {
    equal(animateSurface({} as HTMLElement), null);
    equal(animateSurface({ animate: () => { throw new Error("Unsupported"); } } as unknown as HTMLElement), null);
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
