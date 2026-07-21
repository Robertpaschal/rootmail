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

// The CRM lifecycle a user moves contacts through (escalate/de-escalate) —
// distinct from deliverability `status`. Positive path: subscriber → engaged →
// customer → champion; `at_risk` is the side exit (like a CRM's "lost", but
// recoverable). Stage changes are user-driven and recorded as contact_events.
export const CONTACT_STAGES = ["subscriber", "engaged", "customer", "champion", "at_risk"] as const;
export type ContactStage = (typeof CONTACT_STAGES)[number];
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

// In-app AI assistant chat turns.
export const ASSISTANT_MESSAGE_ROLES = ["user", "assistant"] as const;
export type AssistantMessageRole = (typeof ASSISTANT_MESSAGE_ROLES)[number];

export const WORKSPACE_ENVIRONMENTS = ["live", "test"] as const;
export type WorkspaceEnvironment = (typeof WORKSPACE_ENVIRONMENTS)[number];

// Data-retention enforcement: "redact" strips PII/content but keeps the message
// skeleton + audit trail + content hash (so proof survives); "delete" removes the
// message rows outright (audit cascades).
export const RETENTION_MODES = ["redact", "delete"] as const;
export type RetentionMode = (typeof RETENTION_MODES)[number];

export const MEMBERSHIP_ROLES = ["owner", "admin", "member"] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

// Internal staff (apps/admin) — separate from customer membership roles, and
// enforced by capability (STAFF_PERMISSIONS) not hardcoded role checks, so roles
// are just named permission bundles and new ones are cheap to add.
//   superadmin: everything (money, broadcasts, staff admin, impersonation)
//   billing:    view + commerce/credit — delegate money without the keys
//   support:    view + customer tooling (suppressions, impersonate, leads)
//   readonly:   view-only (auditor/analyst)
export const STAFF_ROLES = ["superadmin", "billing", "support", "readonly"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const STAFF_PERMISSIONS = [
  "staff.read", // view orgs, messages, billing, analytics, leads, suppressions, audit
  "support.manage", // unblock suppressions, impersonate a customer, work leads
  "commerce.manage", // plans, add-ons, promotions, discounts, custom plans, account credit
  "announce.send", // broadcast announcement email to all customers
  "content.publish", // write & publish marketing content (blog posts + changelog)
  "staff.manage", // create staff, assign roles, deactivate ("fire")
] as const;
export type StaffPermission = (typeof STAFF_PERMISSIONS)[number];

export const STAFF_ROLE_PERMISSIONS: Record<StaffRole, StaffPermission[]> = {
  superadmin: [...STAFF_PERMISSIONS],
  billing: ["staff.read", "commerce.manage"],
  support: ["staff.read", "support.manage", "content.publish"],
  readonly: ["staff.read"],
};

// ---------------------------------------------------------------------------
// CMS — admin-managed marketing content (blog + changelog). The marketing site
// fetches the published rows over HTTP (with a static fallback) and is revalidated
// on publish; staff author it in apps/admin behind `content.publish`.
// ---------------------------------------------------------------------------
export const CMS_STATUSES = ["draft", "published"] as const;
export type CmsStatus = (typeof CMS_STATUSES)[number];

export const POST_CATEGORIES = ["Company", "Guide", "Things we like"] as const;
export type PostCategory = (typeof POST_CATEGORIES)[number];

// A changelog entry bundles one or more tagged changes.
export const CHANGE_KINDS = ["New", "Improved", "Fixed"] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];
export interface ChangeItem {
  kind: ChangeKind;
  text: string;
}

export function staffCan(role: StaffRole, permission: StaffPermission): boolean {
  return STAFF_ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

// ---------------------------------------------------------------------------
// Support — customer-care tickets, DISTINCT from sales leads. A signed-in
// customer files a ticket; staff (support.manage) triage + reply (emailed to the
// customer) + close. Threaded via support_messages.
// ---------------------------------------------------------------------------
export const SUPPORT_TICKET_STATUSES = ["open", "closed"] as const;
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];
export const SUPPORT_MESSAGE_AUTHORS = ["customer", "staff"] as const;
export type SupportMessageAuthor = (typeof SUPPORT_MESSAGE_AUTHORS)[number];

// ---------------------------------------------------------------------------
// Sales / CRM — enterprise "Contact sales" leads and their lifecycle.
// ---------------------------------------------------------------------------
// Pipeline stages a lead moves through. `new` is where the public form drops
// them; `won` links to a real org (often via a custom plan); `lost` closes it.
export const LEAD_STATUSES = ["new", "contacted", "qualified", "proposal", "won", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

// Where a lead came from — defaulted by the writer (the public form sets it),
// kept as free text so new entry points don't need a migration.
export const LEAD_SOURCE_CONTACT_FORM = "contact_form";

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
  /** Live workspaces (products/brands) included; -1 = unlimited. The test
   * Sandbox never counts against this. */
  workspaceLimit: number;
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
    workspaceLimit: 1,
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
    workspaceLimit: 3,
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
    workspaceLimit: 10,
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
    workspaceLimit: -1,
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

/**
 * Whether live email carries the small "Sent with rootmail" footer — PER WING
 * (PRICING-WINGS-SPEC §3d): a transactional message is branded while the org is on
 * the free transactional allowance (no blocks purchased, non-enterprise); a
 * marketing/sales message is branded while the marketing wing is Free. Paying for
 * the relevant wing removes it — the nudge lands exactly where the value is.
 */
export function wingBrandingRequired(
  messageType: string,
  org: {
    transactionalTier?: string | null;
    transactionalBlocks?: number | null;
    marketingTier?: string | null;
  },
): boolean {
  if (messageType === "marketing" || messageType === "sales") {
    return !org.marketingTier || org.marketingTier === "mk_free";
  }
  // Transactional is branded while on the free allowance (no blocks purchased).
  return (org.transactionalBlocks ?? 0) === 0;
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

// Add-ons are wing-AGNOSTIC (there is no separate "Platform plan" — its seats,
// workspaces, roles, SSO, proof, and residency live here) and are offered
// EVERYWHERE pricing renders. Each is priced PER ONE unit so the volume is never
// ambiguous. Two groups only decide where they surface most prominently:
//   • "transactional" → folded into the send-blocks purchase (dedicated IP, client
//     sending domains) since they're app-email concerns;
//   • "platform"      → the shared foundation (seats, workspaces, roles, SSO,
//     proof, residency, AI credits), shown on every billing surface.
// Boolean capabilities (roles/SSO/proof/residency) are a one-unit toggle that
// GRANTS a feature; quantity add-ons (seats, workspaces, domains, IPs, AI credits)
// stack. All bill on one org-level add-ons subscription.
export const ADD_ON_IDS = [
  "extra_seat",
  "workspace_pack",
  "dedicated_ip",
  "subtenant_pack",
  "contact_pack",
  "audience_pack",
  "ai_credit_pack",
  "custom_roles",
  "sso_scim",
  "proof_exports",
  "data_residency",
] as const;
export type AddOnId = (typeof ADD_ON_IDS)[number];

export interface AddOnDef {
  id: AddOnId;
  name: string;
  description: string;
  /** Singular unit as a user reads it ("seat", "workspace", "dedicated IP"). */
  unit: string;
  /** Plain-language note on what ONE unit is (kills "pack of N?" confusion). */
  unitNote: string;
  defaultUnitAmount: number;
  kind: AddOnKind;
  priceEnvKey: string;
  /** Resource units one purchased unit confers (1 seat, 1 workspace, 100 credits). */
  grant: number;
  /** A boolean capability this add-on unlocks (roles/SSO/proof/residency). */
  grantsFeature?: PlanFeature;
  /** Max quantity (1 = a toggle, e.g. SSO; omitted = stackable). */
  max?: number;
  /** Grouping only (all add-ons show everywhere): where it surfaces most. */
  wing: Wing;
}

export const ADD_ONS: Record<AddOnId, AddOnDef> = {
  extra_seat: {
    id: "extra_seat",
    name: "Team seat",
    description: "One more teammate who can sign in and work in rootmail.",
    unit: "seat",
    unitNote: "Priced per seat — one seat is one teammate.",
    defaultUnitAmount: 8,
    kind: "recurring",
    priceEnvKey: "STRIPE_PRICE_SEAT",
    grant: 1,
    wing: "platform",
  },
  workspace_pack: {
    id: "workspace_pack",
    name: "Workspace",
    description: "One more workspace — a separate space per product or brand, each with its own sending, templates, and audiences.",
    unit: "workspace",
    unitNote: "Priced per workspace — one workspace is one product or brand.",
    defaultUnitAmount: 10,
    kind: "recurring",
    priceEnvKey: "STRIPE_PRICE_ADDON_WORKSPACE_PACK",
    grant: 1,
    wing: "platform",
  },
  dedicated_ip: {
    id: "dedicated_ip",
    name: "Dedicated IP",
    description: "A sending IP address only you send from, so your reputation is entirely your own (most senders share a warm pool — this isolates yours).",
    unit: "dedicated IP",
    unitNote: "Priced per IP — one IP is one dedicated address.",
    defaultUnitAmount: 30,
    kind: "recurring",
    priceEnvKey: "STRIPE_PRICE_ADDON_DEDICATED_IP",
    grant: 1,
    grantsFeature: "dedicated_ip",
    wing: "transactional",
  },
  subtenant_pack: {
    id: "subtenant_pack",
    name: "Client sending domain",
    description: "Send on behalf of a client from their own verified domain, with their reputation kept separate from yours and everyone else's (for agencies and platforms).",
    unit: "client domain",
    unitNote: "Priced per domain — one is a single client's sending domain.",
    defaultUnitAmount: 2,
    kind: "recurring",
    priceEnvKey: "STRIPE_PRICE_ADDON_SUBTENANT_PACK",
    grant: 1,
    grantsFeature: "subtenants",
    wing: "transactional",
  },
  contact_pack: {
    id: "contact_pack",
    name: "Contact pack",
    description:
      "Room for 500 more contacts in your audiences without changing your plan — headroom when a signup wave hits. Raising your plan's contact size costs less per contact; this is the quick overflow valve.",
    unit: "pack of 500 contacts",
    unitNote: "Each pack fits 500 more contacts. Growing your plan's contact size is cheaper per contact — packs are for right-now headroom.",
    // $16/mo per +500 = $32 per 1k/mo — deliberately above every marketing tier's
    // per-1k rate (Starter $12 / Growth $18 / Pro $28), so upgrading the wing's
    // contact size stays the better deal (pricing doctrine: add-ons nudge up).
    defaultUnitAmount: 16,
    kind: "recurring",
    priceEnvKey: "STRIPE_PRICE_ADDON_CONTACT_PACK",
    grant: 500,
    wing: "marketing",
  },
  audience_pack: {
    id: "audience_pack",
    name: "Audience pack",
    description:
      "Room for 5 more audiences (lists) without changing your plan — for when you want another segment, campaign list, or brand and you're at your plan's limit. Moving up a plan raises your audience allowance for less per audience; this is the quick add-a-few valve.",
    unit: "pack of 5 audiences",
    unitNote: "Each pack adds 5 audiences. A higher plan includes more audiences for less per audience — packs are for right-now headroom.",
    // $12/mo per +5 audiences = $2.40/audience/mo — a stopgap that's pricier per
    // audience than the jump a wing upgrade buys, so upgrading stays the better
    // deal (pricing doctrine: add-ons nudge up).
    defaultUnitAmount: 12,
    kind: "recurring",
    priceEnvKey: "STRIPE_PRICE_ADDON_AUDIENCE_PACK",
    grant: 5,
    wing: "marketing",
  },
  ai_credit_pack: {
    id: "ai_credit_pack",
    name: "AI credits",
    description: "100 more AI assistant actions per month — drafting, building, and diagnosing across both wings.",
    unit: "100 credits/mo",
    unitNote: "Priced per pack — one pack is 100 AI actions each month.",
    defaultUnitAmount: 5,
    kind: "recurring",
    priceEnvKey: "STRIPE_PRICE_ADDON_AI_CREDITS",
    grant: 100,
    wing: "platform",
  },
  custom_roles: {
    id: "custom_roles",
    name: "Custom team roles",
    description: "Define your own roles from the full permission set — decide exactly who can send, edit content, or touch billing.",
    unit: "custom roles",
    unitNote: "One flat price enables custom roles for your whole team.",
    defaultUnitAmount: 15,
    kind: "recurring",
    priceEnvKey: "STRIPE_PRICE_ADDON_CUSTOM_ROLES",
    grant: 1,
    grantsFeature: "rbac",
    max: 1,
    wing: "platform",
  },
  sso_scim: {
    id: "sso_scim",
    name: "SAML SSO + SCIM",
    description: "Sign in through Okta, Microsoft Entra, or Google Workspace; new teammates are provisioned on first login and leavers lose access automatically.",
    unit: "SSO + SCIM",
    unitNote: "One flat price enables SSO + SCIM for your whole team.",
    defaultUnitAmount: 40,
    kind: "recurring",
    priceEnvKey: "STRIPE_PRICE_ADDON_SSO_SCIM",
    grant: 1,
    grantsFeature: "sso",
    max: 1,
    wing: "platform",
  },
  proof_exports: {
    id: "proof_exports",
    name: "Proof & compliance exports",
    description: "Cryptographically signed, tamper-evident records of exactly what you sent, exportable over any date range.",
    unit: "proof exports",
    unitNote: "One flat price enables signed compliance exports.",
    defaultUnitAmount: 25,
    kind: "recurring",
    priceEnvKey: "STRIPE_PRICE_ADDON_PROOF",
    grant: 1,
    grantsFeature: "proof",
    max: 1,
    wing: "platform",
  },
  data_residency: {
    id: "data_residency",
    name: "Data residency",
    description: "Pin where your data is stored and processed to meet regional requirements.",
    unit: "data residency",
    unitNote: "One flat price enables regional data residency.",
    defaultUnitAmount: 50,
    kind: "recurring",
    priceEnvKey: "STRIPE_PRICE_ADDON_RESIDENCY",
    grant: 1,
    grantsFeature: "residency",
    max: 1,
    wing: "platform",
  },
};

/** Add-ons that GRANT a boolean capability (vs. quantity add-ons). */
export function addonForFeature(feature: PlanFeature): AddOnDef | undefined {
  return ADD_ON_IDS.map((id) => ADD_ONS[id]).find((a) => a.grantsFeature === feature);
}

/** Stripe Billing Meter event for transactional overage (1 unit = 1,000 sends past
 * the purchased blocks). One global meter; the metered price lives on the blocks
 * product and bills on a dedicated monthly overage subscription. */
export const TX_OVERAGE_METER_EVENT = "rootmail_tx_overage_units";

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

// ---------------------------------------------------------------------------
// Sales / discounts — an admin can put a plan on sale (a % off shown everywhere
// pricing renders and applied at checkout via a synced auto-applied coupon, so
// what's marketed is what's charged). Shared helpers keep "is it on sale?" and
// "what's the sale price?" identical across the API, dashboard, and marketing.
// ---------------------------------------------------------------------------
export interface SaleState {
  percentOff: number | null;
  endsAt: string | Date | null;
}

/** A sale is on while it has a positive % off and hasn't passed its end date. */
export function saleActive(sale: SaleState | null | undefined, now: Date = new Date()): boolean {
  if (!sale || !sale.percentOff || sale.percentOff <= 0) return false;
  if (!sale.endsAt) return true;
  return new Date(sale.endsAt).getTime() > now.getTime();
}

/** Apply a % off to a base price, rounded to cents. */
export function salePrice(basePrice: number, percentOff: number): number {
  return Math.round(basePrice * (1 - percentOff / 100) * 100) / 100;
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
// Per-wing pricing (PRICING-WINGS-SPEC.md) — THE pricing model. Each wing is sized
// by its own metric so scaling one side never punishes the other:
//   Transactional → monthly SENDS, bought as BLOCKS (quantity × BLOCK_SIZE at
//     volume-discounted per-block rates — an estimator, not a guessed cap).
//   Marketing → CONTACTS (audience size, counted per audience membership).
//     Marketing sends NEVER consume transactional blocks — a million contacts can
//     always receive a campaign; you pay for the audience, not per promo round.
//   Platform → SEATS/workspaces + governance, shared across both wings.
// An org holds one tier per wing (+ a block quantity for transactional). These
// constants are the fallback; `pricing_tiers` (admin-editable) overrides them.
export const WINGS = ["transactional", "marketing", "platform"] as const;
export type Wing = (typeof WINGS)[number];

// --- Transactional block pricing -------------------------------------------
/** Sends per purchased block. */
export const BLOCK_SIZE = 25_000;
/** Free transactional allowance (no blocks purchased). */
export const FREE_TX_SENDS = 3_000;
/** Volume-discounted per-block $/mo — the whole quantity bills at its bracket's
 * rate (Stripe `tiers_mode: "volume"`). Past the last bracket → contact sales. */
export const BLOCK_BRACKETS: { upToBlocks: number; perBlock: number }[] = [
  { upToBlocks: 4, perBlock: 8 }, // ≤100k sends/mo @ $8/block
  { upToBlocks: 20, perBlock: 7 }, // ≤500k @ $7
  { upToBlocks: 80, perBlock: 6 }, // ≤2M @ $6
];
export const MAX_SELF_SERVE_BLOCKS = BLOCK_BRACKETS[BLOCK_BRACKETS.length - 1].upToBlocks;

/** Per-block monthly rate for a quantity (volume mode: one rate for the lot). */
export function blockRate(blocks: number): number {
  for (const b of BLOCK_BRACKETS) if (blocks <= b.upToBlocks) return b.perBlock;
  return BLOCK_BRACKETS[BLOCK_BRACKETS.length - 1].perBlock;
}

/** Monthly $ for N blocks (0 → 0). */
export function blocksMonthlyPrice(blocks: number): number {
  return blocks <= 0 ? 0 : blocks * blockRate(blocks);
}

/** Blocks needed to cover an estimated monthly send volume. */
export function blocksForSends(sends: number): number {
  return Math.max(1, Math.ceil(sends / BLOCK_SIZE));
}

// --- Marketing contact-size pricing ----------------------------------------
// Marketing's base is the CONTACT SIZE the user chooses (organizations.
// marketing_contacts) — like blocks, but for audience. The chosen tier then
// multiplies that size into price, monthly send allowance, and a per-day cap. So
// 500 contacts on Pro and 1,000 on Pro are genuinely different products.
/** Free marketing contact ceiling (no contacts purchased). */
export const FREE_MK_CONTACTS = 500;
/** Contacts one contact_pack add-on unit adds (= ADD_ONS.contact_pack.grant). */
export const CONTACT_PACK_SIZE = 500;
/** Audiences one audience_pack add-on unit adds (= ADD_ONS.audience_pack.grant). */
export const AUDIENCE_PACK_SIZE = 5;
/** Stripe bills marketing per this many contacts (keeps the quantity small). */
export const CONTACT_UNIT = 100;

/**
 * The org's total contact capacity: the tier base (free ceiling on Free, else the
 * purchased contact size) plus any contact-pack add-on units. Shared by the API's
 * capacity gate and the worker's waitlist-admission job so both agree exactly.
 */
export function contactCapForOrg(
  org: { marketingTier: string | null; marketingContacts: number },
  packUnits = 0,
): number {
  const base =
    !org.marketingTier || org.marketingTier === "mk_free" ? FREE_MK_CONTACTS : (org.marketingContacts ?? 0);
  return base + packUnits * CONTACT_PACK_SIZE;
}
/** Contact sizes the selector offers (self-serve; grows smoothly beyond). */
export const CONTACT_STEPS = [500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000] as const;
export const MAX_SELF_SERVE_CONTACTS = 250_000;

/** Monthly $ for a marketing tier at a chosen contact size (0 for Free). */
export function marketingMonthlyPrice(tier: TierDef, contacts: number): number {
  if (!tier.perThousandCents || contacts <= 0) return 0;
  return Math.round((contacts * tier.perThousandCents) / 1000) / 100;
}
/** Stripe per-CONTACT_UNIT price (cents) for a marketing tier. */
export function marketingUnitCents(tier: TierDef): number {
  return Math.round(((tier.perThousandCents ?? 0) * CONTACT_UNIT) / 1000);
}
/** Monthly send allowance = contacts × the tier's per-contact multiplier. */
export function marketingSendAllowance(tier: TierDef, contacts: number): number {
  const base = Math.max(contacts, tier.id === "mk_free" ? FREE_MK_CONTACTS : 0);
  return base * (tier.sendsPerContact ?? 0);
}
/** Per-day send cap = contacts × the tier's per-contact daily multiplier. */
export function marketingDailyLimit(tier: TierDef, contacts: number): number {
  const base = Math.max(contacts, tier.id === "mk_free" ? FREE_MK_CONTACTS : 0);
  return base * (tier.dailyPerContact ?? 0);
}
/** Stripe quantity (in CONTACT_UNIT units) for a contact size. */
export function contactUnits(contacts: number): number {
  return Math.max(1, Math.ceil(contacts / CONTACT_UNIT));
}

// --- Platform base (no Platform plan; these come free, extras are add-ons) ---
/** Seats included before any `extra_seat` add-on. */
export const BASE_SEATS = 2;
/** Live workspaces included before any `workspace_pack` add-on. */
export const BASE_WORKSPACES = 1;
/** AI assistant credits included before any `ai_credit_pack` add-on. */
export const BASE_AI_CREDITS = 20;

export interface TierDef {
  id: string; // "tx_free", "mk_growth", "pf_team" — stable, wing-prefixed
  wing: Wing;
  name: string;
  /** Order within the wing (0 = entry/Free). */
  rank: number;
  /** Whole monthly / yearly USD; null = custom / contact sales. */
  priceMonthly: number | null;
  priceYearly: number | null;
  /** Org-level AI credits this tier grants — SUMMED across the org's three tiers
   * (+ ai_credit_pack). -1 = unlimited (wins). A free-everything org nets 15. */
  aiCredits: number;
  /** PlanFeature flags this tier unlocks (re-homed to their wing). */
  features: PlanFeature[];
  trialDays: number;
  // --- Transactional (metric = monthly sends) ---
  includedSends?: number; // -1 = unlimited
  blockSize?: number; // sends per purchasable block (drives the estimator UI)
  allowOverage?: boolean;
  overagePer1000?: number; // USD per 1,000 sends past included
  includedSubTenants?: number; // client sending domains; -1 = unlimited
  // --- Marketing (metric = CONTACT SIZE, chosen by the user) ---
  // The tier no longer *caps* contacts — it multiplies the chosen contact size
  // into what the tier is worth: price, monthly sends, and the per-day limit.
  includedContacts?: number; // free-tier contact ceiling only (mk_free); paid = user-chosen
  perThousandCents?: number; // cents per 1,000 contacts/mo — price = contacts/1000 × this
  sendsPerContact?: number; // monthly send allowance = contacts × this
  dailyPerContact?: number; // per-day send cap = contacts × this
  includedAudiences?: number; // distinct audiences (lists) this tier allows; -1 = unlimited
  // --- Platform base (everyone sits on the free base; extras are add-ons) ---
  seats?: number; // -1 = unlimited
  workspaceLimit?: number; // -1 = unlimited
  // Stripe linkage (synced by syncTierPrice; absent on the constants). Each paid
  // tier is its own Stripe product with monthly + yearly recurring prices.
  stripePriceMonthId?: string | null;
  stripePriceYearId?: string | null;
  /** Metered overage price (tx_blocks): $/1,000 sends past the purchased blocks,
   * billed on a dedicated monthly overage subscription. */
  stripeOveragePriceId?: string | null;
}

// Strawman numbers (owner delegated these to me; admin-editable via `pricing_tiers`).
// Org-level AI credits are BASE_AI_CREDITS + ai_credit_pack add-ons (carried across
// both wings), NOT granted by tiers — so every tier's aiCredits is 0. Boolean
// capabilities (rbac/sso/proof/residency) and client domains/dedicated IP are
// ADD-ONS now, not tier features. There is no "contact us" tier: transactional is
// Free→Blocks, marketing scales with contact size, Platform is the free base.
export const WING_TIERS: TierDef[] = [
  // Transactional — Free allowance, then BLOCKS (quantity × BLOCK_SIZE at
  // BLOCK_BRACKETS rates; org's block count lives on organizations.transactional_blocks).
  // Blocks are pure VOLUME — audit + suppression are baseline; client domains and a
  // dedicated IP are add-ons folded into the purchase.
  { id: "tx_free", wing: "transactional", name: "Free", rank: 0, priceMonthly: 0, priceYearly: 0, aiCredits: 0, features: ["audit", "suppression", "threads"], trialDays: 0, includedSends: FREE_TX_SENDS, blockSize: BLOCK_SIZE, allowOverage: false, overagePer1000: 0, includedSubTenants: 0 },
  { id: "tx_blocks", wing: "transactional", name: "Send blocks", rank: 1, priceMonthly: BLOCK_BRACKETS[0].perBlock, priceYearly: BLOCK_BRACKETS[0].perBlock * 10, aiCredits: 0, features: ["audit", "suppression", "threads"], trialDays: 0, includedSends: 0 /* = blocks × BLOCK_SIZE */, blockSize: BLOCK_SIZE, allowOverage: true, overagePer1000: 0.4, includedSubTenants: 0 },
  // Marketing — the CONTACT SIZE is the base; the tier multiplies it into price,
  // monthly sends, and a daily cap (perContactCents / sendsPerContact / dailyPerContact).
  // Objective, enforced dimensions only: audience size (contacts), monthly + daily
  // send volume (contacts × multiplier), the number of distinct audiences, and the
  // feature unlocks. The Replies inbox ("threads") is a BASELINE on every tier of
  // both wings — never lose a reply; sequences are the paid automation on top.
  { id: "mk_free", wing: "marketing", name: "Free", rank: 0, priceMonthly: 0, priceYearly: 0, aiCredits: 0, features: ["campaigns", "threads"], trialDays: 0, includedContacts: FREE_MK_CONTACTS, perThousandCents: 0, sendsPerContact: 2, dailyPerContact: 1, includedAudiences: 1 },
  { id: "mk_starter", wing: "marketing", name: "Starter", rank: 1, priceMonthly: 0, priceYearly: 0, aiCredits: 0, features: ["campaigns", "threads"], trialDays: 0, perThousandCents: 1_200, sendsPerContact: 12, dailyPerContact: 1, includedAudiences: 3 },
  { id: "mk_growth", wing: "marketing", name: "Growth", rank: 2, priceMonthly: 0, priceYearly: 0, aiCredits: 0, features: ["campaigns", "sequences", "threads"], trialDays: 0, perThousandCents: 1_800, sendsPerContact: 20, dailyPerContact: 2, includedAudiences: 10 },
  { id: "mk_pro", wing: "marketing", name: "Pro", rank: 3, priceMonthly: 0, priceYearly: 0, aiCredits: 0, features: ["campaigns", "sequences", "threads"], trialDays: 0, perThousandCents: 2_800, sendsPerContact: 40, dailyPerContact: 4, includedAudiences: 50 },
  // Platform — the invisible FREE base every org sits on. Seats/workspaces beyond
  // this, and roles/SSO/proof/residency, are add-ons (no Platform plan, no contact-us).
  { id: "pf_solo", wing: "platform", name: "Base", rank: 0, priceMonthly: 0, priceYearly: 0, aiCredits: 0, features: [], trialDays: 0, seats: BASE_SEATS, workspaceLimit: BASE_WORKSPACES },
];

/** The tiers for one wing, in rank order. */
export function tiersForWing(wing: Wing): TierDef[] {
  return WING_TIERS.filter((t) => t.wing === wing).sort((a, b) => a.rank - b.rank);
}

/** A tier by id (catalog fallback). */
export function getTierDef(id: string): TierDef | undefined {
  return WING_TIERS.find((t) => t.id === id);
}

/** The entry (Free/rank-0) tier id for a wing — the default an org sits on. */
export function defaultTierId(wing: Wing): string {
  return tiersForWing(wing)[0]?.id ?? "";
}

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
