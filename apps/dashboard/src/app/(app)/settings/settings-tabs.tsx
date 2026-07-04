"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// The genuine settings sub-pages — account/sender config that belongs *inside*
// Settings. Billing, Team, Roles, and Compliance are their own main-nav sections
// (Workspace group), so they deliberately are NOT tabs here: a settings tab
// should never eject you into a different section.
const tabs = [
  { href: "/settings/profile", label: "Profile" },
  { href: "/settings/security", label: "Security & login" },
  { href: "/settings/sender", label: "Sender address" },
  { href: "/settings/sso", label: "Single sign-on" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <div className="border-b">
      <nav className="-mb-px flex gap-1 overflow-x-auto">
        {tabs.map((t) => {
          const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
