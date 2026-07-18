"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import {
  BarChart3,
  BookOpen,
  CreditCard,
  FileCheck2,
  FileText,
  FlaskConical,
  Gauge,
  Inbox,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  Mail,
  Megaphone,
  Network,
  Send,
  ShieldCheck,
  Settings,
  Sparkles,
  UserCog,
  Users,
  Webhook,
  Workflow,
  Zap,
} from "lucide-react";
import { Logo } from "./logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: typeof Mail; exact?: boolean };
type NavGroup = { label?: string; items: NavItem[] };

// Transactional and marketing email are fundamentally different products, so the
// dashboard is two wings, not one flat list. Transactional is the core — the
// send API + templates/blocks + the reliability tools a product's receipts and
// resets depend on. Marketing is audience + campaigns + engagement. A switcher
// makes it obvious which dashboard you're in; shared workspace chrome persists.
type Wing = "transactional" | "marketing";

const WINGS: { id: Wing; label: string; icon: typeof Mail; home: string }[] = [
  { id: "transactional", label: "Transactional", icon: Zap, home: "/messages" },
  { id: "marketing", label: "Marketing", icon: Megaphone, home: "/campaigns" },
];

// Plain-English context — a user who's never heard "transactional" vs "marketing"
// should still know what each wing is and what to expect, no demo required.
const WING_HINT: Record<Wing, string> = {
  transactional: "Automated emails your app sends one person — receipts, password resets, alerts. Built on the API.",
  marketing: "Emails you send to an audience — campaigns, newsletters, and promos, driven by your contacts.",
};

const SHARED_TOP: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/assistant", label: "Assistant", icon: Sparkles },
];

const TRANSACTIONAL_ITEMS: NavItem[] = [
  { href: "/messages", label: "Messages", icon: Mail },
  { href: "/inbox", label: "Replies", icon: Inbox },
  { href: "/templates", label: "Templates & blocks", icon: FileText },
  { href: "/api-keys", label: "API keys", icon: KeyRound },
  { href: "/webhooks", label: "Webhooks", icon: Webhook },
  { href: "/deliverability", label: "Deliverability", icon: Gauge },
  { href: "/sub-tenants", label: "Client domains", icon: Network },
  { href: "/test-inbox", label: "Test inbox", icon: FlaskConical },
  { href: "/docs", label: "Docs", icon: BookOpen },
];

const MARKETING_ITEMS: NavItem[] = [
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/sequences", label: "Sequences", icon: Workflow },
  { href: "/inbox", label: "Replies", icon: Inbox },
  // One roof for people, imports, and audiences — the hub tabs them.
  { href: "/contacts", label: "Audience", icon: Users },
  { href: "/templates", label: "Templates", icon: FileText },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

const SHARED_WORKSPACE: NavGroup = {
  label: "Workspace",
  items: [
    { href: "/billing", label: "Plan & usage", icon: CreditCard },
    { href: "/members", label: "Team", icon: UserCog },
    { href: "/roles", label: "Roles", icon: ShieldCheck },
    { href: "/compliance", label: "Compliance", icon: FileCheck2 },
    { href: "/settings", label: "Settings", icon: Settings },
  ],
};

// Routes that belong exclusively to one wing — landing on them selects it. Content
// tools (/templates) live in both wings, so they don't force a switch.
const TX_ROUTES = ["/messages", "/api-keys", "/webhooks", "/deliverability", "/sub-tenants", "/test-inbox", "/docs"];
const MK_ROUTES = ["/campaigns", "/sequences", "/contacts", "/lists", "/import", "/analytics"];
// /inbox (Replies) is a shared, cross-wing surface — like /templates it lives in
// both wings and never forces a wing switch.

function wingForPath(p: string): Wing | null {
  const hit = (routes: string[]) => routes.some((h) => p === h || p.startsWith(`${h}/`));
  if (hit(TX_ROUTES)) return "transactional";
  if (hit(MK_ROUTES)) return "marketing";
  return null;
}

function useIsActive() {
  const pathname = usePathname();
  return (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

// Active wing follows the route; on shared routes it falls back to the last-picked
// wing (a cookie, read after mount to keep SSR deterministic).
function useWing(): [Wing, (w: Wing) => void] {
  const pathname = usePathname();
  const router = useRouter();
  const [pref, setPref] = useState<Wing>("transactional");
  useEffect(() => {
    const c = document.cookie.split("; ").find((x) => x.startsWith("rm_wing="))?.split("=")[1];
    if (c === "marketing" || c === "transactional") setPref(c);
  }, []);
  const wing = wingForPath(pathname) ?? pref;
  const switchWing = (w: Wing) => {
    document.cookie = `rm_wing=${w}; path=/; max-age=31536000; samesite=lax`;
    setPref(w);
    router.push(WINGS.find((x) => x.id === w)!.home);
  };
  return [wing, switchWing];
}

/** A nav row with a GLIDING active pill — the highlight physically travels to the
 * item you open (shared layoutId), so navigation reads as one continuous motion. */
function NavLink({
  item,
  isActive,
  indicatorId,
}: {
  item: NavItem;
  isActive: (h: string, e?: boolean) => boolean;
  indicatorId: string;
}) {
  const active = isActive(item.href, item.exact);
  return (
    <Link
      href={item.href}
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

/** The two-wing switch — a sliding thumb (framer layoutId) glides between
 * Transactional and Marketing; both labels render in full with their icons. */
function WingSwitcher({ wing, onSwitch, thumbId }: { wing: Wing; onSwitch: (w: Wing) => void; thumbId: string }) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-lg bg-secondary/50 p-1">
      {WINGS.map((w) => {
        const active = wing === w.id;
        return (
          <button
            key={w.id}
            type="button"
            onClick={() => onSwitch(w.id)}
            title={WING_HINT[w.id]}
            aria-pressed={active}
            className={cn(
              "relative flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active ? (
              <motion.span
                layoutId={thumbId}
                className="absolute inset-0 rounded-md bg-background shadow-sm"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            ) : null}
            <span className="relative z-10 flex items-center gap-1.5">
              <w.icon className="size-3.5 shrink-0" />
              {w.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function Sidebar() {
  const isActive = useIsActive();
  const [wing, switchWing] = useWing();
  const items = wing === "transactional" ? TRANSACTIONAL_ITEMS : MARKETING_ITEMS;
  const cta =
    wing === "transactional"
      ? { href: "/messages/new", label: "Send email", icon: Send }
      : { href: "/campaigns", label: "New campaign", icon: Megaphone };

  return (
    // w-72 so "Transactional" / "Templates & blocks" render in full — no ellipsis.
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col border-r bg-card md:flex">
      <div className="flex h-16 items-center border-b px-5">
        <Link href="/" aria-label="rootmail">
          <Logo />
        </Link>
      </div>

      <LayoutGroup id="sidebar">
        <div className="space-y-3 px-3 py-4">
          <Link href={cta.href} className={cn(buttonVariants({ size: "sm" }), "w-full")}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={cta.href}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12 }}
                className="flex items-center gap-2"
              >
                <cta.icon className="size-4" /> {cta.label}
              </motion.span>
            </AnimatePresence>
          </Link>
          <div className="space-y-1">
            {SHARED_TOP.map((it) => (
              <NavLink key={it.href} item={it} isActive={isActive} indicatorId="nav-active" />
            ))}
          </div>
          <div>
            <WingSwitcher wing={wing} onSwitch={switchWing} thumbId="wing-thumb" />
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={wing}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="mt-1.5 px-1 text-[11px] leading-snug text-muted-foreground/70"
              >
                {WING_HINT[wing]}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
          {/* The wing's own sections slide as one panel when you switch. */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={wing}
              initial={{ opacity: 0, x: wing === "marketing" ? 16 : -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: wing === "marketing" ? -16 : 16 }}
              transition={{ type: "spring", stiffness: 380, damping: 34 }}
              className="space-y-1"
            >
              {items.map((it) => (
                <NavLink key={it.href} item={it} isActive={isActive} indicatorId="nav-active" />
              ))}
            </motion.div>
          </AnimatePresence>
          <div className="space-y-1">
            <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {SHARED_WORKSPACE.label}
            </p>
            {SHARED_WORKSPACE.items.map((it) => (
              <NavLink key={it.href} item={it} isActive={isActive} indicatorId="nav-active" />
            ))}
          </div>
        </nav>
      </LayoutGroup>

      <div className="space-y-2 border-t px-5 py-3">
        <Link
          href="/assistant"
          className="flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <Sparkles className="size-3.5" /> Ask the assistant for help
        </Link>
        <Link
          href="/contact?topic=support"
          className="flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <LifeBuoy className="size-3.5" /> Contact support
        </Link>
      </div>
    </aside>
  );
}

export function MobileNav() {
  const isActive = useIsActive();
  const [wing, switchWing] = useWing();
  const items = wing === "transactional" ? TRANSACTIONAL_ITEMS : MARKETING_ITEMS;
  const shown = [...SHARED_TOP, ...items, ...SHARED_WORKSPACE.items];

  return (
    <div className="border-b bg-card md:hidden">
      <div className="px-3 pt-2">
        <WingSwitcher wing={wing} onSwitch={switchWing} thumbId="wing-thumb-mobile" />
      </div>
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
