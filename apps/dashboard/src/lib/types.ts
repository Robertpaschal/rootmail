// Shapes returned by the rootmail REST API (snake_case JSON).
// Mirrors apps/api/src/lib/serialize.ts.

export type MessageStatus =
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "bounced"
  | "complained"
  | "failed"
  | "suppressed";

export type MessageType = "transactional" | "marketing" | "sales";
export type Priority = "high" | "normal" | "low";
export type SubTenantStatus =
  | "pending_verification"
  | "verifying"
  | "verified"
  | "failed"
  | "disabled";
export type ContactStatus = "active" | "unsubscribed" | "bounced" | "complained";

export interface Address {
  email: string;
  name?: string;
}

export interface Message {
  id: string;
  object: "message";
  type: MessageType;
  status: MessageStatus;
  to: string;
  from: Address;
  reply_to: string | null;
  subject: string;
  sub_tenant_id: string | null;
  template_id: string | null;
  template_version: number | null;
  priority: Priority;
  tags: string[];
  metadata: Record<string, unknown>;
  idempotency_key: string | null;
  provider: string | null;
  provider_message_id: string | null;
  content_hash: string | null;
  rendered_html: string | null;
  rendered_text: string | null;
  sandbox: boolean;
  error: string | null;
  scheduled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditEntry {
  event: string;
  actor: string;
  ip?: string;
  user_agent?: string;
  provider?: string;
  provider_message_id?: string;
  metadata: Record<string, unknown> | null;
  timestamp: string;
}

export interface AuditTrail {
  message_id: string;
  status: MessageStatus;
  trail: AuditEntry[];
}

export interface DnsRecord {
  purpose: "ownership" | "dkim" | "spf";
  type: "TXT";
  host: string;
  value: string;
  required: boolean;
}

export interface DnsCheck {
  purpose: string;
  host: string;
  required: boolean;
  ok: boolean;
  expected: string;
  found: string[];
  detail?: string;
}

export interface SubTenant {
  id: string;
  object: "sub_tenant";
  name: string;
  external_id: string | null;
  sending_domain: string;
  status: SubTenantStatus;
  inherits_templates: boolean;
  dkim_selector: string;
  verified_at: string | null;
  last_checked_at: string | null;
  created_at: string;
  dns_records?: DnsRecord[];
}

export interface VerifyResult extends SubTenant {
  verified: boolean;
  checks: DnsCheck[];
}

export interface Contact {
  id: string;
  object: "contact";
  email: string;
  name: string | null;
  phone: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  status: ContactStatus;
  sub_tenant_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListResponse<T> {
  object: "list";
  data: T[];
}
