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
  MESSAGE_STATUSES,
  MESSAGE_TYPES,
  PRIORITIES,
  SUBTENANT_STATUSES,
  SUPPRESSION_REASONS,
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

// Fresh builders each call so no column instance is shared across tables.
const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

// ---------------------------------------------------------------------------
// Identity & access
// ---------------------------------------------------------------------------
export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

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
// Inferred types
// ---------------------------------------------------------------------------
export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
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
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type AuditEntry = typeof auditEntries.$inferSelect;
export type NewAuditEntry = typeof auditEntries.$inferInsert;
