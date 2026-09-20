"use client";

import { usePathname } from "next/navigation";
import { logout } from "@/app/actions";
import { SubmitButton } from "@/components/app/submit-button";
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
  "our-workspace": "Our workspace",
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
    <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-3 border-b bg-card px-4 sm:px-6">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm">
        <span className="text-muted-foreground">Internal admin</span>
        <span aria-hidden="true" className="text-muted-foreground">/</span>
        <span className="break-words font-medium">{section}</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 rounded-full border bg-background py-1 pl-1 pr-3 sm:flex">
          <span className="grid size-6 place-items-center rounded-full bg-primary/10 text-[12px] font-semibold text-foreground">
            {initials(staff)}
          </span>
          <span className="text-xs font-medium">{staff.name ?? staff.email}</span>
          <Badge variant="muted" className="text-[12px]">
            {staff.role}
          </Badge>
        </div>
        <form action={logout}>
          <SubmitButton variant="outline" size="sm" pendingLabel="Signing out…">
            Sign out
          </SubmitButton>
        </form>
      </div>
    </header>
  );
}
