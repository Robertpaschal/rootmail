import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  AUDIT_EVENTS,
  CONTACT_STATUSES,
  MEMBERSHIP_ROLES,
  MESSAGE_DIRECTIONS,
  MESSAGE_STATUSES,
  MESSAGE_TYPES,
  PLAN_IDS,
  PLAN_STATUSES,
  PRIORITIES,
  SUBTENANT_STATUSES,
  SUPPRESSION_REASONS,
  THREAD_STATUSES,
  TEMPLATE_TYPES,
  WORKSPACE_ENVIRONMENTS,
} from "@rootmail/core/constants";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const messageTypeEnum = pgEnum("message_type", MESSAGE_TYPES);
export const templateTypeEnum = pgEnum("template_type", TEMPLATE_TYPES);
export const messageStatusEnum = pgEnum("message_status", MESSAGE_STATUSES);
export const auditEventEnum = pgEnum("audit_event", AUDIT_EVENTS);
export const priorityEnum = pgEnum("priority", PRIORITIES);
export const contactStatusEnum = pgEnum("contact_status", CONTACT_STATUSES);
export const subTenantStatusEnum = pgEnum("sub_tenant_status", SUBTENANT_STATUSES);
export const suppressionReasonEnum = pgEnum("suppression_reason", SUPPRESSION_REASONS);
export const workspaceEnvironmentEnum = pgEnum("workspace_environment", WORKSPACE_ENVIRONMENTS);
export const membershipRoleEnum = pgEnum("membership_role", MEMBERSHIP_ROLES);
export const planEnum = pgEnum("plan", PLAN_IDS);
export const planStatusEnum = pgEnum("plan_status", PLAN_STATUSES);
export const threadStatusEnum = pgEnum("thread_status", THREAD_STATUSES);
export const messageDirectionEnum = pgEnum("message_direction", MESSAGE_DIRECTIONS);

// Fresh builders each call so no column instance is shared across tables.
const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

// ---------------------------------------------------------------------------
// Identity & access
// ---------------------------------------------------------------------------
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  // `scheme$salt$hash` (scrypt). Null for accounts that only use social login.
  passwordHash: text("password_hash"),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: planEnum("plan").notNull().default("free"),
  // Billing linkage. Null in local mode (no Stripe); set once a customer/
  // subscription exists in Stripe mode. planStatus mirrors the subscription.
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  planStatus: planStatusEnum("plan_status").notNull().default("active"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// Stripe webhook idempotency: every processed event id is recorded once, so a
// redelivered event is a no-op. Append-only.
export const billingEvents = pgTable("billing_events", {
  id: text("id").primaryKey(),
  stripeEventId: text("stripe_event_id").notNull().unique(),
  type: text("type").notNull(),
  organizationId: text("organization_id").references(() => organizations.id, {
    onDelete: "set null",
  }),
  createdAt: createdAt(),
});

// Monthly send meter per organization (period = "YYYY-MM", UTC). Sandbox/test
// sends are never metered.
export const usageRecords = pgTable(
  "usage_records",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    period: text("period").notNull(),
    emailsSent: integer("emails_sent").notNull().default(0),
    // AI template drafts used this period (metered against the plan's AI credits).
    aiCreditsUsed: integer("ai_credits_used").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("usage_org_period_uq").on(t.organizationId, t.period)],
);

export const workspaces = pgTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    environment: workspaceEnvironmentEnum("environment").notNull().default("live"),
    region: text("region").notNull().default("us"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("workspaces_org_slug_uq").on(t.organizationId, t.slug)],
);

// A user's membership in an organization (the unit they sign up into).
export const memberships = pgTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    role: membershipRoleEnum("role").notNull().default("owner"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("memberships_user_org_uq").on(t.userId, t.organizationId)],
);

// Dashboard login sessions. Like API keys, only the token hash is stored.
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    // The workspace this session is currently acting on (switchable).
    activeWorkspaceId: text("active_workspace_id").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  last4: text("last4").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  mode: workspaceEnvironmentEnum("mode").notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Sub-tenancy (the platform-for-platforms wedge)
// ---------------------------------------------------------------------------
export const subTenants = pgTable(
  "sub_tenants",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    externalId: text("external_id"),
    sendingDomain: text("sending_domain").notNull(),
    status: subTenantStatusEnum("status").notNull().default("pending_verification"),
    inheritsTemplates: boolean("inherits_templates").notNull().default(true),
    verificationToken: text("verification_token").notNull(),
    dkimSelector: text("dkim_selector").notNull(),
    dkimPublicKey: text("dkim_public_key").notNull(),
    // PEM private key — must be encrypted at rest / KMS-managed in production.
    dkimPrivateKey: text("dkim_private_key").notNull(),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("sub_tenants_ws_domain_uq").on(t.workspaceId, t.sendingDomain),
    index("sub_tenants_ws_external_idx").on(t.workspaceId, t.externalId),
  ],
);

// ---------------------------------------------------------------------------
// Contacts & suppression
// ---------------------------------------------------------------------------
export const contacts = pgTable(
  "contacts",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    subTenantId: text("sub_tenant_id").references(() => subTenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
    phone: text("phone"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    status: contactStatusEnum("status").notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("contacts_scope_email_uq").on(t.workspaceId, t.subTenantId, t.email),
    index("contacts_ws_status_idx").on(t.workspaceId, t.status),
  ],
);

export const suppressions = pgTable(
  "suppressions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    subTenantId: text("sub_tenant_id").references(() => subTenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    reason: suppressionReasonEnum("reason").notNull(),
    source: text("source"),
    messageId: text("message_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("suppressions_scope_email_uq").on(t.workspaceId, t.subTenantId, t.email),
    index("suppressions_email_idx").on(t.email),
  ],
);

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
export const templates = pgTable(
  "templates",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    subTenantId: text("sub_tenant_id").references(() => subTenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    type: templateTypeEnum("type").notNull().default("transactional"),
    subject: text("subject").notNull(),
    html: text("html").notNull(),
    text: text("text"),
    // Writing-editor document (TipTap/ProseMirror JSON); null when authored as
    // raw HTML. `html` is always the rendered source of truth used at send time.
    blocks: jsonb("blocks").$type<Record<string, unknown>>(),
    variablesSchema: jsonb("variables_schema").$type<Record<string, unknown>>().notNull().default({}),
    currentVersion: integer("current_version").notNull().default(1),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("templates_scope_slug_uq").on(t.workspaceId, t.subTenantId, t.slug),
  ],
);

// Uploaded assets (logos, images, attachments) referenced by templates/sends.
// Served read-only by unguessable id-based URL; the row tracks ownership/size.
export const assets = pgTable(
  "assets",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    subTenantId: text("sub_tenant_id").references(() => subTenants.id, { onDelete: "set null" }),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    storageKey: text("storage_key").notNull(),
    url: text("url").notNull(),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [index("assets_ws_idx").on(t.workspaceId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Messages — the atomic unit
// ---------------------------------------------------------------------------
export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    subTenantId: text("sub_tenant_id").references(() => subTenants.id, { onDelete: "set null" }),
    type: messageTypeEnum("type").notNull().default("transactional"),
    toEmail: text("to_email").notNull(),
    toContactId: text("to_contact_id").references(() => contacts.id, { onDelete: "set null" }),
    fromEmail: text("from_email").notNull(),
    fromName: text("from_name"),
    replyTo: text("reply_to"),
    subject: text("subject").notNull(),
    templateId: text("template_id").references(() => templates.id, { onDelete: "set null" }),
    templateVersion: integer("template_version"),
    variables: jsonb("variables").$type<Record<string, unknown>>().notNull().default({}),
    renderedHtml: text("rendered_html"),
    renderedText: text("rendered_text"),
    // sha256 of the rendered HTML — proves *what* was sent (Layer 3 / proof bundles).
    contentHash: text("content_hash"),
    sendAt: timestamp("send_at", { withTimezone: true }),
    priority: priorityEnum("priority").notNull().default("normal"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    campaignId: text("campaign_id"),
    sequenceId: text("sequence_id"),
    sequenceStep: integer("sequence_step"),
    idempotencyKey: text("idempotency_key"),
    status: messageStatusEnum("status").notNull().default("queued"),
    provider: text("provider"),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    sandbox: boolean("sandbox").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Non-null idempotency keys are unique per workspace (nulls remain distinct).
    uniqueIndex("messages_ws_idem_uq").on(t.workspaceId, t.idempotencyKey),
    index("messages_ws_status_idx").on(t.workspaceId, t.status),
    index("messages_ws_created_idx").on(t.workspaceId, t.createdAt),
    index("messages_subtenant_idx").on(t.subTenantId),
    index("messages_provider_msg_idx").on(t.providerMessageId),
  ],
);

// ---------------------------------------------------------------------------
// Audit log — append-only lifecycle trail
// ---------------------------------------------------------------------------
export const auditEntries = pgTable(
  "audit_entries",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    subTenantId: text("sub_tenant_id").references(() => subTenants.id, { onDelete: "set null" }),
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    event: auditEventEnum("event").notNull(),
    actor: text("actor").notNull().default("system"),
    actorId: text("actor_id"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    provider: text("provider"),
    providerMessageId: text("provider_message_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("audit_message_idx").on(t.messageId, t.occurredAt),
    index("audit_ws_idx").on(t.workspaceId, t.occurredAt),
  ],
);

// ---------------------------------------------------------------------------
// Conversation (Layer 2) — every outbound message opens a thread; replies are
// matched back to it and surface in the shared inbox.
// ---------------------------------------------------------------------------
export const threads = pgTable(
  "threads",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    subTenantId: text("sub_tenant_id").references(() => subTenants.id, { onDelete: "cascade" }),
    contactEmail: text("contact_email").notNull(),
    subject: text("subject").notNull(),
    status: threadStatusEnum("status").notNull().default("open"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("threads_ws_status_idx").on(t.workspaceId, t.status, t.lastMessageAt)],
);

export const threadMessages = pgTable(
  "thread_messages",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    direction: messageDirectionEnum("direction").notNull(),
    // Set for outbound entries that came from a real Message send.
    messageId: text("message_id").references(() => messages.id, { onDelete: "set null" }),
    fromEmail: text("from_email").notNull(),
    toEmail: text("to_email").notNull(),
    bodyHtml: text("body_html"),
    bodyText: text("body_text"),
    createdAt: createdAt(),
  },
  (t) => [index("thread_messages_thread_idx").on(t.threadId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type BillingEvent = typeof billingEvents.$inferSelect;
export type NewBillingEvent = typeof billingEvents.$inferInsert;
export type UsageRecord = typeof usageRecords.$inferSelect;
export type NewUsageRecord = typeof usageRecords.$inferInsert;
export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type SubTenant = typeof subTenants.$inferSelect;
export type NewSubTenant = typeof subTenants.$inferInsert;
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Suppression = typeof suppressions.$inferSelect;
export type NewSuppression = typeof suppressions.$inferInsert;
export type Template = typeof templates.$inferSelect;
export type NewTemplate = typeof templates.$inferInsert;
export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type AuditEntry = typeof auditEntries.$inferSelect;
export type NewAuditEntry = typeof auditEntries.$inferInsert;
export type Thread = typeof threads.$inferSelect;
export type NewThread = typeof threads.$inferInsert;
export type ThreadMessage = typeof threadMessages.$inferSelect;
export type NewThreadMessage = typeof threadMessages.$inferInsert;
