import { getStaffToken } from "./session";
import type {
  AdminAddon,
  AdminAnalytics,
  ProvisioningQueue,
  AdminBilling,
  AdminBlogPost,
  AdminChangelogEntry,

  AddonPatch,
  Announcement,
  AnnouncementRecipients,
  BillingStatus,
  ChangeItem,
  CmsStatus,
  CustomPlanListItem,
  PostCategory,
  SupportTicketDetail,
  SupportTicketListItem,
  SupportTicketStatus,
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
  MeResult,
  MessageDetail,
  MessageSummary,
  CreatePromotion,
  AdminTier,
  OrgDetail,
  OrgSummary,
  TierPatch,
  Promotion,
  StaffAuditEntry,
  StaffRole,
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
  me: () => adminFetch<MeResult>("/v1/admin/auth/me"),
  status: () => adminFetch<{ needs_bootstrap: boolean }>("/v1/admin/auth/status", { noAuth: true }),

  // First-run bootstrap (no auth — gated by INTERNAL_API_SECRET + zero staff).
  bootstrap: (body: { email: string; name?: string; password: string; secret: string }) =>
    adminFetch<{ staff: StaffUser }>("/v1/admin/auth/bootstrap", { method: "POST", body, noAuth: true }),

  // Staff administration.
  listStaff: () => adminFetch<ListResponse<StaffUser>>("/v1/admin/staff"),
  createStaff: (body: { email: string; name?: string; role: StaffRole; password?: string }) =>
    adminFetch<{ staff: StaffUser; generated_password?: string }>("/v1/admin/staff", { method: "POST", body }),
  updateStaff: (id: string, body: { name?: string; role?: StaffRole }) =>
    adminFetch<StaffUser>(`/v1/admin/staff/${id}`, { method: "PATCH", body }),
  deactivateStaff: (id: string) =>
    adminFetch<StaffUser>(`/v1/admin/staff/${id}/deactivate`, { method: "POST", body: {} }),
  reactivateStaff: (id: string) =>
    adminFetch<StaffUser>(`/v1/admin/staff/${id}/reactivate`, { method: "POST", body: {} }),
  resetStaffPassword: (id: string) =>
    adminFetch<{ staff: StaffUser; generated_password: string }>(`/v1/admin/staff/${id}/reset-password`, {
      method: "POST",
      body: {},
    }),
  listStaffAudit: () => adminFetch<ListResponse<StaffAuditEntry>>("/v1/admin/staff-audit"),

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
  provisioningQueue: () => adminFetch<ProvisioningQueue>("/v1/admin/provisioning"),

  announcementRecipients: () =>
    adminFetch<AnnouncementRecipients>("/v1/admin/announcements/recipients"),
  sendAnnouncement: (body: { subject: string; body: string }) =>
    adminFetch<{ id: string; sent: number }>("/v1/admin/announcements", { method: "POST", body }),
  listAnnouncements: () => adminFetch<ListResponse<Announcement>>("/v1/admin/announcements"),

  listPromotions: () => adminFetch<ListResponse<Promotion>>("/v1/admin/promotions"),
  createPromotion: (body: CreatePromotion) =>
    adminFetch<Promotion>("/v1/admin/promotions", { method: "POST", body }),
  deactivatePromotion: (id: string) =>
    adminFetch<{ active: boolean }>(`/v1/admin/promotions/${id}/deactivate`, {
      method: "POST",
      body: {},
    }),

  // Per-wing pricing tiers — THE pricing model (tx blocks / mk contact-size).
  listPricingTiers: () => adminFetch<ListResponse<AdminTier>>("/v1/admin/pricing-tiers"),
  updatePricingTier: (id: string, patch: TierPatch) =>
    adminFetch<AdminTier & { stripe_sync?: string }>(`/v1/admin/pricing-tiers/${id}`, {
      method: "PATCH",
      body: patch,
    }),

  listAddons: () => adminFetch<ListResponse<AdminAddon>>("/v1/admin/addons"),
  updateAddon: (id: string, patch: AddonPatch) =>
    adminFetch<AdminAddon & { stripe_sync?: string }>(`/v1/admin/addons/${id}`, {
      method: "PATCH",
      body: patch,
    }),
  setAddonSale: (id: string, body: { percent_off: number; ends_at?: string }) =>
    adminFetch<AdminAddon & { stripe_sync?: string }>(`/v1/admin/addons/${id}/sale`, {
      method: "POST",
      body,
    }),
  clearAddonSale: (id: string) =>
    adminFetch<AdminAddon>(`/v1/admin/addons/${id}/sale`, { method: "DELETE" }),
  // Central pricing control center: every org on a bespoke plan + Stripe status.
  listCustomPlans: () => adminFetch<ListResponse<CustomPlanListItem>>("/v1/admin/custom-plans"),
  getBillingStatus: () => adminFetch<BillingStatus>("/v1/admin/billing-status"),

  // Support inbox (customer care) — support.manage.
  listSupportTickets: (status?: SupportTicketStatus) =>
    adminFetch<ListResponse<SupportTicketListItem>>(
      status ? `/v1/admin/support?status=${status}` : "/v1/admin/support",
    ),
  getSupportTicket: (id: string) =>
    adminFetch<SupportTicketDetail>(`/v1/admin/support/${id}`),
  replySupportTicket: (id: string, body: string) =>
    adminFetch<{ ok: boolean }>(`/v1/admin/support/${id}/reply`, { method: "POST", body: { body } }),
  setSupportStatus: (id: string, status: SupportTicketStatus) =>
    adminFetch<{ status: SupportTicketStatus }>(`/v1/admin/support/${id}/status`, {
      method: "POST",
      body: { status },
    }),

  getOrgBilling: (id: string) => adminFetch<AdminBilling>(`/v1/admin/orgs/${id}/billing`),
  grantCredit: (id: string, amountCents: number, reason?: string) =>
    adminFetch<{ applied: boolean }>(`/v1/admin/orgs/${id}/credit`, {
      method: "POST",
      body: { amount_cents: amountCents, reason },
    }),
  setDedicatedIp: (id: string, status: "none" | "requested" | "active", address?: string | null) =>
    adminFetch<{ status: string; address: string | null }>(`/v1/admin/orgs/${id}/dedicated-ip`, {
      method: "PATCH",
      body: { status, address: address ?? null },
    }),
  setReplyDomainStatus: (id: string, status: "none" | "pending" | "active") =>
    adminFetch<{ status: string; domain: string | null }>(`/v1/admin/orgs/${id}/reply-domain`, {
      method: "PATCH",
      body: { status },
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

  // --- CMS: blog (content.publish) ---
  listBlogPosts: () => adminFetch<ListResponse<AdminBlogPost>>("/v1/admin/cms/blog"),
  createBlogPost: (input: {
    slug: string;
    title: string;
    description?: string;
    category?: PostCategory;
    author?: string;
    body?: string;
    cover_image_url?: string | null;
    external_url?: string | null;
    source?: string | null;
    status?: CmsStatus;
  }) => adminFetch<AdminBlogPost>("/v1/admin/cms/blog", { method: "POST", body: input }),
  updateBlogPost: (
    id: string,
    input: Partial<{
      slug: string;
      title: string;
      description: string;
      category: PostCategory;
      author: string;
      body: string;
      cover_image_url: string | null;
      external_url: string | null;
      source: string | null;
      status: CmsStatus;
    }>,
  ) => adminFetch<AdminBlogPost>(`/v1/admin/cms/blog/${id}`, { method: "PATCH", body: input }),
  deleteBlogPost: (id: string) =>
    adminFetch<{ deleted: boolean }>(`/v1/admin/cms/blog/${id}`, { method: "DELETE" }),

  // --- CMS: changelog (content.publish) ---
  listChangelog: () => adminFetch<ListResponse<AdminChangelogEntry>>("/v1/admin/cms/changelog"),
  createChangelog: (input: { title: string; date?: string; changes: ChangeItem[]; status?: CmsStatus }) =>
    adminFetch<AdminChangelogEntry>("/v1/admin/cms/changelog", { method: "POST", body: input }),
  updateChangelog: (
    id: string,
    input: Partial<{ title: string; date: string; changes: ChangeItem[]; status: CmsStatus }>,
  ) => adminFetch<AdminChangelogEntry>(`/v1/admin/cms/changelog/${id}`, { method: "PATCH", body: input }),
  deleteChangelog: (id: string) =>
    adminFetch<{ deleted: boolean }>(`/v1/admin/cms/changelog/${id}`, { method: "DELETE" }),
};

