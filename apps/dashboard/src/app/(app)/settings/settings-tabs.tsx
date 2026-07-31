"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// The genuine settings sub-pages — account/sender config that belongs *inside*
// Settings. Billing, Team (which carries roles + SSO), and Compliance are their
// own sections, so they deliberately are NOT tabs here: a settings tab should
// never eject you into a different section. They ARE listed on "All settings",
// which is a map rather than a tab — pointing at them is honest; navigating you
// out of the section mid-tab-strip is not.
const tabs = [
  { href: "/settings", label: "All settings", exact: true },
  { href: "/settings/profile", label: "Profile" },
  { href: "/settings/security", label: "Security & login" },
  { href: "/settings/sender", label: "Sending" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <div className="border-b">
      <nav className="-mb-px flex gap-1 overflow-x-auto">
        {tabs.map((t) => {
          // "All settings" is the section root, so it must match EXACTLY —
          // otherwise it would light up on every sub-page too.
          const active = t.exact
            ? pathname === t.href
            : pathname === t.href || pathname.startsWith(`${t.href}/`);
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
