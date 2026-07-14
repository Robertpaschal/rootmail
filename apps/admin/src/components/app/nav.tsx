"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  BarChart3,
  Building2,
  Contact,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  Newspaper,
  Tag,
  Ticket,
  UserCog,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: typeof Building2; exact?: boolean };
type Group = { label?: string; items: Item[] };

// Grouped by what staff are actually doing — customers, revenue, comms, insights,
// team — so the console reads as a product, not a flat list of ten links.
const groups: Group[] = [
  {
    // The two platform-wide reads live together at the top: the snapshot, then the depth.
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard, exact: true },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Customers",
    items: [
      { href: "/orgs", label: "Organizations", icon: Building2 },
      { href: "/leads", label: "Leads", icon: Contact },
      { href: "/support", label: "Support", icon: LifeBuoy },
    ],
  },
  {
    label: "Revenue",
    items: [
      { href: "/pricing", label: "Pricing", icon: Tag },
      { href: "/promotions", label: "Promotions", icon: Ticket },
    ],
  },
  {
    label: "Content",
    items: [
      { href: "/content", label: "Content", icon: Newspaper },
      { href: "/announcements", label: "Announcements", icon: Megaphone },
    ],
  },
  {
    label: "Team",
    items: [{ href: "/staff", label: "Staff", icon: UserCog }],
  },
];

const allItems = groups.flatMap((g) => g.items);

function useIsActive() {
  const pathname = usePathname();
  return (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function Nav() {
  const isActive = useIsActive();
  return (
    <nav className="space-y-5">
      {groups.map((g, gi) => (
        <div key={g.label ?? gi} className="space-y-1">
          {g.label ? (
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {g.label}
            </p>
          ) : null}
          {g.items.map((it) => {
            const active = isActive(it.href, it.exact);
            return (
              <Link
                key={it.href}
                href={it.href}
                className={cn(
                  "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {/* The highlight GLIDES to the section you open (shared layoutId). */}
                {active ? (
                  <motion.span
                    layoutId="admin-nav-active"
                    className="absolute inset-0 rounded-md bg-primary"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                ) : null}
                <span className="relative z-10 flex items-center gap-3">
                  <it.icon className="size-4 shrink-0" /> {it.label}
                </span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function MobileNav() {
  const isActive = useIsActive();
  return (
    <nav className="flex gap-1 overflow-x-auto border-b bg-card px-3 py-2 md:hidden">
      {allItems.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className={cn(
            "flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            isActive(it.href, it.exact)
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <it.icon className="size-4" /> {it.label}
        </Link>
      ))}
    </nav>
  );
}
