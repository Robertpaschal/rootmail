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
    features: ["audit", "suppression", "threads", "sequences"],
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
    features: ["audit", "suppression", "threads", "sequences", "subtenants", "rbac"],
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
      "subtenants",
      "rbac",
      "proof",
      "dedicated_ip",
      "sso",
      "residency",
    ],
  },
};
