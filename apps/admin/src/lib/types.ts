export type StaffRole = "superadmin" | "support" | "readonly";

export interface StaffUser {
  object: "staff_user";
  id: string;
  email: string;
  name: string | null;
  role: StaffRole;
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

export interface OrgDetail {
  object: "org_detail";
  id: string;
  name: string;
  slug: string;
  plan: string;
  plan_status: string;
  postal_address: string | null;
  stripe_customer_id: string | null;
  created_at: string;
  workspaces: OrgWorkspace[];
  members: OrgMember[];
  usage_this_period: number;
  total_messages: number;
  sub_tenants: number;
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
  ai_credits: number;
  trial_days: number;
  features: string[];
  rank: number;
  active: boolean;
  stripe_price_month_id: string | null;
  stripe_price_year_id: string | null;
}

export type PlanPatch = Partial<{
  name: string;
  price: number | null;
  monthly_quota: number;
  overage_per_1000_cents: number;
  included_sub_tenants: number;
  seats: number;
  ai_credits: number;
  trial_days: number;
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
