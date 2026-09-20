"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";
import {
  AtSign,
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
    // Reaching customers, not administering them. "Our workspace" leads because
    // it is the door into the real product — the announcement composer here is
    // the narrow broadcast case, not the place to build our email.
    label: "Our email",
    items: [
      { href: "/our-workspace", label: "Our workspace", icon: AtSign },
      { href: "/announcements", label: "Announcements", icon: Megaphone },
    ],
  },
  {
    label: "Content",
    items: [{ href: "/content", label: "Content", icon: Newspaper }],
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
  const reducedMotion = useReducedMotion();
  return (
    <nav aria-label="Staff navigation" className="space-y-5">
      {groups.map((g, gi) => (
        <div key={g.label ?? gi} className="space-y-1">
          {g.label ? (
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {g.label}
            </p>
          ) : null}
          {g.items.map((it) => {
            const active = isActive(it.href, it.exact);
            return (
              <Link
                key={it.href}
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {/* The highlight GLIDES to the section you open (shared layoutId). */}
                {active ? (
                  <motion.span
                    layoutId={reducedMotion ? undefined : "admin-nav-active"}
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
  const pathname = usePathname();
  const rail = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = rail.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav && active) nav.scrollLeft = active.offsetLeft - nav.offsetLeft - (nav.clientWidth - active.clientWidth) / 2;
  }, [pathname]);
  return (
    <nav ref={rail} aria-label="Staff navigation" className="relative flex min-w-0 gap-1 overflow-x-auto border-b bg-card px-3 py-2 md:hidden">
      {allItems.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          aria-current={isActive(it.href, it.exact) ? "page" : undefined}
          className={cn(
            "flex min-h-11 items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
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
