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
  type ChangeItem,
  CMS_STATUSES,
  CONTACT_STATUSES,
  POST_CATEGORIES,
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
  SUPPORT_MESSAGE_AUTHORS,
  SUPPORT_TICKET_STATUSES,
  SEQUENCE_STATUSES,
  type SequenceStep,
  type SequenceTrigger,
  SUPPRESSION_REASONS,
  THREAD_STATUSES,
  REPUTATION_STATES,
  TEMPLATE_TYPES,
  WEBHOOK_ENDPOINT_STATUSES,
  WINGS,
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
export const reputationStateEnum = pgEnum("reputation_state", REPUTATION_STATES);
export const suppressionReasonEnum = pgEnum("suppression_reason", SUPPRESSION_REASONS);
export const workspaceEnvironmentEnum = pgEnum("workspace_environment", WORKSPACE_ENVIRONMENTS);
export const membershipRoleEnum = pgEnum("membership_role", MEMBERSHIP_ROLES);
export const staffRoleEnum = pgEnum("staff_role", STAFF_ROLES);
export const planEnum = pgEnum("plan", PLAN_IDS);
export const planStatusEnum = pgEnum("plan_status", PLAN_STATUSES);
export const billingIntervalEnum = pgEnum("billing_interval", BILLING_INTERVALS);
export const wingEnum = pgEnum("wing", WINGS);
export const webhookEndpointStatusEnum = pgEnum("webhook_endpoint_status", WEBHOOK_ENDPOINT_STATUSES);
export const sequenceStatusEnum = pgEnum("sequence_status", SEQUENCE_STATUSES);
export const enrollmentStatusEnum = pgEnum("enrollment_status", ENROLLMENT_STATUSES);
export const campaignStatusEnum = pgEnum("campaign_status", CAMPAIGN_STATUSES);
export const threadStatusEnum = pgEnum("thread_status", THREAD_STATUSES);
export const messageDirectionEnum = pgEnum("message_direction", MESSAGE_DIRECTIONS);
export const retentionModeEnum = pgEnum("retention_mode", RETENTION_MODES);
export const leadStatusEnum = pgEnum("lead_status", LEAD_STATUSES);
export const assistantMessageRoleEnum = pgEnum("assistant_message_role", ASSISTANT_MESSAGE_ROLES);
export const cmsStatusEnum = pgEnum("cms_status", CMS_STATUSES);
export const postCategoryEnum = pgEnum("post_category", POST_CATEGORIES);
export const supportTicketStatusEnum = pgEnum("support_ticket_status", SUPPORT_TICKET_STATUSES);
export const supportMessageAuthorEnum = pgEnum("support_message_author", SUPPORT_MESSAGE_AUTHORS);

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
  // Profile picture URL (an uploaded asset served from ASSET_PUBLIC_URL, or a
  // provider avatar from social login). Null → the UI falls back to initials.
  avatarUrl: text("avatar_url"),
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
  // Last authenticated activity (throttled write ~1/hr) — powers inactivity win-back.
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
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
  // A separate MONTHLY metered subscription that carries the overage price for
  // YEARLY plans (Stripe forbids mixing intervals in one subscription, so overage —
  // an inherently monthly charge — bills here instead of on the annual base sub).
  stripeOverageSubscriptionId: text("stripe_overage_subscription_id"),
  planStatus: planStatusEnum("plan_status").notNull().default("active"),
  billingInterval: billingIntervalEnum("billing_interval").notNull().default("month"),
  // Physical postal address shown in the CAN-SPAM footer on marketing/sales mail.
  postalAddress: text("postal_address"),
  // Where this org's data lives (enterprise residency surface). Single-region
  // today; additional regions are an infra rollout, set by staff when available.
  dataRegion: text("data_region").notNull().default("us-east-1"),
  // Dedicated-IP add-on provisioning: none → requested (on purchase) → active
  // (staff provisions the real SES dedicated IP + records it here). Keeps the
  // add-on from being silently sold before the IP exists.
  dedicatedIpStatus: text("dedicated_ip_status").notNull().default("none"),
  dedicatedIpAddress: text("dedicated_ip_address"),
  // The SES configuration set bound to this org's dedicated IP pool. Set by staff
  // at activation; the worker routes this org's real sends through it (making the
  // dedicated IP actually used, not just billed). Must carry the same SNS event
  // destinations as the shared set or delivery/open/click events would be lost.
  dedicatedIpConfigSet: text("dedicated_ip_config_set"),
  // Onboarding profile (first-principles doc): what the business is + how they
  // send today — only what the product structurally uses (personalization,
  // migration nudges); the postal address collected alongside feeds postalAddress.
  businessTypes: jsonb("business_types").$type<string[]>().notNull().default([]),
  previousProvider: text("previous_provider"),
  // Null = the post-signup onboarding wizard hasn't been completed (new orgs);
  // backfilled to now() for orgs that predate the wizard.
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
  // Per-wing pricing (PRICING-WINGS-SPEC.md). Soft refs to pricing_tiers.id, one per
  // wing. **NULL on every existing org = resolve via the legacy single `plan` above**
  // (the dormant fallback); set only once an org moves onto the new model (Phase C/D).
  // Each paid wing gets its own Stripe subscription.
  transactionalTier: text("transactional_tier"),
  // Purchased transactional send blocks (quantity × BLOCK_SIZE sends/mo). 0 = the
  // free allowance. Set by the wing checkout webhook (subscription item quantity)
  // or a direct assignment in local mode.
  transactionalBlocks: integer("transactional_blocks").notNull().default(0),
  marketingTier: text("marketing_tier"),
  // Chosen marketing CONTACT SIZE (the base the marketing tier multiplies into
  // price, monthly sends, and the daily cap). 0 = the free ceiling. Set by the
  // marketing wing checkout (Stripe quantity × CONTACT_UNIT) or local assignment.
  marketingContacts: integer("marketing_contacts").notNull().default(0),
  platformTier: text("platform_tier"),
  stripeTxSubscriptionId: text("stripe_tx_subscription_id"),
  stripeMkSubscriptionId: text("stripe_mk_subscription_id"),
  // Repurposed: the org-level ADD-ONS subscription (Platform-as-a-plan is gone;
  // seats/workspaces/roles/SSO/proof/residency/AI packs all bill here).
  stripePlatformSubscriptionId: text("stripe_platform_subscription_id"),
  // How replies to this org's mail come back. "inbox" (default) routes replies
  // through a rootmail-received address (reply+<token>@INBOUND_DOMAIN) so they
  // land in the per-contact Replies inbox; "own_mailbox" sends replies straight
  // to the sender's From address (no capture — they land in the user's own mail
  // client). ("own_domain" — a branded reply subdomain — layers on via the columns below.)
  replyMode: text("reply_mode").notNull().default("inbox"),
  // Branded own-domain replies (Phase 2): the customer's reply subdomain
  // (reply.theirco.com). status none → pending (DNS added/verified, awaiting our
  // SES receipt-rule provisioning) → active (receiving live). Until "active",
  // reply-to falls back to the rootmail-hosted INBOUND_DOMAIN so no reply is lost.
  replyDomain: text("reply_domain"),
  replyDomainToken: text("reply_domain_token"),
  replyDomainStatus: text("reply_domain_status").notNull().default("none"),
  replyDomainVerifiedAt: timestamp("reply_domain_verified_at", { withTimezone: true }),
  /**
   * OUR OWN account, not a customer's.
   *
   * rootmail reaches its customers with rootmail — the same campaigns,
   * sequences, templates, deliverability and Replies inbox everyone else gets.
   * That means we are a tenant of ourselves, and the org that represents us has
   * to be marked, for two reasons:
   *
   *   - Money. An internal org has no subscription and must never appear in
   *     MRR, revenue, churn or "how many customers do we have" — otherwise we
   *     are counting ourselves as a customer and reporting it to ourselves.
   *   - Limits. Our own audience is every customer we have; metering our own
   *     outreach against a plan we sell would be theatre.
   *
   * Deliberately a flag on the org rather than a separate table: everything
   * that already scopes by org — contacts, campaigns, deliverability, replies —
   * then works for us unchanged, which is the entire point. A parallel
   * "internal messaging" system would be the thing we are trying not to build.
   */
  isInternal: boolean("is_internal").notNull().default(false),
  /**
   * Signed up with a beta invite. Two jobs, deliberately one column each:
   * this one is the fast entitlement check (beta testers get everything, so
   * nothing they report is "I couldn't reach that"), and `betaInviteId` below
   * records WHICH invite let them in — so every tester traces back to the
   * person we gave a code to.
   */
  isBeta: boolean("is_beta").notNull().default(false),
  betaInviteId: text("beta_invite_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// Pending + accepted team invitations. A pending invite consumes a seat so an
// org can't over-invite past its capacity. Only the token hash is stored.
/**
 * Beta access codes — the door to a closed beta.
 *
 * Distinct from `invitations` below, which adds a person to an EXISTING org's
 * team. This is the other direction: it lets a stranger create an account at
 * all, while signup is otherwise shut.
 *
 * A code is not a secret to be guarded so much as a name we can trace: every
 * org that gets in records the invite it used, so "who are our beta testers"
 * is a join rather than a spreadsheet someone forgot to update.
 */
export const betaInvites = pgTable(
  "beta_invites",
  {
    id: text("id").primaryKey(),
    /** What the tester types. Short, unambiguous, case-insensitive on redeem. */
    code: text("code").notNull(),
    /** Who it went to / why — so the list reads as people, not hashes. */
    label: text("label"),
    /** 1 for a personal invite; higher for a shared code (a community, a batch). */
    maxUses: integer("max_uses").notNull().default(1),
    usedCount: integer("used_count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** Set to stop a code working without deleting the trail of who used it. */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdByStaffId: text("created_by_staff_id"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("beta_invites_code_uq").on(t.code)],
);
export type BetaInvite = typeof betaInvites.$inferSelect;
export type NewBetaInvite = typeof betaInvites.$inferInsert;

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
  // Yearly (10× monthly — 2 months free) so add-ons can ride a yearly wing
  // checkout as real line items (Stripe forbids mixing intervals on one sub).
  stripePriceYearId: text("stripe_price_year_id"),
  // Public sale (like plans). Charged honestly via a discounted "sale price" used
  // in checkout + add-on sync while active (no coupon stacking with a plan sale).
  salePercentOff: integer("sale_percent_off"),
  saleEndsAt: timestamp("sale_ends_at", { withTimezone: true }),
  saleStripePriceId: text("sale_stripe_price_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
export type Addon = typeof addons.$inferSelect;

// Per-wing pricing catalog (PRICING-WINGS-SPEC.md) — admin-editable rows for the
// three INDEPENDENT ladders (transactional=sends, marketing=contacts, platform=seats),
// mirroring the WING_TIERS constants (constant fallback, DB override — like plans).
// Most numeric columns are wing-specific + nullable; features re-home the PlanFeature
// flags to their wing. Prices are whole monthly/yearly USD (null = custom).
export const pricingTiers = pgTable(
  "pricing_tiers",
  {
    id: text("id").primaryKey(), // "tx_free", "mk_growth", "pf_team"
    wing: wingEnum("wing").notNull(),
    name: text("name").notNull(),
    rank: integer("rank").notNull().default(0),
    priceMonthly: integer("price_monthly"), // USD; null = custom / contact sales
    priceYearly: integer("price_yearly"),
    aiCredits: integer("ai_credits").notNull().default(0), // org-level grant; summed across wings; -1 = unlimited
    features: jsonb("features").$type<string[]>().notNull().default([]),
    trialDays: integer("trial_days").notNull().default(0),
    active: boolean("active").notNull().default(true),
    // Transactional (sends)
    includedSends: integer("included_sends"), // -1 = unlimited
    blockSize: integer("block_size"), // sends per purchasable block
    allowOverage: boolean("allow_overage").notNull().default(false),
    overagePer1000Cents: integer("overage_per_1000_cents").notNull().default(0),
    includedSubTenants: integer("included_sub_tenants").notNull().default(0),
    // Marketing (CONTACT SIZE is the base — the tier multiplies it)
    includedContacts: integer("included_contacts"), // free-tier ceiling only (mk_free)
    perThousandCents: integer("per_thousand_cents"), // cents per 1,000 contacts/mo (price = contacts/1000 × this)
    sendsPerContact: integer("sends_per_contact"), // monthly sends = contacts × this
    dailyPerContact: integer("daily_per_contact"), // per-day cap = contacts × this
    includedAudiences: integer("included_audiences"), // distinct audiences allowed; -1 = unlimited
    // Platform (seats / workspaces)
    seats: integer("seats"), // -1 = unlimited
    workspaceLimit: integer("workspace_limit"), // -1 = unlimited
    // Public sale (like plans)
    salePercentOff: integer("sale_percent_off"),
    saleEndsAt: timestamp("sale_ends_at", { withTimezone: true }),
    saleStripeCouponId: text("sale_stripe_coupon_id"),
    // Stripe linkage (per tier)
    stripePriceMonthId: text("stripe_price_month_id"),
    stripePriceYearId: text("stripe_price_year_id"),
    // Metered overage price (tx_blocks only): bills per 1,000 sends past the
    // purchased blocks on a dedicated monthly overage subscription.
    stripeOveragePriceId: text("stripe_overage_price_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("pricing_tiers_wing_rank_idx").on(t.wing, t.rank)],
);
export type PricingTier = typeof pricingTiers.$inferSelect;
export type NewPricingTier = typeof pricingTiers.$inferInsert;

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
    // TRANSACTIONAL sends this period — the only kind metered against blocks.
    emailsSent: integer("emails_sent").notNull().default(0),
    // Marketing/sales sends this period — informational only. Marketing volume is
    // priced by CONTACTS, never against transactional blocks (a full audience can
    // always receive a campaign).
    marketingSent: integer("marketing_sent").notNull().default(0),
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

// Marketing per-DAY send meter (day = "YYYY-MM-DD", UTC). The marketing tier's
// daily cap = contacts × dailyPerContact; this counts against it. Separate from the
// monthly meter so a burst can't blow a month's allowance in a day.
export const marketingDailyUsage = pgTable(
  "marketing_daily_usage",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    day: text("day").notNull(), // "YYYY-MM-DD" UTC
    sent: integer("sent").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("marketing_daily_org_day_uq").on(t.organizationId, t.day)],
);

/** The transactional twin of marketingDailyUsage — both wings carry a monthly
 * allowance AND a per-day burst cap, so both need a day counter. Separate tables
 * keep each wing's meter independent (they never mix, by doctrine). */
export const transactionalDailyUsage = pgTable(
  "transactional_daily_usage",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    day: text("day").notNull(), // "YYYY-MM-DD" UTC
    sent: integer("sent").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("transactional_daily_org_day_uq").on(t.organizationId, t.day)],
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
    // Deactivated by SCIM deprovisioning — an inactive membership grants no access
    // to the org (enforced in userWorkspaces / workspaceForUser).
    active: boolean("active").notNull().default(true),
    // The identity provider's user id, when provisioned via SCIM.
    scimExternalId: text("scim_external_id"),
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
  /**
   * Pins this key to ONE client.
   *
   * Null (the default) is a workspace key: it may act as any client by sending
   * `X-Rootmail-Subtenant`, which is right when the platform itself holds the
   * key. When set, the scope is the key's own — the header is ignored if it
   * agrees and REJECTED if it doesn't, so scope can never be widened by a
   * request. This is what makes "give my client a key that only reaches their
   * own data" answerable, and it is the first thing every platform buyer asks.
   *
   * Cascade on delete: a key for a client that no longer exists must stop
   * working, not fall back to workspace-wide access.
   */
  subTenantId: text("sub_tenant_id").references(() => subTenants.id, { onDelete: "cascade" }),
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
    /**
     * PEM private key, ENCRYPTED AT REST (`enc:v1:…`, AES-256-GCM keyed by
     * ENCRYPTION_KEY — see packages/core/src/encryption.ts). Never read this
     * column directly: go through `decryptSecret`, which passes legacy plaintext
     * rows through unchanged so a half-backfilled table still signs correctly.
     * Backfill with `pnpm db:encrypt-dkim`.
     *
     * Still not KMS: the key is in the application's environment, so this defends
     * against a stolen dump or backup, not against host compromise.
     */
    dkimPrivateKey: text("dkim_private_key").notNull(),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),

    // --- DNS drift (set by the worker's sweep) --------------------------------
    // Verification used to be one-shot: a tenant who deleted their DKIM record
    // the day after verifying kept a "verified" badge forever while every mail
    // they sent failed authentication at the receiver.
    /**
     * When this domain's records FIRST stopped resolving, or null while healthy.
     *
     * A timestamp rather than a failure counter because the grace period is the
     * point: one failed lookup is not proof a record is gone (resolvers time out,
     * networks blip), and suspending a paying customer's sending on a transient
     * miss is worse than the drift. Sustained past DNS_DRIFT_GRACE_HOURS, it is
     * no longer transient. Time survives a change to the sweep interval; a count
     * does not.
     */
    dnsFailingSince: timestamp("dns_failing_since", { withTimezone: true }),
    /** Which record is missing, in plain English, for the operator to act on. */
    dnsDriftDetail: text("dns_drift_detail"),

    // --- DKIM rotation (brief P2.3) -------------------------------------------
    // A signing key that never changes is a key that is only ever more exposed.
    // Rotation uses DUAL SELECTORS: the new key is generated and published
    // alongside the old one, and we keep SIGNING WITH THE OLD KEY until the new
    // record actually resolves. Cutting over first would fail authentication on
    // every message in the gap, which is the whole thing rotation exists to avoid.
    /** Selector of the incoming key, or null when no rotation is in flight. */
    nextDkimSelector: text("next_dkim_selector"),
    nextDkimPublicKey: text("next_dkim_public_key"),
    /** Encrypted exactly like `dkimPrivateKey` — never read it directly. */
    nextDkimPrivateKey: text("next_dkim_private_key"),
    /** When the pending key was generated. Also what "stalled" is measured from. */
    dkimRotationStartedAt: timestamp("dkim_rotation_started_at", { withTimezone: true }),
    /** When we last completed a cutover — the age that triggers the next one. */
    dkimRotatedAt: timestamp("dkim_rotated_at", { withTimezone: true }),
    /**
     * The selector we just rotated AWAY from, kept so we can tell them when it is
     * safe to delete. Mail already accepted can still be verified later (greylists,
     * deferred queues), so the old record has to outlive the cutover.
     */
    previousDkimSelector: text("previous_dkim_selector"),
    previousDkimRetireAt: timestamp("previous_dkim_retire_at", { withTimezone: true }),

    // --- Reputation enforcement (set by the worker's reputation sweep) --------
    // `status` says whether this domain is allowed to send at all; these say how
    // its mail is actually landing and what we are doing about it.
    reputationState: reputationStateEnum("reputation_state").notNull().default("ok"),
    /** Last 0–100 score from computeDeliverability. Null until first swept. */
    reputationScore: integer("reputation_score"),
    /** Plain-English why, shown to the parent and returned in the send error. */
    reputationReason: text("reputation_reason"),
    /** The numbers behind the decision — rates, thresholds, volume. */
    reputationMetrics: jsonb("reputation_metrics").$type<Record<string, unknown>>().notNull().default({}),
    reputationCheckedAt: timestamp("reputation_checked_at", { withTimezone: true }),
    reputationChangedAt: timestamp("reputation_changed_at", { withTimezone: true }),
    /**
     * When a human last resumed this tenant after a pause.
     *
     * The sweep judges a resumed tenant only on mail sent AFTER this moment. A
     * trailing window still full of the bounces that caused the pause would
     * re-pause them within fifteen minutes of the operator clicking resume — a
     * ladder out of the trap door that puts you straight back in it. Judging them
     * on what they do next is both fairer and the only version that terminates.
     */
    reputationResumedAt: timestamp("reputation_resumed_at", { withTimezone: true }),

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
    // CRM lifecycle stage (user-managed; see CONTACT_STAGES in core) — where the
    // RELATIONSHIP stands, independent of deliverability `status`.
    stage: text("stage").notNull().default("subscriber"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("contacts_scope_email_uq").on(t.workspaceId, t.subTenantId, t.email),
    index("contacts_ws_status_idx").on(t.workspaceId, t.status),
    index("contacts_ws_stage_idx").on(t.workspaceId, t.stage),
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
    // --- Audience growth (public signup) ---
    // When enabled, the audience accepts public subscribers via its hosted signup
    // page + embed form + POST /v1/subscribe. Double opt-in (default on) sends a
    // branded confirmation email before the contact is created; the signup tag is
    // applied to every subscriber (driving contact_tagged sequence triggers); the
    // redirect URL, when set, is where the hosted page sends people afterward.
    /**
     * A live rule instead of a fixed membership.
     *
     * NULL = an ordinary audience: people are in it because they were added.
     * Set = the audience describes itself ("everyone on Free with no verified
     * domain") and its members are whoever matches right now.
     *
     * Came from needing to reach our own customers conditionally — dormant,
     * near a cap, trial ending — which is the same thing any customer syncing
     * their app's users needs. Shape + safety live in `segments.ts`; it is
     * validated on write so a bad rule fails at save time, never at send time.
     */
    filter: jsonb("filter").$type<Record<string, unknown> | null>(),
    signupEnabled: boolean("signup_enabled").notNull().default(false),
    doubleOptIn: boolean("double_opt_in").notNull().default(true),
    signupTag: text("signup_tag"),
    signupRedirectUrl: text("signup_redirect_url"),
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

// Audience lifecycle events — the CRM's memory. One row per thing that happened
// to a contact relationship: subscribed (form/API), confirmed (double opt-in),
// unsubscribed, imported, waitlisted (signup arrived while the audience was at
// its contact cap — the email is kept here, NOT as a contact, and admitted later),
// admitted, note-worthy status flips. Powers the growth chart (subs vs unsubs by
// day), the waitlist queue, and each contact's activity timeline. Append-only.
export const contactEvents = pgTable(
  "contact_events",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    subTenantId: text("sub_tenant_id").references(() => subTenants.id, { onDelete: "cascade" }),
    // Nullable: waitlisted signups have no contact row yet; list-less events allowed.
    contactId: text("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    listId: text("list_id").references(() => lists.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    kind: text("kind").notNull(), // subscribed | confirmed | unsubscribed | imported | waitlisted | admitted
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("contact_events_ws_kind_idx").on(t.workspaceId, t.kind, t.occurredAt),
    index("contact_events_contact_idx").on(t.contactId, t.occurredAt),
    index("contact_events_list_idx").on(t.listId, t.occurredAt),
  ],
);

// Free-form CRM notes a user keeps on a contact ("met at the conference",
// "wants the annual plan"). Authored by a dashboard user; newest first.
export const contactNotes = pgTable(
  "contact_notes",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("contact_notes_contact_idx").on(t.contactId, t.createdAt)],
);

export type ContactEvent = typeof contactEvents.$inferSelect;
export type NewContactEvent = typeof contactEvents.$inferInsert;
export type ContactNote = typeof contactNotes.$inferSelect;
export type NewContactNote = typeof contactNotes.$inferInsert;

/** A tag-targeted A/B variant: contacts carrying `tag` get this template (and
 * optional subject) instead of the campaign's base message. Stored wire-shaped. */
export interface CampaignVariant {
  tag: string;
  template_id: string;
  subject?: string | null;
}

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
    // Optional audience segment: only list members carrying this tag receive it.
    segmentTag: text("segment_tag"),
    // Tag-targeted A/B variants; first matching tag wins, everyone else gets the base message.
    variants: jsonb("variants").$type<CampaignVariant[]>().notNull().default([]),
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

/**
 * A single recipient's edited copy of a campaign.
 *
 * The pre-flight lets you read each person's email before it goes; this is what
 * happens when you don't like what you read. Keyed by EMAIL rather than contact
 * id so an override survives a contact being removed and re-added, and so it
 * lines up with how the worker walks the audience.
 *
 * `subject`/`html` are stored ALREADY RENDERED (what you saw and edited). The
 * worker still runs them through render(), so a {{variable}} you type by hand
 * keeps working.
 */
export const campaignOverrides = pgTable(
  "campaign_overrides",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    /** Lowercased recipient address this override applies to. */
    email: text("email").notNull(),
    subject: text("subject"),
    html: text("html"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("campaign_overrides_unique").on(t.campaignId, t.email)],
);

// ---------------------------------------------------------------------------
// Messages — the atomic unit
// ---------------------------------------------------------------------------
/** A file attached to a message — a reference to an uploaded asset. */
export interface MessageAttachment {
  url: string;
  filename: string;
  content_type: string;
  size: number;
}

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
    // File attachments carried on the send — each references an uploaded asset by
    // its public URL (the worker fetches the bytes at send time and MIME-attaches).
    attachments: jsonb("attachments").$type<MessageAttachment[]>().notNull().default([]),
    campaignId: text("campaign_id"),
    sequenceId: text("sequence_id"),
    sequenceStep: integer("sequence_step"),
    idempotencyKey: text("idempotency_key"),
    status: messageStatusEnum("status").notNull().default("queued"),
    provider: text("provider"),
    providerMessageId: text("provider_message_id"),
    /**
     * How many times a human has re-sent this after a failure.
     *
     * Load-bearing, not a stat: the send queue keys jobs by message id for
     * idempotency, so re-enqueueing the same id is SILENTLY DROPPED while the
     * old job is still in the failed set. The count makes each attempt a
     * distinct job — and doubles as the "retried twice" the UI shows.
     */
    retryCount: integer("retry_count").notNull().default(0),
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
    /**
     * Null ONLY for the tenant-level reputation events (see TENANT_AUDIT_EVENTS) —
     * a throttle or a pause is about the tenant, not about one message. Every
     * message-trail query filters on this column by equality or an inner join, so
     * those rows are invisible to them; read them back with
     * `where sub_tenant_id = … and message_id is null`.
     */
    messageId: text("message_id").references(() => messages.id, { onDelete: "cascade" }),
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
    /**
     * The RFC 5322 `Message-ID` this entry carried, angle-bracketed.
     *
     * Mostly populated for INBOUND entries, from the arriving mail's own header —
     * that is the id we must quote in `In-Reply-To` for our answer to thread
     * inside the contact's client. Outbound ids are DERIVED as
     * `<{messageId}@{domain}>` at send time rather than stored, because the
     * thread row is written after the send is queued and a stored id would race
     * the job that needs it.
     *
     * Also carries the `References` chain the contact sent, so replying appends
     * to their chain instead of starting a competing one.
     */
    rfcMessageId: text("rfc_message_id"),
    /** The `References` chain the contact's client sent, so our reply extends it. */
    rfcReferences: text("rfc_references"),
    createdAt: createdAt(),
  },
  (t) => [
    index("thread_messages_thread_idx").on(t.threadId, t.createdAt),
    // The lookup an inbound reply does when it has no plus-address to go on.
    index("thread_messages_rfc_id_idx").on(t.rfcMessageId),
  ],
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
    /**
     * The client (sub-tenant) this conversation belongs to, or null for the
     * whole workspace.
     *
     * Without this a chat outlives the scope it was held under: you ask about
     * Acme, switch to Borealis, reopen the chat, and the transcript above reads
     * as Acme while every new answer is Borealis. Each answer is individually
     * correct and the conversation as a whole is nonsense. A chat is pinned to
     * where it happened, and the list only shows the ones for where you are.
     *
     * ON DELETE SET NULL, not cascade: losing a client domain shouldn't silently
     * destroy the operator's own record of the work they did for that client.
     */
    subTenantId: text("sub_tenant_id").references(() => subTenants.id, { onDelete: "set null" }),
    title: text("title").notNull().default("New chat"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("assistant_chats_org_user_idx").on(t.organizationId, t.userId, t.updatedAt),
    index("assistant_chats_scope_idx").on(t.organizationId, t.userId, t.subTenantId),
  ],
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
    // Which workspace the session should LAND in. Null = let the session pick
    // its default, which is right for support impersonation (you want the
    // customer's own default view). Set for the staff door into our own
    // account: without it the session calls `workspaces.find(live)` over every
    // org the identity belongs to, in no defined order, and lands wherever the
    // database happened to return first.
    workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
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
export type CampaignOverride = typeof campaignOverrides.$inferSelect;
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

// ---------------------------------------------------------------------------
// CMS — marketing content (blog + changelog) authored by staff in apps/admin.
// The marketing site fetches the PUBLISHED rows over HTTP (with a static
// fallback) and is revalidated on publish. See routes/cms.ts + apps/marketing.
// ---------------------------------------------------------------------------
export const blogPosts = pgTable(
  "blog_posts",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    category: postCategoryEnum("category").notNull().default("Company"),
    author: text("author").notNull().default("rootmail"),
    body: text("body").notNull().default(""), // Markdown, rendered on the article page
    coverImageUrl: text("cover_image_url"),
    // Curated "things we like" posts link off-site (no detail page) instead of a body.
    externalUrl: text("external_url"),
    source: text("source"),
    status: cmsStatusEnum("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdBy: text("created_by"), // staff id of record
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    statusPublishedIdx: index("blog_posts_status_published_idx").on(t.status, t.publishedAt),
  }),
);

export const changelogEntries = pgTable(
  "changelog_entries",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    // The release date shown on the marketing changelog — distinct from created_at.
    entryDate: timestamp("entry_date", { withTimezone: true }).defaultNow().notNull(),
    changes: jsonb("changes").$type<ChangeItem[]>().notNull(),
    status: cmsStatusEnum("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    statusDateIdx: index("changelog_status_date_idx").on(t.status, t.entryDate),
  }),
);

export type BlogPost = typeof blogPosts.$inferSelect;
export type NewBlogPost = typeof blogPosts.$inferInsert;
export type ChangelogEntry = typeof changelogEntries.$inferSelect;
export type NewChangelogEntry = typeof changelogEntries.$inferInsert;

// ---------------------------------------------------------------------------
// Support — customer-care tickets (distinct from sales leads). A signed-in
// customer files a ticket; staff reply (emailed) + close. Threaded by messages.
// ---------------------------------------------------------------------------
export const supportTickets = pgTable(
  "support_tickets",
  {
    id: text("id").primaryKey(),
    // Best-effort context (kept even if the org/user is later removed).
    organizationId: text("organization_id"),
    userId: text("user_id"),
    email: text("email").notNull(),
    name: text("name"),
    subject: text("subject"),
    status: supportTicketStatusEnum("status").notNull().default("open"),
    handledByStaffId: text("handled_by_staff_id"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    statusIdx: index("support_tickets_status_idx").on(t.status, t.lastMessageAt),
    orgIdx: index("support_tickets_org_idx").on(t.organizationId),
  }),
);

export const supportMessages = pgTable(
  "support_messages",
  {
    id: text("id").primaryKey(),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    author: supportMessageAuthorEnum("author").notNull(),
    staffUserId: text("staff_user_id"),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => ({
    ticketIdx: index("support_messages_ticket_idx").on(t.ticketId, t.createdAt),
  }),
);

export type SupportTicket = typeof supportTickets.$inferSelect;
export type NewSupportTicket = typeof supportTickets.$inferInsert;
export type SupportMessage = typeof supportMessages.$inferSelect;
export type NewSupportMessage = typeof supportMessages.$inferInsert;

// --- Announcements ----------------------------------------------------------
// Archive of staff broadcasts to account owners — the send itself goes through
// the system-mail pipeline; this row is the durable "what went out, when, by
// whom, to how many" record the admin console presents.
export const announcements = pgTable("announcements", {
  id: text("id").primaryKey(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  recipientCount: integer("recipient_count").notNull(),
  sentByStaffId: text("sent_by_staff_id").references(() => staffUsers.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export type Announcement = typeof announcements.$inferSelect;
export type NewAnnouncement = typeof announcements.$inferInsert;

// --- SAML single sign-on ----------------------------------------------------
// One SAML connection per organization (enterprise). The IdP config the org's
// admin pastes from Okta/Azure/etc.; email_domain routes "Log in with SSO" to the
// right IdP; enforced blocks password login for that domain; default_role is the
// role JIT-provisioned members receive on first SSO login.
export const ssoConnections = pgTable(
  "sso_connections",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Lower-cased email domain this connection covers (e.g. "acme.com").
    emailDomain: text("email_domain").notNull(),
    idpEntityId: text("idp_entity_id").notNull(),
    idpSsoUrl: text("idp_sso_url").notNull(),
    // The IdP's x509 signing certificate (PEM body, no headers required).
    idpCertificate: text("idp_certificate").notNull(),
    defaultRole: text("default_role").notNull().default("member"),
    enforced: boolean("enforced").notNull().default(false),
    active: boolean("active").notNull().default(true),
    // SHA-256 of the SCIM bearer token (the IdP authenticates provisioning with it).
    // Null = SCIM provisioning disabled for this org.
    scimTokenHash: text("scim_token_hash"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    orgIdx: uniqueIndex("sso_connections_org_idx").on(t.organizationId),
    domainIdx: uniqueIndex("sso_connections_domain_idx").on(t.emailDomain),
  }),
);

export type SsoConnection = typeof ssoConnections.$inferSelect;
export type NewSsoConnection = typeof ssoConnections.$inferInsert;

// --- Sender identities -------------------------------------------------------
// The org's own from-addresses (e.g. hello@acme.com). Verified through SES email
// identity verification (SES emails the owner a confirmation link); only verified
// identities may be used as a custom From on sends. Replies naturally return to
// the user's real mailbox, so "replies follow the business" comes for free.
export const senderIdentities = pgTable(
  "sender_identities",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    displayName: text("display_name"),
    status: text("status").notNull().default("pending"), // pending | verified
    // The address the org sends from when a message/campaign doesn't name one.
    // At most one default per org (enforced in app code on set/verify/delete).
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: createdAt(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
  },
  (t) => [
    // An address belongs to exactly one org, platform-wide.
    uniqueIndex("sender_identities_email_uq").on(t.email),
    index("sender_identities_org_idx").on(t.organizationId),
  ],
);

export type SenderIdentity = typeof senderIdentities.$inferSelect;
export type NewSenderIdentity = typeof senderIdentities.$inferInsert;
