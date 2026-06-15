/**
 * Shared enums for the rootmail domain model.
 *
 * This module is intentionally dependency-free and side-effect-free so it can be
 * imported by the database schema (via `@rootmail/core/constants`) without pulling
 * in env parsing, Redis, or the queue.
 */

export const MESSAGE_TYPES = ["transactional", "marketing", "sales"] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export const TEMPLATE_TYPES = ["transactional", "marketing", "sales", "any"] as const;
export type TemplateType = (typeof TEMPLATE_TYPES)[number];

export const MESSAGE_STATUSES = [
  "queued",
  "sending",
  "sent",
  "delivered",
  "bounced",
  "complained",
  "failed",
  "suppressed",
] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const AUDIT_EVENTS = [
  "queued",
  "sending",
  "sent",
  "delivered",
  "opened",
  "clicked",
  "bounced",
  "complained",
  "unsubscribed",
  "failed",
  "suppressed",
  "retried",
] as const;
export type AuditEvent = (typeof AUDIT_EVENTS)[number];

export const PRIORITIES = ["high", "normal", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const CONTACT_STATUSES = ["active", "unsubscribed", "bounced", "complained"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const SUBTENANT_STATUSES = [
  "pending_verification",
  "verifying",
  "verified",
  "failed",
  "disabled",
] as const;
export type SubTenantStatus = (typeof SUBTENANT_STATUSES)[number];

export const SUPPRESSION_REASONS = ["bounce", "complaint", "unsubscribe", "manual"] as const;
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

export const THREAD_STATUSES = ["open", "needs_reply", "closed"] as const;
export type ThreadStatus = (typeof THREAD_STATUSES)[number];

export const MESSAGE_DIRECTIONS = ["outbound", "inbound"] as const;
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];

export const WORKSPACE_ENVIRONMENTS = ["live", "test"] as const;
export type WorkspaceEnvironment = (typeof WORKSPACE_ENVIRONMENTS)[number];

export const MEMBERSHIP_ROLES = ["owner", "admin", "member"] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

// ---------------------------------------------------------------------------
// RBAC — a permission matrix enforced on every tier; custom roles (which remix
// these permissions) are a Scale feature.
// ---------------------------------------------------------------------------
export const PERMISSIONS = [
  "read", // view resources — baseline for every role
  "messages.send",
  "content.manage", // templates, sequences, campaigns, lists, contacts
  "domains.manage", // sub-tenants
  "webhooks.manage",
  "members.manage", // invites + roles
  "billing.manage", // plan, seats, add-ons
  "apikeys.manage",
  "proof.read", // Layer-3 proof bundles
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Built-in roles. owner/admin are full-access; member can send + manage content
 * but not touch billing, members, keys, domains, or webhooks. Custom roles
 * (Scale) can grant any subset — e.g. a read-only "viewer" or a "marketer". */
export const SYSTEM_ROLE_PERMISSIONS: Record<MembershipRole, Permission[]> = {
  owner: [...PERMISSIONS],
  admin: [...PERMISSIONS],
  member: ["read", "messages.send", "content.manage"],
};

// ---------------------------------------------------------------------------
// Plans & pricing
// ---------------------------------------------------------------------------
// Value-based tiers: every step up adds volume AND a capability, so upgrades
// have a clear trigger ("I need replies / sub-tenants / proof"), not just "more
// emails". Free hard-caps to create the nudge; paid plans bill volume-discounted
// overage so growth is never blocked. -1 means unlimited.
export const PLAN_IDS = ["free", "pro", "scale", "enterprise"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export type PlanFeature =
  | "audit"
  | "suppression"
  | "subtenants"
  | "threads"
  | "sequences"
  | "campaigns"
  | "rbac"
  | "proof"
  | "dedicated_ip"
  | "sso"
  | "residency";

export interface PlanDef {
  id: PlanId;
  name: string;
  /** Monthly USD; null = custom / contact sales. */
  price: number | null;
  /** Included emails per calendar month. */
  monthlyQuota: number;
  /** Free hard-caps; paid plans bill overage instead of blocking. */
  allowOverage: boolean;
  /** USD per 1,000 emails over the included quota. */
  overagePer1000: number;
  /** Sub-tenants included before per-tenant pricing; -1 = unlimited. */
  includedSubTenants: number;
  /** Team seats; -1 = unlimited. */
  seats: number;
  features: PlanFeature[];
}

export const PLANS: Record<PlanId, PlanDef> = {
  free: {
    id: "free",
    name: "Free",
    price: 0,
    monthlyQuota: 3_000,
    allowOverage: false,
    overagePer1000: 0,
    includedSubTenants: 0,
    seats: 1,
    features: ["audit", "suppression"],
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 20,
    monthlyQuota: 50_000,
    allowOverage: true,
    overagePer1000: 0.85,
    includedSubTenants: 0,
    seats: 3,
    features: ["audit", "suppression", "threads", "sequences", "campaigns"],
  },
  scale: {
    id: "scale",
    name: "Scale",
    price: 80,
    monthlyQuota: 250_000,
    allowOverage: true,
    overagePer1000: 0.7,
    includedSubTenants: 10,
    seats: -1,
    features: ["audit", "suppression", "threads", "sequences", "campaigns", "subtenants", "rbac"],
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    price: null,
    monthlyQuota: 1_000_000,
    allowOverage: true,
    overagePer1000: 0.5,
    includedSubTenants: -1,
    seats: -1,
    features: [
      "audit",
      "suppression",
      "threads",
      "sequences",
      "campaigns",
      "subtenants",
      "rbac",
      "proof",
      "dedicated_ip",
      "sso",
      "residency",
    ],
  },
};

/** Plan order, lowest tier first — drives "cheapest plan that unlocks X". */
const PLAN_RANK: Record<PlanId, number> = { free: 0, pro: 1, scale: 2, enterprise: 3 };

/** The lowest tier (in PLAN_IDS order) whose plan includes a feature, or null. */
export function requiredPlanFor(feature: PlanFeature): PlanId | null {
  return PLAN_IDS.find((id) => PLANS[id].features.includes(feature)) ?? null;
}

/** Does this plan unlock the feature? */
export function featureUnlocked(planId: PlanId, feature: PlanFeature): boolean {
  return PLANS[planId]?.features.includes(feature) ?? false;
}

/** True if `planId` is at least `minPlanId` in tier order. */
export function planAtLeast(planId: PlanId, minPlanId: PlanId): boolean {
  return PLAN_RANK[planId] >= PLAN_RANK[minPlanId];
}

// ---------------------------------------------------------------------------
// Plan/subscription status — the subset of Stripe subscription statuses we act
// on. `active` is the default (and the only value local mode ever sets).
// ---------------------------------------------------------------------------
export const PLAN_STATUSES = ["active", "trialing", "past_due", "canceled", "incomplete"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

// ---------------------------------------------------------------------------
// Add-ons — "in-between" purchases priced per unit/quantity that sit on top of
// any plan (extra seats, a dedicated IP, sub-tenant capacity). `defaultUnitAmount`
// is the fallback price (USD per unit / month) used in local mode or whenever a
// Stripe price id is missing or fails to load. `priceEnvKey` names the env var
// holding the real Stripe price id; `grant` is how much of the underlying
// resource one unit confers (e.g. a sub-tenant pack of 10).
// ---------------------------------------------------------------------------
export const ADD_ON_KINDS = ["recurring", "metered", "one_time"] as const;
export type AddOnKind = (typeof ADD_ON_KINDS)[number];

export const ADD_ON_IDS = ["extra_seat", "dedicated_ip", "subtenant_pack", "ai_credit_pack"] as const;
export type AddOnId = (typeof ADD_ON_IDS)[number];

export interface AddOnDef {
  id: AddOnId;
  name: string;
  description: string;
  unit: string;
  defaultUnitAmount: number;
  kind: AddOnKind;
  priceEnvKey: string;
  grant: number;
}

export const ADD_ONS: Record<AddOnId, AddOnDef> = {
  extra_seat: {
    id: "extra_seat",
    name: "Extra seat",
    description: "One additional team member beyond your plan's included seats.",
    unit: "seat",
    defaultUnitAmount: 8,
    kind: "recurring",
    priceEnvKey: "STRIPE_PRICE_SEAT",
    grant: 1,
  },
  dedicated_ip: {
    id: "dedicated_ip",
    name: "Dedicated IP",
    description: "A dedicated sending IP for reputation isolation.",
    unit: "IP",
    defaultUnitAmount: 30,
    kind: "recurring",
    priceEnvKey: "STRIPE_PRICE_ADDON_DEDICATED_IP",
    grant: 1,
  },
  subtenant_pack: {
    id: "subtenant_pack",
    name: "Sub-tenant pack",
    description: "Raises your included sub-tenant ceiling by 10 per pack.",
    unit: "pack of 10",
    defaultUnitAmount: 15,
    kind: "recurring",
    priceEnvKey: "STRIPE_PRICE_ADDON_SUBTENANT_PACK",
    grant: 10,
  },
  ai_credit_pack: {
    id: "ai_credit_pack",
    name: "AI credit pack",
    description: "Adds 100 AI drafts/month on top of your plan's included credits.",
    unit: "100 credits",
    defaultUnitAmount: 5,
    kind: "recurring",
    priceEnvKey: "STRIPE_PRICE_ADDON_AI_CREDITS",
    grant: 100,
  },
};

// Add-ons extend *quantities* (more seats, sub-tenant capacity, AI credits); they
// never unlock a gated capability — those require the tier that includes them.
// That, plus premium per-unit pricing, keeps "stack add-ons" pricier than the
// equivalent upgrade, so growth nudges users up a tier. See [[pricing-design-principles]].

// ---------------------------------------------------------------------------
// Billing interval (monthly vs yearly). Yearly = monthly × (12 − months free).
// ---------------------------------------------------------------------------
export const BILLING_INTERVALS = ["month", "year"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];
export const YEARLY_MONTHS_FREE = 2;

/** Annual price for a plan (null = custom/contact sales). */
export function yearlyPrice(planId: PlanId): number | null {
  const p = PLANS[planId].price;
  return p === null ? null : p * (12 - YEARLY_MONTHS_FREE);
}

// Monthly "AI credits" = AI template drafts included per plan. AI inference
// costs us, so it's metered rather than free-for-all on lower tiers. -1 =
// unlimited. Directional numbers — tune per [[pricing-design-principles]].
export const AI_CREDITS: Record<PlanId, number> = {
  free: 3,
  pro: 50,
  scale: 250,
  enterprise: -1,
};

// ---------------------------------------------------------------------------
// Outbound dev webhooks
// ---------------------------------------------------------------------------
export const WEBHOOK_ENDPOINT_STATUSES = ["active", "disabled"] as const;
export type WebhookEndpointStatus = (typeof WEBHOOK_ENDPOINT_STATUSES)[number];

// Event names a dev can subscribe to. An endpoint listing "*" receives all.
export const WEBHOOK_EVENTS = [
  "message.sent",
  "message.delivered",
  "message.opened",
  "message.clicked",
  "message.bounced",
  "message.complained",
  "message.failed",
  "message.suppressed",
  "message.received",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** Auto-disable an endpoint after this many consecutive fully-failed deliveries. */
export const WEBHOOK_DISABLE_THRESHOLD = 10;
/** BullMQ delivery attempts per event before it's considered finally failed. */
export const WEBHOOK_MAX_ATTEMPTS = 6;

// ---------------------------------------------------------------------------
// Sequences (drip automation) — Pro feature
// ---------------------------------------------------------------------------
export const SEQUENCE_STATUSES = ["active", "paused"] as const;
export type SequenceStatus = (typeof SEQUENCE_STATUSES)[number];

export const ENROLLMENT_STATUSES = ["active", "completed", "exited", "failed"] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const SEQUENCE_TRIGGER_TYPES = ["manual", "contact_created", "contact_tagged"] as const;
export type SequenceTriggerType = (typeof SEQUENCE_TRIGGER_TYPES)[number];

export const SEQUENCE_STEP_TYPES = ["wait", "send", "branch"] as const;
export type SequenceStepType = (typeof SEQUENCE_STEP_TYPES)[number];

/** Events that, when they occur on an enrolled contact, end the enrollment. */
export const SEQUENCE_EXIT_EVENTS = ["replied", "unsubscribed"] as const;
export type SequenceExitEvent = (typeof SEQUENCE_EXIT_EVENTS)[number];

export const MAX_SEQUENCE_STEPS = 25;

export interface SequenceTrigger {
  type: SequenceTriggerType;
  /** Tag to match when type is "contact_tagged". */
  tag?: string;
}

export type SequenceStep =
  | { type: "wait"; hours: number }
  | { type: "send"; template: string }
  | { type: "branch"; event: "opened" | "clicked"; within_hours: number; goto: number };

// ---------------------------------------------------------------------------
// Campaigns (bulk send to a list) — Pro feature; volume via the monthly quota
// ---------------------------------------------------------------------------
export const CAMPAIGN_STATUSES = ["draft", "scheduled", "sending", "sent"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];
