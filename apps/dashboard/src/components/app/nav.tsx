"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CreditCard,
  FileCheck2,
  FileText,
  Gauge,
  Upload,
  Images,
  Inbox,
  KeyRound,
  LayoutDashboard,
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

const items = [
  { href: "/", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/assistant", label: "Assistant", icon: Sparkles },
  { href: "/messages", label: "Messages", icon: Mail },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/deliverability", label: "Deliverability", icon: Gauge },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/templates", label: "Templates", icon: FileText },
  { href: "/assets", label: "Assets", icon: Images },
  { href: "/sequences", label: "Sequences", icon: Workflow },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/sub-tenants", label: "Sub-tenants", icon: Network },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/lists", label: "Lists", icon: ListChecks },
  { href: "/import", label: "Import", icon: Upload },
  { href: "/api-keys", label: "API keys", icon: KeyRound },
  { href: "/webhooks", label: "Webhooks", icon: Webhook },
  { href: "/compliance", label: "Compliance", icon: FileCheck2 },
  { href: "/billing", label: "Plan & usage", icon: CreditCard },
  { href: "/members", label: "Team", icon: UserCog },
  { href: "/roles", label: "Roles", icon: ShieldCheck },
  { href: "/settings/security", label: "Settings", icon: Settings },
];

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
          <Send className="size-4" /> Send test email
        </Link>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {items.map((it) => (
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
      </nav>
      <div className="border-t px-5 py-4 text-xs text-muted-foreground">
        rootmail · Phase 1
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
