export type StaffRole = "superadmin" | "billing" | "support" | "readonly";
export type StaffPermission =
  | "staff.read"
  | "support.manage"
  | "commerce.manage"
  | "announce.send"
  | "content.publish"
  | "staff.manage";

// --- CMS (admin-managed blog + changelog) ---------------------------------
export type CmsStatus = "draft" | "published";
export type PostCategory = "Company" | "Guide" | "Things we like";
export type ChangeKind = "New" | "Improved" | "Fixed";
export interface ChangeItem {
  kind: ChangeKind;
  text: string;
}

export interface AdminBlogPost {
  object: "blog_post";
  id: string;
  slug: string;
  title: string;
  description: string;
  category: PostCategory;
  author: string;
  body: string;
  cover_image_url: string | null;
  external_url: string | null;
  source: string | null;
  reading_minutes: number;
  date: string;
  status: CmsStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminChangelogEntry {
  object: "changelog_entry";
  id: string;
  title: string;
  date: string;
  changes: ChangeItem[];
  status: CmsStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StaffUser {
  object: "staff_user";
  id: string;
  email: string;
  name: string | null;
  role: StaffRole;
  active: boolean;
  created_at: string;
}

export interface MeResult {
  staff: StaffUser;
  permissions: StaffPermission[];
}

export interface StaffAuditEntry {
  object: "staff_audit";
  id: string;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  created_at: string;
}

export interface LoginResult {
  staff: StaffUser;
  session_token: string;
  session_expires_at: string;
}

export interface OrgSummary {
  object: "org_summary";
  id: string;
  name: string;
  slug: string;
  plan: string;
  plan_status: string;
  members: number;
  usage_this_period: number;
  created_at: string;
}

export interface OrgWorkspace {
  id: string;
  name: string;
  environment: "live" | "test";
}

export interface OrgMember {
  user_id: string;
  email: string;
  name: string | null;
  role: string;
}

export interface CustomPlan {
  object: "custom_plan";
  id: string;
  organization_id: string;
  lead_id: string | null;
  name: string;
  price_cents: number;
  interval: "month" | "year";
  monthly_quota: number;
  allow_overage: boolean;
  overage_per_1000_cents: number;
  included_sub_tenants: number;
  seats: number;
  ai_credits: number;
  active: boolean;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  created_at: string;
  updated_at: string;
}

// A custom plan plus its org — for the central custom-subs list on /pricing.
export interface CustomPlanListItem extends CustomPlan {
  organization: { id: string; name: string; plan: string; plan_status: string };
}

export interface BillingStatus {
  mode: "stripe" | "local";
  stripe_configured: boolean;
  live: boolean;
  publishable_set: boolean;
  overage_meters: { pro: boolean; scale: boolean };
}

export interface CustomPlanInput {
  name: string;
  price_cents: number;
  interval: "month" | "year";
  monthly_quota: number;
  allow_overage: boolean;
  overage_per_1000_cents: number;
  included_sub_tenants: number;
  seats: number;
  ai_credits: number;
  lead_id?: string;
}

export interface OrgDetail {
  object: "org_detail";
  id: string;
  name: string;
  slug: string;
  plan: string;
  plan_status: string;
  postal_address: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
  workspaces: OrgWorkspace[];
  members: OrgMember[];
  usage_this_period: number;
  total_messages: number;
  sub_tenants: number;
  custom_plan: CustomPlan | null;
}

export interface ListResponse<T> {
  object: "list";
  data: T[];
}

export interface AdminBilling {
  object: "admin_billing";
  plan: string;
  plan_status: string;
  stripe_customer_id: string | null;
  /** Stripe customer balance in cents; negative = credit toward future invoices. */
  balance: number;
  subscription: {
    status: string;
    items: {
      description: string;
      unit_amount: number | null;
      quantity: number | null;
      interval: string | null;
    }[];
  } | null;
  invoices: {
    id: string;
    number: string | null;
    status: string | null;
    total: number;
    currency: string;
    created: number;
    url: string | null;
  }[];
}

export interface AdminPlan {
  object: "plan";
  id: string;
  name: string;
  price: number | null;
  monthly_quota: number;
  allow_overage: boolean;
  overage_per_1000_cents: number;
  included_sub_tenants: number;
  seats: number;
  workspace_limit: number;
  ai_credits: number;
  trial_days: number;
  features: string[];
  rank: number;
  active: boolean;
  stripe_price_month_id: string | null;
  stripe_price_year_id: string | null;
  sale_percent_off: number | null;
  sale_ends_at: string | null;
  sale_stripe_coupon_id: string | null;
}

export type PlanPatch = Partial<{
  name: string;
  price: number | null;
  monthly_quota: number;
  overage_per_1000_cents: number;
  included_sub_tenants: number;
  seats: number;
  workspace_limit: number;
  ai_credits: number;
  trial_days: number;
  active: boolean;
  features: string[];
}>;

export interface AdminAddon {
  object: "addon";
  id: string;
  name: string;
  description: string;
  unit: string;
  unit_amount: number;
  grant: number;
  active: boolean;
  rank: number;
  stripe_price_id: string | null;
  sale_percent_off: number | null;
  sale_ends_at: string | null;
}

export type AddonPatch = Partial<{
  name: string;
  unit_amount: number;
  grant: number;
  active: boolean;
}>;

export interface Promotion {
  object: "promotion";
  id: string;
  code: string;
  active: boolean;
  discount: string;
  duration: string | null;
  duration_in_months: number | null;
  times_redeemed: number;
  max_redemptions: number | null;
  expires_at: number | null;
}

export interface CreatePromotion {
  code: string;
  type: "percent" | "amount";
  value: number;
  duration: "once" | "repeating" | "forever";
  duration_in_months?: number;
  max_redemptions?: number;
}

export interface Suppression {
  object: "suppression";
  id: string;
  email: string;
  reason: string;
  source: string | null;
  sub_tenant_id: string | null;
  created_at: string;
}

export type LeadStatus = "new" | "contacted" | "qualified" | "proposal" | "won" | "lost";

export const LEAD_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "proposal",
  "won",
  "lost",
];

export interface Lead {
  object: "lead";
  id: string;
  name: string;
  email: string;
  company: string | null;
  website: string | null;
  phone: string | null;
  company_size: string | null;
  expected_volume: string | null;
  current_provider: string | null;
  message: string | null;
  status: LeadStatus;
  source: string;
  owner_staff_id: string | null;
  owner_email: string | null;
  organization_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadNote {
  object: "lead_note";
  id: string;
  body: string;
  kind: string;
  staff_user_id: string | null;
  staff_email: string | null;
  created_at: string;
}

export interface LeadDetail extends Lead {
  organization: { id: string; name: string; plan: string } | null;
  notes: LeadNote[];
}

export interface LeadListResponse extends ListResponse<Lead> {
  counts: Record<LeadStatus, number>;
}

export type LeadPatch = Partial<{
  status: LeadStatus;
  owner_staff_id: string | null;
  organization_id: string | null;
}>;

export interface AnnouncementRecipients {
  object: "announcement_recipients";
  count: number;
}

export interface AdminAnalytics {
  object: "admin_analytics";
  period: string;
  orgs: { total: number; paid: number; by_plan: Record<string, number> };
  revenue: { currency: string; mrr_estimate: number; by_plan: Record<string, number> };
  volume: { emails_this_period: number; trend: { period: string; emails: number }[] };
  deliverability: {
    total: number;
    by_status: Record<string, number>;
    delivered_rate: number;
    bounce_rate: number;
    complaint_rate: number;
  };
  ai: { credits_this_period: number };
  growth: { new_orgs_30d: number; prev_30d: number; change_pct: number | null };
}

export interface MessageSummary {
  id: string;
  object: "message";
  type: string;
  status: string;
  to: string;
  subject: string;
  sub_tenant_id: string | null;
  sandbox: boolean;
  created_at: string;
}

export interface AuditEvent {
  event: string;
  actor: string;
  ip?: string;
  user_agent?: string;
  provider?: string;
  provider_message_id?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface MessageDetail extends MessageSummary {
  from: { name?: string; email: string };
  reply_to: string | null;
  content_hash: string | null;
  provider: string | null;
  provider_message_id: string | null;
  error: string | null;
  organization: { id: string; name: string } | null;
  workspace_id: string | null;
  audit: AuditEvent[];
}

// --- Support (customer-care tickets — distinct from sales leads) -----------
export type SupportTicketStatus = "open" | "closed";

export interface SupportMessage {
  object: "support_message";
  id: string;
  ticket_id: string;
  author: "customer" | "staff";
  staff_user_id: string | null;
  body: string;
  created_at: string;
}

export interface SupportTicketListItem {
  object: "support_ticket";
  id: string;
  organization_id: string | null;
  organization_name: string | null;
  email: string;
  name: string | null;
  subject: string | null;
  status: SupportTicketStatus;
  handled_by_staff_id: string | null;
  last_message_at: string;
  created_at: string;
  message_count: number;
  last_message: { author: "customer" | "staff"; body: string; created_at: string } | null;
}

export interface SupportTicketDetail {
  object: "support_ticket";
  id: string;
  organization_id: string | null;
  organization_name: string | null;
  email: string;
  name: string | null;
  subject: string | null;
  status: SupportTicketStatus;
  handled_by_staff_id: string | null;
  last_message_at: string;
  created_at: string;
  messages: SupportMessage[];
}
