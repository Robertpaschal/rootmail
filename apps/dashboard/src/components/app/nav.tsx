"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { Mail, Send, Settings } from "lucide-react";
import { Logo } from "./logo";
import { useSidebar } from "./sidebar-shell";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The sidebar's width in px — shared by the slide animation and the shell inset. */
export const SIDEBAR_W = 288;

type NavItem = { href: string; label: string; icon: typeof Mail; exact?: boolean };
type NavGroup = {
  label?: string;
  items: NavItem[];
};

/**
 * This week's signed-in sidebar is Mail + Settings. Overview remains a route
 * at /overview (furniture, not home) but is not a nav item and does not lead the IA.
 * sandbox / workspaceName stay on the public props so the shell does not change.
 */
function buildGroups(_opts: { sandbox: boolean; workspaceName: string | null }): NavGroup[] {
  return [
    {
      items: [
        { href: "/messages", label: "Mail", icon: Mail },
        { href: "/settings", label: "Settings", icon: Settings },
      ],
    },
  ];
}

function useIsActive() {
  const pathname = usePathname();
  return (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/** A nav row with a GLIDING active pill — the highlight physically travels to the
 * item you open (shared layoutId), so navigation reads as one continuous motion. */
function NavLink({
  item,
  isActive,
  indicatorId,
  onNavigate,
}: {
  item: NavItem;
  isActive: (h: string, e?: boolean) => boolean;
  indicatorId: string;
  /** Called on click — lets a floating sidebar dismiss itself after you pick. */
  onNavigate?: () => void;
}) {
  const active = isActive(item.href, item.exact);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
      )}
    >
      {active ? (
        <motion.span
          layoutId={indicatorId}
          className="absolute inset-0 rounded-md bg-secondary"
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
        />
      ) : null}
      <span className="relative z-10 flex items-center gap-3">
        <item.icon className="size-4" /> {item.label}
      </span>
    </Link>
  );
}

export interface NavContext {
  /** The active workspace's name — the "product" the user is inside. */
  workspaceName?: string | null;
  /** True when the active workspace is the sandbox (test) environment. */
  sandbox?: boolean;
}

export function Sidebar({ workspaceName = null, sandbox = false }: NavContext) {
  const isActive = useIsActive();
  const groups = buildGroups({ sandbox, workspaceName });
  const { collapsed, overlay, closePeek } = useSidebar();
  const reduce = useReducedMotion();

  return (
    // w-72 so long labels render in full — no ellipsis.
    // Hidden, it parks just off-screen and slides back on the edge reveal; it is
    // never unmounted, so scroll position survives a peek.
    <motion.aside
      initial={false}
      // Pixels, not "-100%": animating a percentage to a unitless 0 is a unit
      // mismatch framer can't interpolate, and the panel sticks off-screen.
      animate={{ x: collapsed && !overlay ? -SIDEBAR_W : 0 }}
      transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 40 }}
      // Parked off-screen it must be unreachable, not merely invisible —
      // otherwise Tab walks into a sidebar the user can't see.
      aria-hidden={collapsed && !overlay}
      inert={collapsed && !overlay}
      className={cn(
        "fixed inset-y-0 left-0 z-40 hidden w-72 flex-col border-r md:flex",
        overlay
          ? "bg-card/80 shadow-2xl backdrop-blur-xl supports-[backdrop-filter]:bg-card/70"
          : "bg-card",
      )}
    >
      {/* Just the brand. Hiding and showing live on ONE control in the top bar
          (plus ⌘\) — a second pair in here was the same job twice. */}
      <div className="flex h-16 items-center border-b px-5">
        <Link href="/" aria-label="rootmail" onClick={overlay ? () => closePeek(true) : undefined}>
          <Logo />
        </Link>
      </div>

      <LayoutGroup id="sidebar">
        <div className="space-y-3 px-3 py-4">
          {/* One compose action: write lives at /messages/new. */}
          <Link
            href="/messages/new"
            onClick={overlay ? () => closePeek(true) : undefined}
            className={cn(buttonVariants({ size: "sm" }), "w-full gap-2")}
          >
            <Send className="size-4" /> Compose
          </Link>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
          {groups.map((g, i) => (
            <div key={g.label ?? `top-${i}`} className="space-y-1">
              {g.label ? (
                <p className="truncate px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {g.label}
                </p>
              ) : null}
              {g.items.map((it) => (
                <NavLink
                  key={it.href}
                  item={it}
                  isActive={isActive}
                  indicatorId="nav-active"
                  onNavigate={overlay ? () => closePeek(true) : undefined}
                />
              ))}
            </div>
          ))}
        </nav>
      </LayoutGroup>

      {/* No fixed footer: help (assistant + contact support) rides in the
          floating Ask-AI launcher, in context on every page. */}
    </motion.aside>
  );
}

export function MobileNav({ workspaceName = null, sandbox = false }: NavContext) {
  const isActive = useIsActive();
  const shown = buildGroups({ sandbox, workspaceName }).flatMap((g) => g.items);

  return (
    <div className="border-b bg-card md:hidden">
      <nav className="flex gap-1 overflow-x-auto px-3 py-2">
        {shown.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className={cn(
              "flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              isActive(it.href, it.exact)
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <it.icon className="size-4" /> {it.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
