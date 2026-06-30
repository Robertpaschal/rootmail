"use client";

import { usePathname } from "next/navigation";
import { logout } from "@/app/actions";
import { SubmitButton } from "@/components/app/submit-button";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Badge } from "@/components/ui/badge";
import type { StaffUser } from "@/lib/types";

const SECTION: Record<string, string> = {
  "": "Overview",
  orgs: "Organizations",
  leads: "Leads",
  support: "Support",
  pricing: "Pricing",
  promotions: "Promotions",
  content: "Content",
  announcements: "Announcements",
  analytics: "Analytics",
  staff: "Staff",
};

function initials(staff: StaffUser): string {
  const base = (staff.name?.trim() || staff.email).trim();
  const parts = base.split(/[\s@._-]+/).filter(Boolean);
  const first = parts[0]?.[0] ?? base[0] ?? "?";
  const second = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + second).toUpperCase();
}

export function Topbar({ staff }: { staff: StaffUser }) {
  const pathname = usePathname();
  const section = SECTION[pathname.split("/")[1] ?? ""] ?? "Console";

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-card/80 px-6 backdrop-blur">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Console</span>
        <span className="text-muted-foreground/40">/</span>
        <span className="font-medium">{section}</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 rounded-full border bg-background py-1 pl-1 pr-3 sm:flex">
          <span className="grid size-6 place-items-center rounded-full bg-primary/10 text-[10px] font-semibold text-foreground">
            {initials(staff)}
          </span>
          <span className="text-xs font-medium">{staff.name ?? staff.email}</span>
          <Badge variant="muted" className="text-[10px]">
            {staff.role}
          </Badge>
        </div>
        <ThemeToggle />
        <form action={logout}>
          <SubmitButton variant="outline" size="sm" pendingLabel="Signing out…">
            Sign out
          </SubmitButton>
        </form>
      </div>
    </header>
  );
}
