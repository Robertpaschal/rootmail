"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { PanelLeft } from "lucide-react";
import { Logo } from "./logo";
import { cn } from "@/lib/utils";

/**
 * A hideable sidebar with a macOS-style edge reveal.
 *
 * Two ideas, kept separate:
 *  • **collapsed** — the user's standing preference. Persisted. When collapsed
 *    the content reclaims the full width; nothing floats over anything.
 *  • **peek** — transient. With the sidebar hidden, brushing the left edge
 *    slides it back OVER the content (never pushing it, so the page beneath
 *    doesn't reflow) on a translucent, blurred panel. It stays as long as the
 *    cursor is on it — so you can scroll it and click through it — and leaves
 *    on its own a beat after you do.
 *
 * The delay on leave matters more than it sounds: without it, the gap between
 * the hot zone and the panel makes the sidebar flicker as you travel into it.
 */

interface SidebarState {
  collapsed: boolean;
  peek: boolean;
  /** True when the panel should be drawn over the content rather than docked. */
  overlay: boolean;
  toggle: () => void;
  setCollapsed: (v: boolean) => void;
  openPeek: () => void;
  closePeek: (immediate?: boolean) => void;
  cancelClose: () => void;
}

const Ctx = createContext<SidebarState | null>(null);
const KEY = "rm_sidebar_collapsed";
const LEAVE_DELAY = 220;
/** How close to the window edge wakes the panel. */
const EDGE = 24;
/** The panel's own width — past it, the pointer has clearly left. */
const PANEL_W = 288;

export function useSidebar(): SidebarState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSidebar must be used inside <SidebarProvider>");
  return ctx;
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsedState] = useState(false);
  const [peek, setPeek] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The move handler is attached once per collapsed-state change; a ref keeps it
  // reading the CURRENT peek without re-subscribing on every toggle.
  const peekRef = useRef(false);
  peekRef.current = peek;

  useEffect(() => {
    setCollapsedState(window.localStorage.getItem(KEY) === "1");
  }, []);

  const setCollapsed = useCallback((v: boolean) => {
    setCollapsedState(v);
    window.localStorage.setItem(KEY, v ? "1" : "0");
    if (!v) setPeek(false);
  }, []);

  const cancelClose = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const openPeek = useCallback(() => {
    cancelClose();
    setPeek(true);
  }, [cancelClose]);

  const closePeek = useCallback(
    (immediate = false) => {
      cancelClose();
      if (immediate) return setPeek(false);
      timer.current = setTimeout(() => setPeek(false), LEAVE_DELAY);
    },
    [cancelClose],
  );

  const toggle = useCallback(() => setCollapsed(!collapsed), [collapsed, setCollapsed]);

  // ⌘\ / Ctrl+\ — the shortcut people already have in their fingers.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        setCollapsed(!collapsed);
      }
      if (e.key === "Escape" && peek) setPeek(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [collapsed, peek, setCollapsed]);

  // The edge reveal, driven by POINTER POSITION rather than enter/leave on a
  // hot-zone element. Stacked fixed layers (strip, panel, scrim) make
  // enter/leave pairs unreliable — and "brush the edge" was always a question
  // about where the cursor is, not which box it happens to be over.
  useEffect(() => {
    if (!collapsed) return;
    const onMove = (e: MouseEvent) => {
      if (window.innerWidth < 768) return; // the sidebar is a drawer on mobile
      if (e.clientX <= EDGE) {
        cancelClose();
        setPeek(true);
      } else if (e.clientX > PANEL_W && peekRef.current) {
        // Out past the panel entirely — let it go, after a beat so a quick
        // overshoot on the way in doesn't slam it shut.
        closePeek();
      }
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [collapsed, cancelClose, closePeek]);

  useEffect(() => () => cancelClose(), [cancelClose]);

  return (
    <Ctx.Provider
      value={{ collapsed, peek, overlay: collapsed && peek, toggle, setCollapsed, openPeek, closePeek, cancelClose }}
    >
      {children}
    </Ctx.Provider>
  );
}

/**
 * The content column. Its left padding is the whole layout story: docked
 * sidebar → padded; hidden → full width. The padding animates so hiding reads
 * as the page growing into the space, not snapping.
 */
export function ShellMain({ children }: { children: React.ReactNode }) {
  const { collapsed, overlay } = useSidebar();

  return (
    <>
      {/* A whisper of the panel behind the edge, so the affordance is visible
          rather than folklore — it brightens as you approach. */}
      {collapsed && !overlay ? (
        <motion.div
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="pointer-events-none fixed inset-y-0 left-0 z-30 hidden w-1 bg-gradient-to-r from-border to-transparent md:block"
        />
      ) : null}

      {/* The content column. Its left inset IS the layout story: docked → inset,
          hidden → full width. A plain CSS transition, because it must only apply
          from md up and padding is exactly what CSS transitions are good at. */}
      <div
        className="transition-[padding-left] duration-300 ease-out motion-reduce:transition-none md:pl-[var(--rm-sidebar-w)]"
        style={{ "--rm-sidebar-w": collapsed ? "0px" : "18rem" } as React.CSSProperties}
      >
        {children}
      </div>
    </>
  );
}

/** The scrim under a peeked sidebar — dims and blurs the page it floats over. */
export function PeekBackdrop() {
  const { overlay, closePeek } = useSidebar();
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {overlay ? (
        <motion.div
          key="peek-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.18 }}
          onMouseEnter={() => closePeek()}
          onClick={() => closePeek(true)}
          aria-hidden
          className="fixed inset-0 z-30 hidden bg-background/40 backdrop-blur-[2px] md:block"
        />
      ) : null}
    </AnimatePresence>
  );
}

/**
 * The rootmail mark, in the top bar, whenever the sidebar isn't carrying it.
 *
 * The brand used to live only in the sidebar header — so hiding the sidebar took
 * the product's own name off the screen. Wherever you are, and whatever you've
 * hidden, you should be able to see what you're using and click home.
 */
export function BrandMark() {
  const { collapsed } = useSidebar();
  if (!collapsed) return null;
  return (
    <Link href="/" aria-label="rootmail" className="hidden shrink-0 md:block">
      <Logo />
    </Link>
  );
}

/** Show/hide the sidebar from the top bar — the ONE control for it, plus ⌘\. */
export function SidebarToggle({ className }: { className?: string }) {
  const { collapsed, toggle } = useSidebar();
  return (
    <button
      type="button"
      onClick={toggle}
      title={`${collapsed ? "Show" : "Hide"} sidebar  ⌘\\`}
      aria-label={`${collapsed ? "Show" : "Hide"} sidebar`}
      aria-pressed={!collapsed}
      className={cn(
        "hidden rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:inline-flex",
        className,
      )}
    >
      <PanelLeft className={cn("size-4 transition-transform", collapsed && "rotate-180")} />
    </button>
  );
}
