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
