"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  CreditCard,
  FileCheck2,
  FileText,
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
} from "lucide-react";
import { Logo } from "./logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: typeof Mail; exact?: boolean };
type NavGroup = { label?: string; items: NavItem[] };

// Grouped so the dashboard reads as a product, not a flat dump of 20 links.
// Everyday senders live up top; the "Developers" group (keys/webhooks/sub-tenants)
// is clearly set apart so non-technical users can simply ignore it.
const groups: NavGroup[] = [
  {
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard, exact: true },
      { href: "/assistant", label: "Assistant", icon: Sparkles },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/deliverability", label: "Deliverability", icon: Gauge },
    ],
  },
  {
    label: "Messaging",
    items: [
      { href: "/messages", label: "Messages", icon: Mail },
      { href: "/campaigns", label: "Campaigns", icon: Megaphone },
      { href: "/sequences", label: "Sequences", icon: Workflow },
      { href: "/inbox", label: "Inbox", icon: Inbox },
    ],
  },
  {
    label: "Content",
    items: [
      { href: "/templates", label: "Templates", icon: FileText },
      { href: "/assets", label: "Assets", icon: Images },
    ],
  },
  {
    label: "Audience",
    items: [
      { href: "/contacts", label: "Contacts", icon: Users },
      { href: "/lists", label: "Lists", icon: ListChecks },
      { href: "/import", label: "Import", icon: Upload },
    ],
  },
  {
    label: "Workspace",
    items: [
      { href: "/billing", label: "Plan & usage", icon: CreditCard },
      { href: "/members", label: "Team", icon: UserCog },
      { href: "/roles", label: "Roles", icon: ShieldCheck },
      { href: "/compliance", label: "Compliance", icon: FileCheck2 },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
  {
    label: "Developers",
    items: [
      { href: "/api-keys", label: "API keys", icon: KeyRound },
      { href: "/webhooks", label: "Webhooks", icon: Webhook },
      { href: "/sub-tenants", label: "Sub-tenants", icon: Network },
      { href: "/docs", label: "Docs", icon: BookOpen },
    ],
  },
];

const items: NavItem[] = groups.flatMap((g) => g.items);

function useIsActive() {
  const pathname = usePathname();
  return (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const isActive = useIsActive();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r bg-card md:flex">
      <div className="flex h-16 items-center border-b px-5">
        <Link href="/" aria-label="rootmail">
          <Logo />
        </Link>
      </div>
      <div className="px-3 py-4">
        <Link href="/messages/new" className={cn(buttonVariants({ size: "sm" }), "w-full")}>
          <Send className="size-4" /> Compose
        </Link>
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
        {groups.map((group, gi) => (
          <div key={group.label ?? gi} className="space-y-1">
            {group.label ? (
              <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {group.label}
              </p>
            ) : null}
            {group.items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive(it.href, it.exact)
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
              >
                <it.icon className="size-4" /> {it.label}
              </Link>
            ))}
          </div>
        ))}
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
  return (
    <nav className="flex gap-1 overflow-x-auto border-b bg-card px-3 py-2 md:hidden">
      {items.map((it) => (
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
  );
}
