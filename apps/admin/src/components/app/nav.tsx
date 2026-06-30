"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Building2, Contact, LayoutDashboard, LifeBuoy, Megaphone, Newspaper, Tag, Ticket, UserCog } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/orgs", label: "Organizations", icon: Building2 },
  { href: "/leads", label: "Leads", icon: Contact },
  { href: "/support", label: "Support", icon: LifeBuoy },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/pricing", label: "Pricing", icon: Tag },
  { href: "/promotions", label: "Promotions", icon: Ticket },
  { href: "/announcements", label: "Announcements", icon: Megaphone },
  { href: "/content", label: "Content", icon: Newspaper },
  { href: "/staff", label: "Staff", icon: UserCog },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="space-y-1">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            isActive(pathname, it.href)
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
        >
          <it.icon className="size-4" />
          {it.label}
        </Link>
      ))}
    </nav>
  );
}

/** Horizontal nav shown on small screens, where the sidebar is hidden. */
export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto border-b bg-card px-3 py-2 md:hidden">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className={cn(
            "flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            isActive(pathname, it.href)
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
        >
          <it.icon className="size-4" />
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
