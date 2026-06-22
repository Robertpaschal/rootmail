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
  mfa_enabled: boolean;
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
  /** True when a staff member is impersonating this user for support. */
  impersonating?: boolean;
}

export type PlanId = "free" | "pro" | "scale" | "enterprise";

export interface Organization {
  object: "organization";
  id: string;
  name: string;
  plan: PlanId;
  postal_address: string | null;
}

export interface Plan {
  id: PlanId;
  name: string;
  price: number | null;
  price_yearly: number | null;
  monthly_quota: number;
  allow_overage: boolean;
  overage_per_1000: number;
  included_sub_tenants: number;
  seats: number;
  trial_days: number;
  ai_credits: number;
  features: string[];
  // Public sale (null when not on sale); prices are the already-discounted amounts.
  sale_percent_off: number | null;
  sale_ends_at: string | null;
  sale_price: number | null;
  sale_price_yearly: number | null;
}

export type AddonId = "extra_seat" | "dedicated_ip" | "subtenant_pack" | "ai_credit_pack";

export interface BillingAddonLine {
  id: string;
  name: string;
  quantity: number;
  unit_amount: number;
  original_unit_amount: number | null;
  sale_percent_off: number | null;
  amount: number;
}

export interface AddonCatalogItem {
  id: string;
  name: string;
  unit: string;
  description: string;
  unit_amount: number;
  sale_percent_off: number | null;
  sale_price: number | null;
  sale_ends_at: string | null;
}

export interface BillingSummaryLine {
  label: string;
  kind: string;
  amount: number;
}

export interface BillingSummary {
  currency: string;
  interval: "month" | "year";
  custom: boolean;
  lines: BillingSummaryLine[];
  seats: { included: number; purchased: number; used: number; capacity: number; unit_price: number };
  add_ons: BillingAddonLine[];
  monthly_total: number;
  yearly_option: { plan_amount: number; equivalent_monthly: number; savings_vs_monthly: number } | null;
  total: number;
}

export interface Billing {
  object: "billing";
  organization_id: string;
  billing_mode: "stripe" | "local";
  billing_interval: "month" | "year";
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
  addons_catalog: AddonCatalogItem[];
}

export interface Member {
  id: string;
  user_id: string;
  email: string;
  name: string | null;
  role: string;
  created_at: string;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: string;
  expires_at: string;
}

export type SequenceStepDef =
  | { type: "wait"; hours: number }
  | { type: "send"; template: string }
  | { type: "branch"; event: "opened" | "clicked"; within_hours: number; goto: number };

export interface SequenceTriggerDef {
  type: "manual" | "contact_created" | "contact_tagged";
  tag?: string;
}

export interface Sequence {
  object: "sequence";
  id: string;
  name: string;
  status: "active" | "paused";
  trigger: SequenceTriggerDef;
  steps: SequenceStepDef[];
  exit_on: string[];
  created_at: string;
}

export interface Enrollment {
  object: "enrollment";
  id: string;
  sequence_id: string;
  email: string;
  status: string;
  current_step: number;
  next_run_at: string;
  created_at: string;
}

export interface ContactList {
  object: "contact_list";
  id: string;
  name: string;
  description: string | null;
  contacts: number;
  created_at: string;
}

export interface Campaign {
  object: "campaign";
  id: string;
  name: string;
  list_id: string | null;
  template_id: string | null;
  subject: string | null;
  from_email: string | null;
  status: "draft" | "scheduled" | "sending" | "sent";
  scheduled_at: string | null;
  sent_at: string | null;
  stats: { recipients: number; sent: number; suppressed: number; failed: number };
  created_at: string;
}

export interface AssistantResponse {
  object: "assistant_response";
  reply: string;
  actions: { tool: string; status: number }[];
  source: "claude" | "mock";
  credits: { used: number; allowance: number };
}

export interface ProofResponse {
  object: "proof";
  bundle: Record<string, unknown>;
  signature: string;
  public_key: string;
  algorithm: string;
}

export interface Role {
  object: "role";
  id: string;
  key: string;
  name: string;
  permissions: string[];
  created_at: string;
}

export interface RolesResult {
  object: "list";
  permissions: string[];
  system_roles: Record<string, string[]>;
  data: Role[];
}

export interface MembersResult {
  object: "members";
  seats: { included: number; purchased: number; used: number; capacity: number; remaining: number };
  members: Member[];
  invitations: PendingInvite[];
}

export type CheckoutResponse =
  | { object: "checkout"; mode: "stripe"; url: string }
  | { object: "checkout"; mode: "local"; billing: Billing };

export type EmbeddedCheckoutResponse =
  | { object: "embedded_checkout"; available: true; client_secret: string; publishable_key: string }
  | { object: "embedded_checkout"; available: false };

export interface AiDraftResponse {
  object: "ai_draft";
  subject: string;
  blocks: Record<string, unknown>;
  source: "claude" | "mock";
  credits: { used: number; allowance: number };
}

export interface UploadedAsset {
  object: "asset";
  id: string;
  url: string;
  content_type: string;
  size: number;
  filename: string;
}

export interface Asset extends UploadedAsset {
  created_at: string;
}

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
  error: string | null;
  created_at: string;
}

export interface AuthSession extends MeResult {
  session_token: string;
  session_expires_at: string;
}

export interface SignupResult extends AuthSession {
  workspace: Workspace;
  api_key: CreatedApiKey;
}

/** Login either returns a session, or — when MFA is on — a short-lived challenge
 * the client completes at /v1/auth/mfa/verify. */
export interface MfaChallenge {
  mfa_required: true;
  mfa_token: string;
}
export type LoginResult = AuthSession | MfaChallenge;

export interface MfaSetup {
  secret: string;
  otpauth_uri: string;
}
export interface MfaActivated {
  enabled: boolean;
  recovery_codes: string[];
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

export interface DeliverabilityFactor {
  id: string;
  severity: "info" | "warning" | "critical";
  label: string;
  detail: string;
}

export interface EmailAuthItem {
  mechanism: "spf" | "dkim" | "dmarc" | "bimi";
  status: "pass" | "weak" | "missing" | "blocked";
  label: string;
  detail: string;
  recommendation: string | null;
  record: { type: "TXT"; host: string; value: string } | null;
  found: string[];
}

export interface EmailAuthReport {
  object: "email_auth";
  sub_tenant_id: string;
  domain: string;
  mode: "mock" | "live";
  dmarc_policy: "none" | "quarantine" | "reject" | null;
  items: EmailAuthItem[];
  summary: { passing: number; total: number; enforced: boolean };
}

export interface Analytics {
  object: "analytics";
  window_days: number;
  scope: { sub_tenant_id: string | null };
  funnel: { sent: number; delivered: number; opened: number; clicked: number };
  rates: { delivery: number; open: number; click: number; click_to_open: number };
  series: { date: string; sent: number }[];
  top_templates: {
    template_id: string | null;
    name: string;
    sent: number;
    delivered: number;
    delivered_rate: number;
  }[];
}

export interface RetentionPolicy {
  object: "retention";
  retention_days: number | null;
  retention_mode: "redact" | "delete";
  affected_now: number;
}

export interface ComplianceExport {
  object: "compliance_export";
  bundle: {
    workspace_id: string;
    sub_tenant_id: string | null;
    range: { from: string; to: string };
    generated_at: string;
    message_count: number;
    messages: unknown[];
  };
  signature: string;
  public_key: string;
  algorithm: "ed25519";
}

export interface Deliverability {
  object: "deliverability";
  scope: { sub_tenant_id: string | null };
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
  status: "no_data" | "excellent" | "good" | "at_risk" | "critical";
  confidence: "none" | "low" | "high";
  factors: DeliverabilityFactor[];
  recommendations: string[];
}
