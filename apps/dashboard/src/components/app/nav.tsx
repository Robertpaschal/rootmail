"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  CreditCard,
  FileCheck2,
  FileText,
  FlaskConical,
  Gauge,
  Upload,
  Images,
  Inbox,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
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

const SHARED_TOP: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/assistant", label: "Assistant", icon: Sparkles },
];

const TRANSACTIONAL_ITEMS: NavItem[] = [
  { href: "/messages", label: "Messages", icon: Mail },
  { href: "/templates", label: "Templates & blocks", icon: FileText },
  { href: "/assets", label: "Assets", icon: Images },
  { href: "/api-keys", label: "API keys", icon: KeyRound },
  { href: "/webhooks", label: "Webhooks", icon: Webhook },
  { href: "/deliverability", label: "Deliverability", icon: Gauge },
  { href: "/sub-tenants", label: "Domains", icon: Network },
  { href: "/test-inbox", label: "Test inbox", icon: FlaskConical },
  { href: "/docs", label: "Docs", icon: BookOpen },
];

const MARKETING_ITEMS: NavItem[] = [
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/sequences", label: "Sequences", icon: Workflow },
  { href: "/inbox", label: "Replies", icon: Inbox },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/lists", label: "Lists", icon: ListChecks },
  { href: "/import", label: "Import", icon: Upload },
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
// tools (/templates, /assets) live in both wings, so they don't force a switch.
const TX_ROUTES = ["/messages", "/api-keys", "/webhooks", "/deliverability", "/sub-tenants", "/test-inbox", "/docs"];
const MK_ROUTES = ["/campaigns", "/sequences", "/inbox", "/contacts", "/lists", "/import", "/analytics"];

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

function NavLink({ item, isActive }: { item: NavItem; isActive: (h: string, e?: boolean) => boolean }) {
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        isActive(item.href, item.exact)
          ? "bg-secondary text-foreground"
          : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
      )}
    >
      <item.icon className="size-4" /> {item.label}
    </Link>
  );
}

function WingSwitcher({ wing, onSwitch }: { wing: Wing; onSwitch: (w: Wing) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-lg bg-secondary/50 p-1">
      {WINGS.map((w) => (
        <button
          key={w.id}
          type="button"
          onClick={() => onSwitch(w.id)}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
            wing === w.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <w.icon className="size-3.5" /> {w.label}
        </button>
      ))}
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
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r bg-card md:flex">
      <div className="flex h-16 items-center border-b px-5">
        <Link href="/" aria-label="rootmail">
          <Logo />
        </Link>
      </div>

      <div className="space-y-3 px-3 py-4">
        <Link href={cta.href} className={cn(buttonVariants({ size: "sm" }), "w-full")}>
          <cta.icon className="size-4" /> {cta.label}
        </Link>
        <div className="space-y-1">
          {SHARED_TOP.map((it) => (
            <NavLink key={it.href} item={it} isActive={isActive} />
          ))}
        </div>
        <WingSwitcher wing={wing} onSwitch={switchWing} />
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
        <div className="space-y-1">
          {items.map((it) => (
            <NavLink key={it.href} item={it} isActive={isActive} />
          ))}
        </div>
        <div className="space-y-1">
          <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {SHARED_WORKSPACE.label}
          </p>
          {SHARED_WORKSPACE.items.map((it) => (
            <NavLink key={it.href} item={it} isActive={isActive} />
          ))}
        </div>
      </nav>

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
        <WingSwitcher wing={wing} onSwitch={switchWing} />
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
