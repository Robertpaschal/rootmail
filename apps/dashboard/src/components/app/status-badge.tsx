import { Badge } from "@/components/ui/badge";
import type { ContactStatus, MessageStatus, SubTenantStatus } from "@/lib/types";

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

const contactVariant: Record<ContactStatus, Variant> = {
  active: "success",
  unsubscribed: "muted",
  bounced: "destructive",
  complained: "destructive",
};

export function ContactStatusBadge({ status }: { status: ContactStatus }) {
  return <Badge variant={contactVariant[status] ?? "secondary"}>{status}</Badge>;
}
