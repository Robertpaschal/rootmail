"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGroup, motion } from "framer-motion";
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
  Settings,
  Sparkles,
  UserCog,
  Users,
  Webhook,
  Workflow,
} from "lucide-react";
import { Logo } from "./logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: typeof Mail; exact?: boolean };
type NavGroup = { label?: string; items: NavItem[] };

/**
 * ONE sidebar, grouped by what things are FOR — no transactional/marketing flip.
 * The product core (messages ↔ replies ↔ campaigns ↔ audience ↔ templates) is a
 * single fabric the user moves through; transactional vs marketing stays a
 * PRICING and metering dimension (billing pages, analytics scopes, usage
 * meters), not a navigation wall. Sections that only make sense against real
 * infrastructure (deliverability, client domains) hide in sandbox, and the
 * sandbox-only test inbox hides in live — the nav always reflects what can
 * actually function right now.
 */
function buildGroups(opts: { sandbox: boolean; workspaceName: string | null }): NavGroup[] {
  const { sandbox, workspaceName } = opts;
  return [
    {
      items: [
        { href: "/", label: "Overview", icon: LayoutDashboard, exact: true },
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
      // Everything code-facing in one place; the sandbox-only test inbox appears
      // exactly when the workspace can use it.
      label: "Developers",
      items: [
        { href: "/api-keys", label: "API keys", icon: KeyRound },
        { href: "/webhooks", label: "Webhooks", icon: Webhook },
        { href: "/docs", label: "Docs", icon: BookOpen },
        ...(sandbox ? [{ href: "/test-inbox", label: "Test inbox", icon: FlaskConical }] : []),
      ],
    },
    {
      // Titled by the workspace the user is actually in ("Production", not the
      // abstract "Workspace"). Team carries roles + SSO inside; client domains
      // (the agency surface) needs real DNS + sending, so it's live-only.
      label: workspaceName ?? "Workspace",
      items: [
        { href: "/billing", label: "Plan & usage", icon: CreditCard },
        { href: "/members", label: "Team", icon: UserCog },
        ...(sandbox ? [] : [{ href: "/sub-tenants", label: "Client domains", icon: Network }]),
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

export interface NavContext {
  /** The active workspace's name — the "product" the user is inside. */
  workspaceName?: string | null;
  /** True when the active workspace is the sandbox (test) environment. */
  sandbox?: boolean;
}

export function Sidebar({ workspaceName = null, sandbox = false }: NavContext) {
  const isActive = useIsActive();
  const groups = buildGroups({ sandbox, workspaceName });

  return (
    // w-72 so long labels ("Proof & compliance") render in full — no ellipsis.
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col border-r bg-card md:flex">
      <div className="flex h-16 items-center border-b px-5">
        <Link href="/" aria-label="rootmail">
          <Logo />
        </Link>
      </div>

      <LayoutGroup id="sidebar">
        <div className="space-y-3 px-3 py-4">
          {/* One neutral compose action: a one-off email from here is a one-to-one
              (transactional) send; bulk lives in Campaigns. */}
          <Link href="/messages/new" className={cn(buttonVariants({ size: "sm" }), "w-full gap-2")}>
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
                <NavLink key={it.href} item={it} isActive={isActive} indicatorId="nav-active" />
              ))}
            </div>
          ))}
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
