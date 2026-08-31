"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import {
  BarChart3,
  BookOpen,
  ChevronRight,
  CreditCard,
  FileCheck2,
  FileText,
  FlaskConical,
  Gauge,
  Inbox,
  KeyRound,
  LayoutDashboard,
  Mail,
  Megaphone,
  Network,
  Send,
  Settings,
  Radar,
  Sparkles,
  UserCog,
  Users,
  Webhook,
  Workflow,
} from "lucide-react";
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
  /** Folded away until asked for — see the Developers group. */
  collapsible?: boolean;
  /** One line under the group header, shown while it's folded. */
  hint?: string;
};

/**
 * ONE sidebar, grouped by what things are FOR — no transactional/marketing flip.
 * The product core (messages ↔ replies ↔ campaigns ↔ audience ↔ templates) is a
 * single fabric the user moves through; transactional vs marketing stays a
 * PRICING and metering dimension (billing pages, analytics scopes, usage
 * meters), not a navigation wall. Sections that only make sense against real
 * infrastructure (deliverability, client domains) hide in sandbox, and the
 * live-only sections hide in the sandbox — the nav always reflects what can
 * actually function right now.
 */
function buildGroups(opts: { sandbox: boolean; workspaceName: string | null }): NavGroup[] {
  const { sandbox, workspaceName } = opts;
  return [
    {
      items: [
        // `/` redirects to the signed-in home (Mail), so Overview is linked at its
        // real path. Restoring the full nav without this made "Overview" open Mail.
        { href: "/overview", label: "Overview", icon: LayoutDashboard },
        // The one destination in here that is not an object type. Thirteen of
        // the fifteen others are a noun you can list; this is what the system
        // NOTICED and what it DID — throttles, pauses, DNS drift, the
        // reputation sweep. All of it already happens; none of it had a door.
        { href: "/activity", label: "What changed", icon: Radar },
        { href: "/assistant", label: "Assistant", icon: Sparkles },
      ],
    },
    {
      // The product itself: every email, the conversations they open, the bulk
      // engines that generate them, the people they go to, and the designs they
      // share. Proof rides with the mail it certifies.
      label: "Email",
      items: [
        { href: "/messages", label: "Messages", icon: Mail },
        { href: "/inbox", label: "Replies", icon: Inbox },
        { href: "/campaigns", label: "Campaigns", icon: Megaphone },
        { href: "/sequences", label: "Sequences", icon: Workflow },
        { href: "/contacts", label: "Audience", icon: Users },
        { href: "/templates", label: "Templates", icon: FileText },
        { href: "/compliance", label: "Proof & compliance", icon: FileCheck2 },
      ],
    },
    {
      // How it's all going. Both pages scope by wing INSIDE (one entry each —
      // never duplicated per wing). Reputation needs real sends, so it's live-only.
      label: "Insights",
      items: [
        { href: "/analytics", label: "Analytics", icon: BarChart3 },
        ...(sandbox ? [] : [{ href: "/deliverability", label: "Deliverability", icon: Gauge }]),
      ],
    },
    {
      // The account behind the product, titled by the workspace the user is
      // actually in ("Production", not the abstract "Workspace"). Team carries
      // roles + SSO inside; client domains (the agency surface) needs real DNS
      // and sending, so it's live-only.
      label: workspaceName ?? "Workspace",
      items: [
        { href: "/billing", label: "Plan & usage", icon: CreditCard },
        { href: "/members", label: "Team", icon: UserCog },
        ...(sandbox ? [] : [{ href: "/sub-tenants", label: "Client domains", icon: Network }]),
        { href: "/settings", label: "Settings", icon: Settings },
      ],
    },
    {
      // LAST, and folded away by default: most people who send email here never
      // touch an API key. It opens itself when you're inside it, and stays open
      // once you've opened it — so the people who live here pay no toll, and
      // everyone else isn't asked to scroll past tools they'll never use.
      label: "Developers",
      collapsible: true,
      hint: "API keys, webhooks, docs, sandbox",
      items: [
        { href: "/api-keys", label: "API keys", icon: KeyRound },
        { href: "/webhooks", label: "Webhooks", icon: Webhook },
        { href: "/docs", label: "Docs", icon: BookOpen },
        // Testing is the hub: the everyday half (send yourself a real test) is
        // surfaced in the composer and studio; the sandbox lives in here.
        { href: "/testing", label: "Testing & sandbox", icon: FlaskConical },
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

const DEV_OPEN_KEY = "rm_nav_developers_open";

/**
 * A folded nav group. Developer tooling is a minority of this product's users,
 * so it sits behind one click instead of costing everyone a screenful — the
 * pattern people already know from Vercel, Stripe and Supabase.
 *
 * It never hides where you are: being inside the group opens it, and the choice
 * to open it sticks across sessions.
 */
function CollapsibleGroup({
  group,
  isActive,
  hasActive,
  onNavigate,
}: {
  group: NavGroup;
  isActive: (h: string, e?: boolean) => boolean;
  hasActive: boolean;
  onNavigate?: () => void;
}) {
  // Start open only when the current page lives inside — matching on the server
  // and the client, so there's no hydration flash. The stored preference is
  // applied after mount.
  const [open, setOpen] = useState(hasActive);
  useEffect(() => {
    if (hasActive) return setOpen(true);
    setOpen(window.localStorage.getItem(DEV_OPEN_KEY) === "1");
  }, [hasActive]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    window.localStorage.setItem(DEV_OPEN_KEY, next ? "1" : "0");
  };

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 rounded-md px-3 pb-1 pt-2 text-left text-[12.5px] font-semibold uppercase tracking-wider text-muted-foreground/70 transition-colors hover:text-foreground"
      >
        <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.15 }} className="flex">
          <ChevronRight className="size-3" />
        </motion.span>
        <span className="truncate">{group.label}</span>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="items"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="space-y-1 overflow-hidden"
          >
            {group.items.map((it) => (
              <NavLink key={it.href} item={it} isActive={isActive} indicatorId="nav-active" onNavigate={onNavigate} />
            ))}
          </motion.div>
        ) : group.hint ? (
          <motion.p
            key="hint"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="px-3 pb-1 text-[12.5px] leading-snug text-muted-foreground/60"
          >
            {group.hint}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
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
    // w-72 so long labels ("Proof & compliance") render in full — no ellipsis.
    // Hidden, it parks just off-screen and slides back on the edge reveal; it is
    // never unmounted, so scroll position and the folded Developers group
    // survive a peek.
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
          {/* One neutral compose action: a one-off email from here is a one-to-one
              (transactional) send; bulk lives in Campaigns. */}
          <Link
            href="/messages/new"
            onClick={overlay ? () => closePeek(true) : undefined}
            className={cn(buttonVariants({ size: "sm" }), "w-full gap-2")}
          >
            <Send className="size-4" /> Compose
          </Link>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
          {groups.map((g, i) =>
            g.collapsible ? (
              <CollapsibleGroup
                key={g.label ?? `top-${i}`}
                group={g}
                isActive={isActive}
                hasActive={g.items.some((it) => isActive(it.href, it.exact))}
                onNavigate={overlay ? () => closePeek(true) : undefined}
              />
            ) : (
              <div key={g.label ?? `top-${i}`} className="space-y-1">
                {g.label ? (
                  <p className="truncate px-3 pb-1 pt-2 text-[12.5px] font-semibold uppercase tracking-wider text-muted-foreground/70">
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
            ),
          )}
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
