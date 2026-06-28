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
  ASSISTANT_MESSAGE_ROLES,
  AUDIT_EVENTS,
  BILLING_INTERVALS,
  CAMPAIGN_STATUSES,
  CONTACT_STATUSES,
  ENROLLMENT_STATUSES,
  LEAD_STATUSES,
  MEMBERSHIP_ROLES,
  MESSAGE_DIRECTIONS,
  MESSAGE_STATUSES,
  MESSAGE_TYPES,
  PLAN_IDS,
  PLAN_STATUSES,
  PRIORITIES,
  RETENTION_MODES,
  STAFF_ROLES,
  SUBTENANT_STATUSES,
  SEQUENCE_STATUSES,
  type SequenceStep,
  type SequenceTrigger,
  SUPPRESSION_REASONS,
  THREAD_STATUSES,
  TEMPLATE_TYPES,
  WEBHOOK_ENDPOINT_STATUSES,
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
export const staffRoleEnum = pgEnum("staff_role", STAFF_ROLES);
export const planEnum = pgEnum("plan", PLAN_IDS);
export const planStatusEnum = pgEnum("plan_status", PLAN_STATUSES);
export const billingIntervalEnum = pgEnum("billing_interval", BILLING_INTERVALS);
export const webhookEndpointStatusEnum = pgEnum("webhook_endpoint_status", WEBHOOK_ENDPOINT_STATUSES);
export const sequenceStatusEnum = pgEnum("sequence_status", SEQUENCE_STATUSES);
export const enrollmentStatusEnum = pgEnum("enrollment_status", ENROLLMENT_STATUSES);
export const campaignStatusEnum = pgEnum("campaign_status", CAMPAIGN_STATUSES);
export const threadStatusEnum = pgEnum("thread_status", THREAD_STATUSES);
export const messageDirectionEnum = pgEnum("message_direction", MESSAGE_DIRECTIONS);
export const retentionModeEnum = pgEnum("retention_mode", RETENTION_MODES);
export const leadStatusEnum = pgEnum("lead_status", LEAD_STATUSES);
export const assistantMessageRoleEnum = pgEnum("assistant_message_role", ASSISTANT_MESSAGE_ROLES);

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
  // TOTP MFA. mfaSecret holds the base32 secret from enrollment; mfaEnabledAt is
  // set only after the first code verifies. Recovery codes are stored as scrypt
  // hashes and dropped as they're consumed.
  mfaSecret: text("mfa_secret"),
  mfaEnabledAt: timestamp("mfa_enabled_at", { withTimezone: true }),
  mfaRecoveryCodes: jsonb("mfa_recovery_codes").$type<string[]>(),
  // Set when the user opts out of staff broadcast announcements (CAN-SPAM).
  announcementOptOutAt: timestamp("announcement_opt_out_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// Single-use, expiring tokens for email verification and password reset. Only
// the token hash is stored (like invitations/sessions); the raw token travels in
// the emailed link, and usedAt makes it one-time.
export const authTokens = pgTable(
  "auth_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(), // "email_verify" | "password_reset"
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("auth_tokens_user_idx").on(t.userId)],
);

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
  billingInterval: billingIntervalEnum("billing_interval").notNull().default("month"),
  // Physical postal address shown in the CAN-SPAM footer on marketing/sales mail.
  postalAddress: text("postal_address"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// Pending + accepted team invitations. A pending invite consumes a seat so an
// org can't over-invite past its capacity. Only the token hash is stored.
export const invitations = pgTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: membershipRoleEnum("role").notNull().default("member"),
    customRoleId: text("custom_role_id").references(() => roles.id, { onDelete: "set null" }),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: text("invited_by"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("invitations_org_idx").on(t.organizationId)],
);

// Purchased add-ons (quantity-priced) sitting on top of the plan.
export const orgAddons = pgTable(
  "org_addons",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    addonId: text("addon_id").notNull(),
    quantity: integer("quantity").notNull().default(0),
    stripeItemId: text("stripe_item_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("org_addons_org_addon_uq").on(t.organizationId, t.addonId)],
);

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

// Plan catalog — the admin-editable source of truth for plan economics. Seeded
// from the PLANS/AI_CREDITS constants; the app reads it through a cached loader
// that falls back to the constants when a row is missing. Overage is stored as
// integer cents per 1,000 emails (85 = $0.85) to avoid floats.
export const plans = pgTable("plans", {
  id: planEnum("id").primaryKey(),
  name: text("name").notNull(),
  price: integer("price"), // monthly USD; null = custom / contact sales
  monthlyQuota: integer("monthly_quota").notNull(),
  allowOverage: boolean("allow_overage").notNull().default(false),
  overagePer1000Cents: integer("overage_per_1000_cents").notNull().default(0),
  includedSubTenants: integer("included_sub_tenants").notNull().default(0),
  seats: integer("seats").notNull().default(1),
  // Included live workspaces (products/brands); -1 = unlimited. The Sandbox
  // (test) workspace never counts.
  workspaceLimit: integer("workspace_limit").notNull().default(1),
  aiCredits: integer("ai_credits").notNull().default(0),
  features: jsonb("features").$type<string[]>().notNull().default([]),
  rank: integer("rank").notNull().default(0),
  active: boolean("active").notNull().default(true),
  // Free-trial length in days for this plan's checkout (0 = no trial).
  trialDays: integer("trial_days").notNull().default(0),
  // Public sale: a % off shown everywhere pricing renders and applied at checkout
  // via the synced auto-applied Stripe coupon (so the charge matches the marketing).
  // A sale is active while salePercentOff > 0 and (saleEndsAt is null or in the
  // future). null/0 = no sale.
  salePercentOff: integer("sale_percent_off"),
  saleEndsAt: timestamp("sale_ends_at", { withTimezone: true }),
  saleStripeCouponId: text("sale_stripe_coupon_id"),
  // Stripe linkage (Phase B — dynamic price sync). Null = use env price ids.
  stripePriceMonthId: text("stripe_price_month_id"),
  stripePriceYearId: text("stripe_price_year_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
export type Plan = typeof plans.$inferSelect;

// Add-on catalog — admin-editable like plans. Seeded from the ADD_ONS constants;
// read through the same cached loader (constant fallback). `unit_amount` is the
// monthly USD price per unit; `grant` is what one unit gives (e.g. 100 AI credits).
export const addons = pgTable("addons", {
  id: text("id").primaryKey(), // matches AddOnId: extra_seat | dedicated_ip | subtenant_pack | ai_credit_pack
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  unit: text("unit").notNull().default(""),
  unitAmount: integer("unit_amount").notNull().default(0),
  grant: integer("grant").notNull().default(1),
  active: boolean("active").notNull().default(true),
  rank: integer("rank").notNull().default(0),
  stripePriceId: text("stripe_price_id"),
  // Public sale (like plans). Charged honestly via a discounted "sale price" used
  // in checkout + add-on sync while active (no coupon stacking with a plan sale).
  salePercentOff: integer("sale_percent_off"),
  saleEndsAt: timestamp("sale_ends_at", { withTimezone: true }),
  saleStripePriceId: text("sale_stripe_price_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
export type Addon = typeof addons.$inferSelect;

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
    // Overage units (1 unit = 1,000 emails) already reported to Stripe's meter
    // this period — so we only ever report the delta (meters aggregate by sum).
    overageReportedUnits: integer("overage_reported_units").notNull().default(0),
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
    // Data retention: null = keep forever (default). When set, messages older than
    // this many days are redacted or deleted by the retention sweep.
    retentionDays: integer("retention_days"),
    retentionMode: retentionModeEnum("retention_mode").notNull().default("redact"),
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
    // When set, a custom role (Scale) overrides the system role's permissions.
    customRoleId: text("custom_role_id").references(() => roles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("memberships_user_org_uq").on(t.userId, t.organizationId)],
);

// Custom RBAC roles (a Scale feature). System roles (owner/admin/member) live
// in code; these are org-defined remixes of the permission catalog.
export const roles = pgTable(
  "roles",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("roles_org_key_uq").on(t.organizationId, t.key)],
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
    // Set when a staff member is impersonating this user for support — lets the
    // dashboard show a banner and keeps the action auditable.
    impersonatedByStaffId: text("impersonated_by_staff_id").references(() => staffUsers.id, {
      onDelete: "set null",
    }),
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
// Outbound dev webhooks
// ---------------------------------------------------------------------------
export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    // Symmetric signing secret — needed to sign each delivery, so stored (must
    // be encrypted at rest / KMS-managed in production). Revealed once on create.
    secret: text("secret").notNull(),
    events: jsonb("events").$type<string[]>().notNull().default([]),
    description: text("description"),
    status: webhookEndpointStatusEnum("status").notNull().default("active"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("webhook_endpoints_ws_idx").on(t.workspaceId)],
);

// Delivery attempt log (observability + debugging). Append-only.
export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: text("id").primaryKey(),
    endpointId: text("endpoint_id")
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    status: text("status").notNull(), // "success" | "failed"
    attempt: integer("attempt").notNull().default(1),
    responseStatus: integer("response_status"),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("webhook_deliveries_endpoint_idx").on(t.endpointId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Sequences (drip automation)
// ---------------------------------------------------------------------------
export const sequences = pgTable(
  "sequences",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    subTenantId: text("sub_tenant_id").references(() => subTenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: sequenceStatusEnum("status").notNull().default("active"),
    trigger: jsonb("trigger").$type<SequenceTrigger>().notNull().default({ type: "manual" }),
    steps: jsonb("steps").$type<SequenceStep[]>().notNull().default([]),
    exitOn: jsonb("exit_on").$type<string[]>().notNull().default(["replied", "unsubscribed"]),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sequences_ws_idx").on(t.workspaceId, t.status)],
);

export const sequenceEnrollments = pgTable(
  "sequence_enrollments",
  {
    id: text("id").primaryKey(),
    sequenceId: text("sequence_id")
      .notNull()
      .references(() => sequences.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    subTenantId: text("sub_tenant_id").references(() => subTenants.id, { onDelete: "set null" }),
    contactId: text("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    status: enrollmentStatusEnum("status").notNull().default("active"),
    currentStep: integer("current_step").notNull().default(0),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).defaultNow().notNull(),
    lastMessageId: text("last_message_id"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // The tick scans by (status, nextRunAt); enrollment lookups by sequence/email.
    index("enrollments_due_idx").on(t.status, t.nextRunAt),
    index("enrollments_seq_email_idx").on(t.sequenceId, t.email),
  ],
);

// ---------------------------------------------------------------------------
// Lists (free) + Campaigns (Pro) — bulk marketing sends
// ---------------------------------------------------------------------------
export const lists = pgTable(
  "lists",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    subTenantId: text("sub_tenant_id").references(() => subTenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("lists_ws_idx").on(t.workspaceId)],
);

export const listContacts = pgTable(
  "list_contacts",
  {
    id: text("id").primaryKey(),
    listId: text("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("list_contacts_uq").on(t.listId, t.contactId)],
);

export const campaigns = pgTable(
  "campaigns",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    subTenantId: text("sub_tenant_id").references(() => subTenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    listId: text("list_id").references(() => lists.id, { onDelete: "set null" }),
    templateId: text("template_id").references(() => templates.id, { onDelete: "set null" }),
    subject: text("subject"),
    fromEmail: text("from_email"),
    status: campaignStatusEnum("status").notNull().default("draft"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    stats: jsonb("stats")
      .$type<{ recipients: number; sent: number; suppressed: number; failed: number }>()
      .notNull()
      .default({ recipients: 0, sent: 0, suppressed: 0, failed: 0 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("campaigns_ws_idx").on(t.workspaceId, t.status)],
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
    // Set by the retention sweep when a message's PII/content has been redacted.
    redactedAt: timestamp("redacted_at", { withTimezone: true }),
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
// In-app AI assistant — persistent, conversational chat (history + multi-turn).
// Scoped to an org AND the user who owns the conversation. The assistant's tool
// loop still runs per-message; we persist only the user/assistant TEXT turns
// (plus the tool actions taken) so a chat can be reloaded and continued.
// ---------------------------------------------------------------------------
export const assistantChats = pgTable(
  "assistant_chats",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New chat"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("assistant_chats_org_user_idx").on(t.organizationId, t.userId, t.updatedAt)],
);

export const assistantMessages = pgTable(
  "assistant_messages",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => assistantChats.id, { onDelete: "cascade" }),
    role: assistantMessageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    // The tool actions the assistant took for this turn ({tool,status}[]); null
    // for user turns.
    actions: jsonb("actions").$type<{ tool: string; status: number }[]>(),
    createdAt: createdAt(),
  },
  (t) => [index("assistant_messages_chat_idx").on(t.chatId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Internal staff (apps/admin) — separate identity from customer users/sessions.
// ---------------------------------------------------------------------------
export const staffUsers = pgTable("staff_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  role: staffRoleEnum("role").notNull().default("support"),
  // Set when a staffer is deactivated ("fired") — their sessions stop resolving.
  deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const staffSessions = pgTable(
  "staff_sessions",
  {
    id: text("id").primaryKey(),
    staffUserId: text("staff_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("staff_sessions_user_idx").on(t.staffUserId)],
);

// Append-only log of privileged staff actions (impersonation, etc.).
export const staffAudit = pgTable(
  "staff_audit",
  {
    id: text("id").primaryKey(),
    staffUserId: text("staff_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("staff_audit_staff_idx").on(t.staffUserId, t.createdAt)],
);

// One-time, short-lived handoff codes for impersonation. The staff app gets a
// code; the dashboard exchanges it for a real (impersonated) customer session,
// so the session token never travels in a URL.
export const impersonationGrants = pgTable(
  "impersonation_grants",
  {
    id: text("id").primaryKey(),
    codeHash: text("code_hash").notNull().unique(),
    staffUserId: text("staff_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "cascade" }),
    targetUserId: text("target_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("impersonation_grants_target_idx").on(t.targetUserId)],
);

// ---------------------------------------------------------------------------
// Sales / CRM
// ---------------------------------------------------------------------------
// Enterprise "Contact sales" leads. The public POST /v1/leads endpoint writes
// these (no auth — rate-limited + honeypot-guarded); staff work the pipeline in
// apps/admin. `organizationId` links the lead to a real customer once won (often
// alongside a custom plan). ip/userAgent are light anti-abuse breadcrumbs.
export const leads = pgTable(
  "leads",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    company: text("company"),
    website: text("website"),
    phone: text("phone"),
    companySize: text("company_size"),
    expectedVolume: text("expected_volume"),
    currentProvider: text("current_provider"),
    message: text("message"),
    status: leadStatusEnum("status").notNull().default("new"),
    source: text("source").notNull().default("contact_form"),
    ownerStaffId: text("owner_staff_id").references(() => staffUsers.id, { onDelete: "set null" }),
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("leads_status_idx").on(t.status, t.createdAt),
    index("leads_owner_idx").on(t.ownerStaffId),
    index("leads_email_idx").on(t.email),
  ],
);

// Append-only activity timeline for a lead: hand-written staff notes plus
// auto-logged events (status changes, assignment). Never updated, only inserted.
export const leadNotes = pgTable(
  "lead_notes",
  {
    id: text("id").primaryKey(),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    staffUserId: text("staff_user_id").references(() => staffUsers.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    // "note" (hand-written) | "system" (status/assignment events).
    kind: text("kind").notNull().default("note"),
    createdAt: createdAt(),
  },
  (t) => [index("lead_notes_lead_idx").on(t.leadId, t.createdAt)],
);

// A bespoke enterprise plan for one organization (the concrete "Enterprise" a
// sales conversation lands on). The org runs on plan="enterprise" (so it inherits
// every feature gate); these rows override the *numeric economics* (quota, overage,
// seats, AI credits) per-org. `stripeProductId/PriceId` are created on save so the
// plan is real + billable. One active plan per org (unique organizationId).
export const customPlans = pgTable(
  "custom_plans",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // The lead this enterprise deal originated from, if any (for the CRM trail).
    leadId: text("lead_id").references(() => leads.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    priceCents: integer("price_cents").notNull().default(0),
    interval: billingIntervalEnum("interval").notNull().default("month"),
    monthlyQuota: integer("monthly_quota").notNull(),
    allowOverage: boolean("allow_overage").notNull().default(true),
    overagePer1000Cents: integer("overage_per_1000_cents").notNull().default(0),
    includedSubTenants: integer("included_sub_tenants").notNull().default(-1),
    seats: integer("seats").notNull().default(-1),
    aiCredits: integer("ai_credits").notNull().default(-1),
    active: boolean("active").notNull().default(true),
    stripeProductId: text("stripe_product_id"),
    stripePriceId: text("stripe_price_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("custom_plans_org_uq").on(t.organizationId)],
);

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------
export type StaffUser = typeof staffUsers.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type LeadNote = typeof leadNotes.$inferSelect;
export type NewLeadNote = typeof leadNotes.$inferInsert;
export type CustomPlan = typeof customPlans.$inferSelect;
export type NewCustomPlan = typeof customPlans.$inferInsert;
export type StaffSession = typeof staffSessions.$inferSelect;
export type StaffAudit = typeof staffAudit.$inferSelect;
export type ImpersonationGrant = typeof impersonationGrants.$inferSelect;
export type User = typeof users.$inferSelect;
export type AuthToken = typeof authTokens.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;
export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type BillingEvent = typeof billingEvents.$inferSelect;
export type NewBillingEvent = typeof billingEvents.$inferInsert;
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
export type OrgAddon = typeof orgAddons.$inferSelect;
export type NewOrgAddon = typeof orgAddons.$inferInsert;
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
export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;
export type NewWebhookEndpoint = typeof webhookEndpoints.$inferInsert;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type NewWebhookDelivery = typeof webhookDeliveries.$inferInsert;
export type Sequence = typeof sequences.$inferSelect;
export type NewSequence = typeof sequences.$inferInsert;
export type SequenceEnrollment = typeof sequenceEnrollments.$inferSelect;
export type NewSequenceEnrollment = typeof sequenceEnrollments.$inferInsert;
export type List = typeof lists.$inferSelect;
export type NewList = typeof lists.$inferInsert;
export type ListContact = typeof listContacts.$inferSelect;
export type NewListContact = typeof listContacts.$inferInsert;
export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type AuditEntry = typeof auditEntries.$inferSelect;
export type NewAuditEntry = typeof auditEntries.$inferInsert;
export type Thread = typeof threads.$inferSelect;
export type NewThread = typeof threads.$inferInsert;
export type ThreadMessage = typeof threadMessages.$inferSelect;
export type NewThreadMessage = typeof threadMessages.$inferInsert;
export type AssistantChat = typeof assistantChats.$inferSelect;
export type NewAssistantChat = typeof assistantChats.$inferInsert;
export type AssistantMessage = typeof assistantMessages.$inferSelect;
export type NewAssistantMessage = typeof assistantMessages.$inferInsert;
