import { Badge, type BadgeProps } from "@/components/ui/badge";

const MAP: Record<string, BadgeProps["variant"]> = {
  delivered: "success",
  opened: "success",
  clicked: "success",
  sent: "default",
  queued: "muted",
  scheduled: "muted",
  sending: "default",
  bounced: "destructive",
  complained: "destructive",
  failed: "destructive",
  suppressed: "warning",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={MAP[status] ?? "muted"}>{status}</Badge>;
}
