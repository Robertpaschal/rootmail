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
