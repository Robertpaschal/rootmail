import { Badge } from "@/components/ui/badge";
import { REPUTATION_VISUAL } from "@/lib/reputation";
import type {
  ContactStatus,
  MessageStatus,
  ReputationState,
  SubTenantStatus,
  ThreadStatus,
} from "@/lib/types";

type Variant = "default" | "secondary" | "success" | "warning" | "destructive" | "muted";

const messageVariant: Record<MessageStatus, Variant> = {
  queued: "secondary",
  sending: "warning",
  sent: "default",
  delivered: "success",
  bounced: "destructive",
  complained: "destructive",
  failed: "destructive",
  suppressed: "muted",
};

export function MessageStatusBadge({ status }: { status: MessageStatus }) {
  return <Badge variant={messageVariant[status] ?? "secondary"}>{status}</Badge>;
}

const subTenantVariant: Record<SubTenantStatus, Variant> = {
  pending_verification: "warning",
  verifying: "warning",
  verified: "success",
  failed: "destructive",
  disabled: "muted",
};

export function SubTenantStatusBadge({ status }: { status: SubTenantStatus }) {
  return <Badge variant={subTenantVariant[status] ?? "secondary"}>{status.replace(/_/g, " ")}</Badge>;
}

/**
 * How a client's mail is LANDING — deliberately a second badge rather than more
 * values on the one above.
 *
 * They are different axes and they can disagree: a client whose DNS verifies
 * perfectly can be paused for complaints, and until now this screen showed only
 * the DNS side, so an automatically paused client read as "verified". Collapsing
 * the two into one badge just moves the contradiction somewhere it can't be seen.
 */
export function ReputationBadge({
  state,
  className,
}: {
  state: ReputationState;
  className?: string;
}) {
  const v = REPUTATION_VISUAL[state] ?? REPUTATION_VISUAL.ok;
  return (
    <Badge variant={v.badge} className={className}>
      <span aria-hidden className={`size-1.5 rounded-full ${v.dot}`} />
      {v.label}
    </Badge>
  );
}

const contactVariant: Record<ContactStatus, Variant> = {
  active: "success",
  unsubscribed: "muted",
  bounced: "destructive",
  complained: "destructive",
};

export function ContactStatusBadge({ status }: { status: ContactStatus }) {
  return <Badge variant={contactVariant[status] ?? "secondary"}>{status}</Badge>;
}

export function ThreadStatusBadge({ status }: { status: ThreadStatus }) {
  if (status === "needs_reply") return <Badge variant="warning">Needs reply</Badge>;
  if (status === "closed") return <Badge variant="muted">Closed</Badge>;
  return <Badge variant="secondary">Open</Badge>;
}
