import { Badge, type BadgeProps } from "@/components/ui/badge";

/**
 * A message status, drawn under the rendering law (§3, and the standing
 * correction in §9.8).
 *
 * The old map said `opened: "success"` and `clicked: "success"` — the same
 * green, at the same weight, as `delivered`. That is the industry's founding
 * lie in eleven characters: a delivery is a provider telling us it took the
 * message, and an open is a tracking pixel firing, roughly a third of which are
 * a mail client prefetching an image. They are not the same kind of fact and
 * they no longer look like the same kind of fact — an inference renders hollow,
 * exactly as its station does on the line.
 *
 * `suppressed` moved too. It is not a warning about something that happened to
 * us; it is something WE did, which is what `acted` means.
 */
const MAP: Record<string, BadgeProps["variant"]> = {
  delivered: "witnessed",
  sent: "witnessed",
  opened: "inferred",
  clicked: "inferred",
  queued: "muted",
  scheduled: "muted",
  sending: "muted",
  bounced: "stopped",
  complained: "stopped",
  failed: "stopped",
  suppressed: "acted",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={MAP[status] ?? "muted"}>{status}</Badge>;
}
