import { logout } from "@/app/actions";
import { SubmitButton } from "@/components/app/submit-button";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Badge } from "@/components/ui/badge";
import type { StaffUser } from "@/lib/types";

export function Topbar({ staff }: { staff: StaffUser }) {
  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-6">
      <div className="text-sm text-muted-foreground">Internal staff console</div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{staff.name ?? staff.email}</span>
          <Badge variant="muted">{staff.role}</Badge>
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
