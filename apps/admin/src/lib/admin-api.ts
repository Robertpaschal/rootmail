import { getStaffToken } from "./session";
import type {
  AdminAddon,
  AdminAnalytics,
  AdminBilling,
  AdminPlan,
  AddonPatch,
  CustomPlan,
  CustomPlanInput,
  Lead,
  LeadDetail,
  LeadListResponse,
  LeadNote,
  LeadPatch,
  LeadStatus,
  ListResponse,
  LoginResult,
  MessageDetail,
  MessageSummary,
  CreatePromotion,
  OrgDetail,
  OrgSummary,
  PlanPatch,
  Promotion,
  StaffUser,
  Suppression,
} from "./types";

/** Where the rootmail REST API lives. The admin console only ever calls it server-side. */
export const API_URL = process.env.ROOTMAIL_API_URL ?? "http://localhost:4000";

/** The API responded, but with a non-2xx status. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Couldn't reach the API at all (it's probably not running). */
export class ConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectionError";
  }
}

interface FetchOpts {
  method?: string;
  body?: unknown;
  /** Override the staff token (e.g. just-issued at login). */
  token?: string;
  /** Public endpoint (login) that doesn't carry a session. */
  noAuth?: boolean;
}

async function adminFetch<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const token = opts.noAuth ? null : (opts.token ?? (await getStaffToken()));
  if (!opts.noAuth && !token) throw new ApiError(401, "Not signed in.");

  let res: Response;
  try {
    res = await fetch(new URL(path, API_URL), {
      method: opts.method ?? "GET",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ConnectionError(
      `Cannot reach the rootmail API at ${API_URL}. Is \`pnpm api\` running?`,
    );
  }

  const text = await res.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const message: string =
      json?.error?.message ?? json?.message ?? res.statusText ?? "Request failed";
    throw new ApiError(res.status, message, json?.error?.type ?? json?.error?.code);
  }

  return json as T;
}

export const adminApi = {
  login: (body: { email: string; password: string }) =>
    adminFetch<LoginResult>("/v1/admin/auth/login", { method: "POST", body, noAuth: true }),
  logout: () => adminFetch<{ ok: boolean }>("/v1/admin/auth/logout", { method: "POST", body: {} }),
  me: () => adminFetch<{ staff: StaffUser }>("/v1/admin/auth/me"),

  listOrgs: () => adminFetch<ListResponse<OrgSummary>>("/v1/admin/orgs"),
  getOrg: (id: string) => adminFetch<OrgDetail>(`/v1/admin/orgs/${id}`),

  listOrgMessages: (id: string, limit = 25) =>
    adminFetch<ListResponse<MessageSummary>>(`/v1/admin/orgs/${id}/messages?limit=${limit}`),
  getMessage: (id: string) => adminFetch<MessageDetail>(`/v1/admin/messages/${id}`),

  impersonate: (userId: string) =>
    adminFetch<{ code: string; expires_at: string }>(`/v1/admin/users/${userId}/impersonate`, {
      method: "POST",
      body: {},
    }),

  analytics: () => adminFetch<AdminAnalytics>("/v1/admin/analytics"),

  listPromotions: () => adminFetch<ListResponse<Promotion>>("/v1/admin/promotions"),
  createPromotion: (body: CreatePromotion) =>
    adminFetch<Promotion>("/v1/admin/promotions", { method: "POST", body }),
  deactivatePromotion: (id: string) =>
    adminFetch<{ active: boolean }>(`/v1/admin/promotions/${id}/deactivate`, {
      method: "POST",
      body: {},
    }),

  listPlans: () => adminFetch<ListResponse<AdminPlan>>("/v1/admin/plans"),
  updatePlan: (id: string, patch: PlanPatch) =>
    adminFetch<AdminPlan & { stripe_sync?: string }>(`/v1/admin/plans/${id}`, {
      method: "PATCH",
      body: patch,
    }),
  setPlanSale: (id: string, body: { percent_off: number; ends_at?: string }) =>
    adminFetch<AdminPlan & { stripe_sync?: string }>(`/v1/admin/plans/${id}/sale`, {
      method: "POST",
      body,
    }),
  clearPlanSale: (id: string) =>
    adminFetch<AdminPlan>(`/v1/admin/plans/${id}/sale`, { method: "DELETE" }),

  listAddons: () => adminFetch<ListResponse<AdminAddon>>("/v1/admin/addons"),
  updateAddon: (id: string, patch: AddonPatch) =>
    adminFetch<AdminAddon & { stripe_sync?: string }>(`/v1/admin/addons/${id}`, {
      method: "PATCH",
      body: patch,
    }),

  getOrgBilling: (id: string) => adminFetch<AdminBilling>(`/v1/admin/orgs/${id}/billing`),
  grantCredit: (id: string, amountCents: number, reason?: string) =>
    adminFetch<{ applied: boolean }>(`/v1/admin/orgs/${id}/credit`, {
      method: "POST",
      body: { amount_cents: amountCents, reason },
    }),

  listOrgSuppressions: (id: string, limit = 50) =>
    adminFetch<ListResponse<Suppression>>(`/v1/admin/orgs/${id}/suppressions?limit=${limit}`),
  clearSuppression: (id: string) =>
    adminFetch<{ deleted: boolean }>(`/v1/admin/suppressions/${id}`, { method: "DELETE" }),

  listLeads: (status?: LeadStatus) =>
    adminFetch<LeadListResponse>(`/v1/admin/leads${status ? `?status=${status}` : ""}`),
  getLead: (id: string) => adminFetch<LeadDetail>(`/v1/admin/leads/${id}`),
  updateLead: (id: string, patch: LeadPatch) =>
    adminFetch<Lead>(`/v1/admin/leads/${id}`, { method: "PATCH", body: patch }),
  addLeadNote: (id: string, body: string) =>
    adminFetch<LeadNote>(`/v1/admin/leads/${id}/notes`, { method: "POST", body: { body } }),

  saveCustomPlan: (orgId: string, body: CustomPlanInput) =>
    adminFetch<CustomPlan & { stripe_sync?: string }>(`/v1/admin/orgs/${orgId}/custom-plan`, {
      method: "POST",
      body,
    }),
  billCustomPlan: (orgId: string) =>
    adminFetch<{ provisioned: boolean; subscription_id?: string }>(
      `/v1/admin/orgs/${orgId}/custom-plan/bill`,
      { method: "POST", body: {} },
    ),
  deactivateCustomPlan: (orgId: string) =>
    adminFetch<{ active: boolean }>(`/v1/admin/orgs/${orgId}/custom-plan/deactivate`, {
      method: "POST",
      body: {},
    }),
};

