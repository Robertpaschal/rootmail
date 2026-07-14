"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DOCS } from "@rootmail/docs";
import { cn } from "@/lib/utils";

/** The docs left rail: sections → pages, active page highlighted. */
export function DocsSidebar() {
  const pathname = usePathname();
  return (
    <nav className="space-y-6">
      {DOCS.map((section) => (
        <div key={section.label}>
          <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {section.label}
          </p>
          <ul className="space-y-0.5">
            {section.pages.map((page) => {
              const href = `/docs/${page.slug}`;
              const active = pathname === href;
              return (
                <li key={page.slug}>
                  <Link
                    href={href}
                    className={cn(
                      "block rounded-md px-2 py-1.5 text-sm transition-colors",
                      active
                        ? "bg-secondary font-medium text-foreground"
                        : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                    )}
                  >
                    {page.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
