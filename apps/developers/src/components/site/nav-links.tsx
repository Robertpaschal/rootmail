"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * The nav destinations, with the current one marked.
 *
 * A client island inside the server-rendered `DevNavbar` — the navbar itself
 * reads `cookies()` to know whether you are signed in, so it cannot be a client
 * component, and knowing which page you are on needs `usePathname()`. This is
 * the smaller half to split out.
 *
 * WHY THE ACTIVE TAB IS RAISED. `.nav-group` is a well cut into the island, so
 * the current page is the tab standing OUT of it: one lift per object, and the
 * page you are on is the one on top. It is opaque while the bar around it is
 * glass, deliberately — the label you most need to read is the one that should
 * never composite against whichever band happens to be scrolling underneath.
 *
 * `prefix` exists because `/docs` is really `/docs/quickstart` and thirty other
 * slugs; `Pricing` points at another origin and can never be current here, so
 * it is matched exactly and never lights up.
 */
export type NavLink = { href: string; label: string; prefix?: boolean };

export function NavLinks({ links }: { links: readonly NavLink[] }) {
  const pathname = usePathname();
  return (
    <nav className="nav-group hidden items-center gap-0.5 p-1 sm:flex">
      {links.map((l) => {
        const current = l.prefix
          ? pathname === l.href || pathname.startsWith(`${l.href}/`)
          : pathname === l.href;
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "inline-flex h-9 items-center rounded-full px-3.5 text-sm font-medium transition-colors duration-interaction ease-interaction",
              current
                ? "bg-card text-foreground shadow-e1"
                : "text-ink-muted hover:bg-card/60 hover:text-foreground",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
