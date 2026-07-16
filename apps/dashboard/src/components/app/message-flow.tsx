import { MessageStatusBadge } from "./status-badge";
import type { Message } from "@/lib/types";
import { cn } from "@/lib/utils";

// Compact per-row lifecycle: five dots (Queued → Sent → Delivered → Opened →
// Clicked) plus the furthest thing that actually happened, read from engagement
// timestamps — the stored status caps at "delivered", so an opened/clicked email
// would otherwise still read "delivered" in every list. Problem states keep
// their loud badge.

const BAD = new Set(["bounced", "complained", "failed", "suppressed"]);
const STAGES = 5;

type FlowInput = Pick<Message, "status" | "opened_at" | "clicked_at">;

function furthest(m: FlowInput): { stage: number; label: string } {
  if (m.clicked_at) return { stage: 5, label: "Clicked" };
  if (m.opened_at) return { stage: 4, label: "Opened" };
  switch (m.status) {
    case "delivered":
      return { stage: 3, label: "Delivered" };
    case "sent":
      return { stage: 2, label: "Sent" };
    case "sending":
      return { stage: 1, label: "Sending" };
    default:
      return { stage: 1, label: "Queued" };
  }
}

export function MessageFlow({ message }: { message: FlowInput }) {
  if (BAD.has(message.status)) return <MessageStatusBadge status={message.status} />;
  const { stage, label } = furthest(message);
  const landed = stage >= 3; // reached the inbox (or further)
  const title = `Queued → Sent → Delivered → Opened → Clicked · ${label}`;
  return (
    <span className="inline-flex items-center gap-2" title={title}>
      <span className="flex items-center gap-1" aria-hidden>
        {Array.from({ length: STAGES }, (_, idx) => idx + 1).map((i) => (
          <span
            key={i}
            className={cn(
              "size-1.5 rounded-full",
              i <= stage ? (landed ? "bg-emerald-500" : "bg-blue-500") : "bg-border",
            )}
          />
        ))}
      </span>
      <span
        className={cn(
          "text-xs font-medium",
          landed ? "text-emerald-600 dark:text-emerald-400" : "text-blue-600 dark:text-blue-400",
        )}
      >
        {label}
      </span>
    </span>
  );
}
