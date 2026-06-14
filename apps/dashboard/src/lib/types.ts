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

export interface User {
  id: string;
  object: "user";
  email: string;
  name: string | null;
  email_verified: boolean;
  created_at: string;
}

export interface Workspace {
  id: string;
  object: "workspace";
  name: string;
  slug: string;
  environment: "live" | "test";
  region: string;
  created_at: string;
}

export interface MeResult {
  user: User;
  workspaces: Workspace[];
  active_workspace: Workspace | null;
}

export type PlanId = "free" | "pro" | "scale" | "enterprise";

export interface Plan {
  id: PlanId;
  name: string;
  price: number | null;
  monthly_quota: number;
  allow_overage: boolean;
  overage_per_1000: number;
  included_sub_tenants: number;
  seats: number;
  features: string[];
}

export interface BillingSummaryLine {
  label: string;
  kind: string;
  amount: number;
}

export interface BillingSummary {
  currency: string;
  custom: boolean;
  lines: BillingSummaryLine[];
  seats: { included: number; purchased: number; unit_price: number };
  add_ons: { id: string; name: string; quantity: number; unit_amount: number; amount: number }[];
  total: number;
}

export interface Billing {
  object: "billing";
  organization_id: string;
  billing_mode: "stripe" | "local";
  plan_status: string;
  plan: Plan;
  usage: {
    period: string;
    used: number;
    quota: number;
    remaining: number;
    overage: number;
    overage_cost: number;
    over_limit: boolean;
  };
  summary: BillingSummary;
  plans: Plan[];
}

export type CheckoutResponse =
  | { object: "checkout"; mode: "stripe"; url: string }
  | { object: "checkout"; mode: "local"; billing: Billing };

export interface AuthSession extends MeResult {
  session_token: string;
  session_expires_at: string;
}

export interface SignupResult extends AuthSession {
  workspace: Workspace;
  api_key: CreatedApiKey;
}

export type ThreadStatus = "open" | "needs_reply" | "closed";

export interface ThreadMessage {
  id: string;
  object: "thread_message";
  direction: "outbound" | "inbound";
  message_id: string | null;
  from: string;
  to: string;
  body_html: string | null;
  body_text: string | null;
  created_at: string;
}

export interface Thread {
  id: string;
  object: "thread";
  subject: string;
  status: ThreadStatus;
  contact_email: string;
  sub_tenant_id: string | null;
  last_message_at: string;
  created_at: string;
  messages?: ThreadMessage[];
}

export type TemplateType = "transactional" | "marketing" | "sales" | "any";

export interface Template {
  id: string;
  object: "template";
  name: string;
  slug: string;
  type: TemplateType;
  subject: string;
  html: string;
  text: string | null;
  blocks: Record<string, unknown> | null;
  variables_schema: Record<string, unknown>;
  current_version: number;
  sub_tenant_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiKey {
  id: string;
  object: "api_key";
  name: string;
  prefix: string;
  last4: string;
  mode: "live" | "test";
  revoked: boolean;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

/** Only returned by POST /v1/api-keys — the full secret, shown exactly once. */
export interface CreatedApiKey extends ApiKey {
  key: string;
}

export interface ListResponse<T> {
  object: "list";
  data: T[];
}
