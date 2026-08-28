import { Badge } from "@/components/ui/badge";

/**
 * draft/published, shared by the content list and both editors.
 *
 * A publication state is not a MESSAGE state, so it does not get a signal
 * colour (§9.7): green here would be the same green the console uses for "a
 * provider confirmed delivery", spent on a CMS row. The two are told apart by
 * their label and by ink weight — published is present, draft is receded.
 */
export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === "published" ? "outline" : "muted"}>{status}</Badge>
  );
}
