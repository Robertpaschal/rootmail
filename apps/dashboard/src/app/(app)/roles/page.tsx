import { redirect } from "next/navigation";

// Roles are a facet of the team, not a standalone silo — folded into the Team
// hub. This route survives only so old links keep working.
export default function RolesPage() {
  redirect("/members?tab=roles");
}
