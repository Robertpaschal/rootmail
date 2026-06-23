export type MessageType = "transactional" | "marketing" | "sales";
export type Priority = "high" | "normal" | "low";
export type ContactStatus = "active" | "unsubscribed" | "bounced" | "complained";

export interface Address {
  email: string;
  name?: string;
}

export interface SendParams {
  to: string | Address;
  from?: string | Address;
  replyTo?: string;
  subject?: string;
  template?: string;
  templateId?: string;
  variables?: Record<string, unknown>;
  html?: string;
  text?: string;
  type?: MessageType;
  priority?: Priority;
  tags?: string[];
  metadata?: Record<string, unknown>;
  sendAt?: string | Date;
  idempotencyKey?: string;
  subTenantId?: string;
}

export interface Message {
  id: string;
  object: "message";
  type: MessageType;
  status: string;
  to: string;
  from: Address;
  subject: string;
  provider_message_id: string | null;
  content_hash: string | null;
  created_at: string;
  [key: string]: unknown;
}

export interface ListResponse<T> {
  object: "list";
  data: T[];
}

export interface AuditEvent {
  event: string;
  timestamp: string;
  [key: string]: unknown;
}

export interface AuditTrail {
  message_id: string;
  status: string;
  trail: AuditEvent[];
}

export interface CreateSubTenantParams {
  name: string;
  externalId?: string;
  sendingDomain: string;
  inheritsTemplatesFrom?: "parent" | "none";
}

export interface DnsRecord {
  purpose: "ownership" | "dkim" | "spf";
  type: "TXT";
  host: string;
  value: string;
  required: boolean;
}

export interface SubTenant {
  id: string;
  object: "sub_tenant";
  name: string;
  sending_domain: string;
  status: string;
  dns_records?: DnsRecord[];
  [key: string]: unknown;
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

export interface VerifyResult extends SubTenant {
  verified: boolean;
  checks: DnsCheck[];
}

export interface UpsertContactParams {
  email: string;
  name?: string;
  phone?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  status?: ContactStatus;
}

export interface Contact {
  id: string;
  object: "contact";
  email: string;
  status: string;
  [key: string]: unknown;
}

// --- Templates ---
export interface Template {
  id: string;
  object: "template";
  name: string;
  slug: string;
  type: string;
  subject: string;
  [key: string]: unknown;
}
export interface CreateTemplateParams {
  name: string;
  slug: string;
  type: MessageType | "any";
  subject: string;
  html: string;
  text?: string;
}
export type UpdateTemplateParams = Partial<CreateTemplateParams>;

// --- Sequences ---
export interface Sequence {
  id: string;
  object: "sequence";
  name: string;
  status: "active" | "paused";
  [key: string]: unknown;
}
export interface Enrollment {
  id: string;
  object: "enrollment";
  email: string;
  status: string;
  [key: string]: unknown;
}

// --- Lists & campaigns ---
export interface ContactList {
  id: string;
  name: string;
  [key: string]: unknown;
}
export interface Campaign {
  id: string;
  object: "campaign";
  name: string;
  status: string;
  [key: string]: unknown;
}

// --- Threads (Layer 2 conversations) ---
export interface Thread {
  id: string;
  object: "thread";
  status: string;
  [key: string]: unknown;
}

// --- Proof bundle (Layer 3) ---
export interface ProofBundle {
  [key: string]: unknown;
}

// --- Webhook endpoints ---
export interface WebhookEndpoint {
  object: "webhook_endpoint";
  id: string;
  url: string;
  events: string[];
  description: string | null;
  status: "active" | "disabled";
  disabled_at: string | null;
  created_at: string;
}
/** Returned only from `create` — carries the signing secret, shown once. */
export interface CreatedWebhookEndpoint extends WebhookEndpoint {
  secret: string;
}
export interface WebhookDelivery {
  object: "webhook_delivery";
  id: string;
  event: string;
  status: string;
  attempt: number;
  response_status: number | null;
  created_at: string;
}
export interface CreateWebhookParams {
  url: string;
  events?: string[];
  description?: string;
}
export interface UpdateWebhookParams {
  url?: string;
  events?: string[];
  description?: string | null;
  status?: "active" | "disabled";
}

// --- Insights, compliance, migration, assistant ---------------------------

export interface Deliverability {
  object: "deliverability";
  window_days: number;
  volume: {
    total: number;
    delivered: number;
    bounced: number;
    complained: number;
    failed: number;
    suppressed: number;
    in_flight: number;
  };
  rates: { delivery: number; bounce: number; complaint: number; failure: number };
  suppressions: { total: number; by_reason: Record<string, number> };
  domains: { total: number; verified: number; unverified: number };
  score: number | null;
  grade: "A" | "B" | "C" | "D" | "F" | null;
  status: string;
  confidence: string;
  factors: { id: string; severity: string; label: string; detail: string }[];
  recommendations: string[];
}

export interface Analytics {
  object: "analytics";
  window_days: number;
  funnel: { sent: number; delivered: number; opened: number; clicked: number };
  rates: { delivery: number; open: number; click: number; click_to_open: number };
  series: { date: string; sent: number }[];
  top_templates: { template_id: string | null; name: string; sent: number; delivered: number; delivered_rate: number }[];
}

export interface EmailAuthReport {
  object: "email_auth";
  sub_tenant_id: string;
  domain: string;
  mode: "mock" | "live";
  dmarc_policy: "none" | "quarantine" | "reject" | null;
  items: {
    mechanism: string;
    status: string;
    label: string;
    detail: string;
    recommendation: string | null;
    record: { type: string; host: string; value: string } | null;
    found: string[];
  }[];
  summary: { passing: number; total: number; enforced: boolean };
}

export interface ComplianceExport {
  object: "compliance_export";
  bundle: Record<string, unknown>;
  signature: string;
  public_key: string;
  algorithm: "ed25519";
}

export interface RetentionPolicy {
  object: "retention";
  retention_days: number | null;
  retention_mode: "redact" | "delete";
  affected_now: number;
}

export interface ImportResult {
  object: "import_result";
  kind: "suppressions" | "contacts";
  total: number;
  imported: number;
  invalid: number;
  duplicates?: number;
  existing?: number;
  list_id?: string | null;
  added_to_list?: number;
}

export interface AssistantResponse {
  object: "assistant_response";
  reply: string;
  actions: { tool: string; status: number }[];
  source: "claude" | "mock";
  credits: { used: number; allowance: number };
}

export interface SuppressionCheck {
  email: string;
  suppressed: boolean;
}

export interface Billing {
  object: "billing";
  plan_status: string;
  plan: {
    id: string;
    name: string;
    price: number | null;
    monthly_quota: number;
    ai_credits: number;
    features: string[];
  };
  usage: { period: string; used: number; quota: number; remaining: number; overage: number };
}
