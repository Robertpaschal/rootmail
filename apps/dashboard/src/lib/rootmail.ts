import { getSessionToken } from "./session";
import type {
  AiDraftResponse,
  ApiKey,
  Asset,
  CreatedWebhookEndpoint,
  AssistantResponse,
  AssistantChat,
  AssistantChatDetail,
  AuditTrail,
  Analytics,
  AuthSession,
  Billing,
  Campaign,
  CampaignAnalytics,
  ComplianceExport,
  Deliverability,
  EmailAuthReport,
  ImportResult,
  RetentionPolicy,
  CheckoutResponse,
  EmbeddedCheckoutResponse,
  Contact,
  ContactList,
  ContactStatus,
  CreatedApiKey,
  Enrollment,
  MembersResult,
  ProofResponse,
  Role,
  RolesResult,
  Sequence,
  SequenceAnalytics,
  ScimTokenResult,
  SsoConnection,
  SsoConnectionInput,
  SsoConnectionResult,
  SequenceStepDef,
  SequenceTriggerDef,
  UploadedAsset,
  ListResponse,
  LoginResult,
  MeResult,
  MfaActivated,
  Organization,
  MfaSetup,
  Message,
  MessageStatus,
  SignupResult,
  SubTenant,
  Template,
  TemplateType,
  User,
  Thread,
  ThreadStatus,
  VerifyResult,
  WebhookDelivery,
  WebhookEndpoint,
  Workspace,
  WorkspacesResult,
} from "./types";

/** Where the rootmail REST API lives. The dashboard only ever calls it server-side. */
export const API_URL = process.env.ROOTMAIL_API_URL ?? "http://localhost:4000";

/** The API responded, but with a non-2xx status. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
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
  subTenantId?: string;
  /** Override the session token (e.g. just-issued at signup/login). */
  token?: string;
  /** Public endpoints (signup/login) that don't carry a session. */
  noAuth?: boolean;
  query?: Record<string, string | number | undefined>;
}

async function rmFetch<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const token = opts.noAuth ? null : (opts.token ?? (await getSessionToken()));
  if (!opts.noAuth && !token) throw new ApiError(401, "Not signed in.");

  const url = new URL(path, API_URL);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
        ...(opts.subTenantId ? { "X-Rootmail-Subtenant": opts.subTenantId } : {}),
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
      json?.error?.message ?? json?.message ?? (typeof json?.error === "string" ? json.error : null) ?? res.statusText ?? "Request failed";
    // Our API puts the machine code in error.type and structured info in
    // error.details (e.g. feature_locked carries the upgrade payload).
    throw new ApiError(
      res.status,
      message,
      json?.error?.type ?? json?.error?.code ?? json?.code,
      json?.error?.details,
    );
  }

  return json as T;
}

export interface SendBody {
  to: string;
  type?: MessageType;
  from?: string;
  reply_to?: string;
  subject?: string;
  template?: string;
  variables?: Record<string, unknown>;
  html?: string;
  text?: string;
  priority?: Priority;
  tags?: string[];
  idempotency_key?: string;
  sub_tenant_id?: string;
}

export type SimulatableEvent = "delivered" | "opened" | "clicked" | "bounced" | "complained";

type MessageType = "transactional" | "marketing" | "sales";
type Priority = "high" | "normal" | "low";

export const api = {
  listMessages: (q: { limit?: number; status?: MessageStatus; sandbox?: boolean } = {}) =>
    rmFetch<ListResponse<Message>>("/v1/messages", {
      query: { ...q, sandbox: q.sandbox === undefined ? undefined : String(q.sandbox) },
    }),
  getMessage: (id: string) => rmFetch<Message>(`/v1/messages/${id}`),
  getAudit: (id: string) => rmFetch<AuditTrail>(`/v1/messages/${id}/audit`),
  getProof: (id: string) => rmFetch<ProofResponse>(`/v1/messages/${id}/proof`),
  send: (body: SendBody) =>
    rmFetch<Message>("/v1/messages", { method: "POST", body, subTenantId: body.sub_tenant_id }),
  recordEvent: (id: string, body: { event: SimulatableEvent; url?: string; reason?: string }) =>
    rmFetch<{ ok: boolean }>(`/v1/messages/${id}/events`, { method: "POST", body }),

  listSubTenants: () => rmFetch<ListResponse<SubTenant>>("/v1/sub-tenants"),
  getSubTenant: (id: string) => rmFetch<SubTenant>(`/v1/sub-tenants/${id}`),
  getSubTenantAuth: (id: string) => rmFetch<EmailAuthReport>(`/v1/sub-tenants/${id}/auth`),
  createSubTenant: (body: { name: string; sending_domain: string; external_id?: string }) =>
    rmFetch<SubTenant>("/v1/sub-tenants", { method: "POST", body }),
  verifySubTenant: (id: string) =>
    rmFetch<VerifyResult>(`/v1/sub-tenants/${id}/verify`, { method: "POST" }),

  upsertContact: (body: {
    email: string;
    name?: string;
    phone?: string;
    tags?: string[];
    status?: ContactStatus;
  }) => rmFetch<Contact>("/v1/contacts", { method: "POST", body }),
  getContact: (email: string) => rmFetch<Contact>(`/v1/contacts/${encodeURIComponent(email)}`),
  unsubscribe: (email: string) =>
    rmFetch<{ ok: boolean; email: string; status: string }>("/v1/contacts/unsubscribe", {
      method: "POST",
      body: { email },
    }),
  checkSuppression: (email: string) =>
    rmFetch<{ email: string; suppressed: boolean }>("/v1/suppressions/check", { query: { email } }),

  listTemplates: () => rmFetch<ListResponse<Template>>("/v1/templates"),
  getTemplate: (id: string) => rmFetch<Template>(`/v1/templates/${id}`),
  createTemplate: (body: {
    name: string;
    slug: string;
    type: TemplateType;
    subject: string;
    html: string;
    text?: string;
    blocks?: Record<string, unknown> | null;
  }) => rmFetch<Template>("/v1/templates", { method: "POST", body }),
  updateTemplate: (
    id: string,
    body: Partial<{
      name: string;
      slug: string;
      type: TemplateType;
      subject: string;
      html: string;
      text: string | null;
      blocks: Record<string, unknown> | null;
    }>,
  ) => rmFetch<Template>(`/v1/templates/${id}`, { method: "PATCH", body }),
  deleteTemplate: (id: string) =>
    rmFetch<{ object: "template"; id: string; deleted: boolean }>(`/v1/templates/${id}`, {
      method: "DELETE",
    }),
  aiDraft: (prompt: string) =>
    rmFetch<AiDraftResponse>("/v1/templates/ai-draft", { method: "POST", body: { prompt } }),
  assistant: (prompt: string) =>
    rmFetch<AssistantResponse>("/v1/assistant", { method: "POST", body: { prompt } }),
  // Persistent assistant chats (per user). The dashboard's chat UI runs on these;
  // `assistant` above stays as the single-shot path for the SDK / back-compat.
  listAssistantChats: () => rmFetch<ListResponse<AssistantChat>>("/v1/assistant/chats"),
  getAssistantChat: (id: string) => rmFetch<AssistantChatDetail>(`/v1/assistant/chats/${id}`),
  createAssistantChat: (title?: string) =>
    rmFetch<AssistantChat>("/v1/assistant/chats", { method: "POST", body: title ? { title } : {} }),
  sendAssistantMessage: (id: string, prompt: string) =>
    rmFetch<AssistantResponse>(`/v1/assistant/chats/${id}/messages`, {
      method: "POST",
      body: { prompt },
    }),
  renameAssistantChat: (id: string, title: string) =>
    rmFetch<AssistantChat>(`/v1/assistant/chats/${id}`, { method: "PATCH", body: { title } }),
  deleteAssistantChat: (id: string) =>
    rmFetch<{ object: "assistant_chat"; id: string; deleted: boolean }>(
      `/v1/assistant/chats/${id}`,
      { method: "DELETE" },
    ),
  listAssets: () => rmFetch<ListResponse<Asset>>("/v1/assets"),
  // Multipart upload — bypasses rmFetch (which is JSON-only). Server-side only.
  uploadAsset: async (file: File): Promise<UploadedAsset> => {
    const token = await getSessionToken();
    if (!token) throw new ApiError(401, "Not signed in.");
    const fd = new FormData();
    fd.set("file", file);
    let res: Response;
    try {
      res = await fetch(new URL("/v1/assets", API_URL), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
        cache: "no-store",
      });
    } catch {
      throw new ConnectionError(`Cannot reach the rootmail API at ${API_URL}.`);
    }
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new ApiError(res.status, json?.error?.message ?? "Upload failed", json?.error?.type);
    }
    return json as UploadedAsset;
  },

  listThreads: (q: { status?: ThreadStatus } = {}) =>
    rmFetch<ListResponse<Thread>>("/v1/threads", { query: q }),
  getThread: (id: string) => rmFetch<Thread>(`/v1/threads/${id}`),
  replyThread: (id: string, body: { html?: string; text?: string }) =>
    rmFetch<Thread>(`/v1/threads/${id}/reply`, { method: "POST", body }),
  simulateReply: (id: string, body: { body_text?: string } = {}) =>
    rmFetch<Thread>(`/v1/threads/${id}/simulate-reply`, { method: "POST", body }),

  getBilling: () => rmFetch<Billing>("/v1/billing"),

  getDeliverability: (q: { window_days?: number; sub_tenant_id?: string } = {}) =>
    rmFetch<Deliverability>("/v1/deliverability", { query: q }),

  getAnalytics: (q: { window_days?: number; sub_tenant_id?: string } = {}) =>
    rmFetch<Analytics>("/v1/analytics", { query: q }),

  importSuppressions: (body: { entries: { email: string; reason?: string }[]; source?: string }) =>
    rmFetch<ImportResult>("/v1/imports/suppressions", { method: "POST", body }),
  importContacts: (body: { entries: { email: string; name?: string; tags?: string[] }[]; list_id?: string }) =>
    rmFetch<ImportResult>("/v1/imports/contacts", { method: "POST", body }),

  getComplianceExport: (q: { from: string; to?: string; sub_tenant_id?: string }) =>
    rmFetch<ComplianceExport>("/v1/exports/compliance", { query: q }),

  getRetention: () => rmFetch<RetentionPolicy>("/v1/retention"),
  setRetention: (body: { retention_days: number | null; retention_mode?: "redact" | "delete" }) =>
    rmFetch<RetentionPolicy>("/v1/retention", { method: "PUT", body }),

  // SAML single sign-on (enterprise) — the org's one connection.
  getSsoConnection: () => rmFetch<SsoConnectionResult>("/v1/sso/connection"),
  putSsoConnection: (body: SsoConnectionInput) =>
    rmFetch<SsoConnection>("/v1/sso/connection", { method: "PUT", body }),
  deleteSsoConnection: () =>
    rmFetch<SsoConnectionResult>("/v1/sso/connection", { method: "DELETE" }),
  generateScimToken: () => rmFetch<ScimTokenResult>("/v1/sso/scim/token", { method: "POST" }),
  disableScim: () => rmFetch<ScimTokenResult>("/v1/sso/scim/token", { method: "DELETE" }),

  // Starts a plan change. In Stripe mode returns a hosted Checkout URL; in local
  // mode applies the switch and returns the updated billing.
  checkout: (plan: string, interval: "month" | "year" = "month") =>
    rmFetch<CheckoutResponse>("/v1/billing/checkout", { method: "POST", body: { plan, interval } }),
  // On-page checkout: returns a session client_secret + publishable key to mount
  // inline, or { available: false } so the caller falls back to hosted checkout.
  embeddedCheckout: (
    plan: string,
    interval: "month" | "year" = "month",
    addons?: Record<string, number>,
  ) =>
    rmFetch<EmbeddedCheckoutResponse>("/v1/billing/checkout/embedded", {
      method: "POST",
      body: { plan, interval, ...(addons ? { addons } : {}) },
    }),
  setPlan: (plan: string) =>
    rmFetch<Billing>("/v1/billing/plan", { method: "POST", body: { plan } }),
  setAddon: (addon_id: string, quantity: number) =>
    rmFetch<Billing>("/v1/billing/addons", { method: "POST", body: { addon_id, quantity } }),

  listSequences: () => rmFetch<ListResponse<Sequence>>("/v1/sequences"),
  getSequence: (id: string) => rmFetch<Sequence>(`/v1/sequences/${id}`),
  createSequence: (body: {
    name: string;
    status?: "active" | "paused";
    trigger?: SequenceTriggerDef;
    steps?: SequenceStepDef[];
  }) => rmFetch<Sequence>("/v1/sequences", { method: "POST", body }),
  updateSequence: (
    id: string,
    body: Partial<{ name: string; status: "active" | "paused"; trigger: SequenceTriggerDef; steps: SequenceStepDef[] }>,
  ) => rmFetch<Sequence>(`/v1/sequences/${id}`, { method: "PATCH", body }),
  deleteSequence: (id: string) =>
    rmFetch<{ deleted: boolean }>(`/v1/sequences/${id}`, { method: "DELETE" }),
  enrollContact: (id: string, email: string) =>
    rmFetch<Enrollment>(`/v1/sequences/${id}/enroll`, { method: "POST", body: { email } }),
  listEnrollments: (id: string) =>
    rmFetch<ListResponse<Enrollment>>(`/v1/sequences/${id}/enrollments`),
  sequenceAnalytics: (id: string) =>
    rmFetch<SequenceAnalytics>(`/v1/sequences/${id}/analytics`),

  listLists: () => rmFetch<ListResponse<ContactList>>("/v1/lists"),
  getList: (id: string) => rmFetch<ContactList>(`/v1/lists/${id}`),
  createList: (body: { name: string; description?: string }) =>
    rmFetch<ContactList>("/v1/lists", { method: "POST", body }),
  deleteList: (id: string) => rmFetch<{ deleted: boolean }>(`/v1/lists/${id}`, { method: "DELETE" }),
  getListContacts: (id: string) => rmFetch<ListResponse<Contact>>(`/v1/lists/${id}/contacts`),
  addListContact: (id: string, email: string) =>
    rmFetch<{ contact_id: string }>(`/v1/lists/${id}/contacts`, { method: "POST", body: { email } }),
  removeListContact: (id: string, contactId: string) =>
    rmFetch<{ deleted: boolean }>(`/v1/lists/${id}/contacts/${contactId}`, { method: "DELETE" }),

  listCampaigns: () => rmFetch<ListResponse<Campaign>>("/v1/campaigns"),
  getCampaign: (id: string) => rmFetch<Campaign>(`/v1/campaigns/${id}`),
  campaignAnalytics: (id: string) =>
    rmFetch<CampaignAnalytics>(`/v1/campaigns/${id}/analytics`),
  createCampaign: (body: { name: string; list_id?: string; template_id?: string; subject?: string }) =>
    rmFetch<Campaign>("/v1/campaigns", { method: "POST", body }),
  sendCampaign: (id: string) =>
    rmFetch<Campaign>(`/v1/campaigns/${id}/send`, { method: "POST", body: {} }),
  deleteCampaign: (id: string) =>
    rmFetch<{ deleted: boolean }>(`/v1/campaigns/${id}`, { method: "DELETE" }),

  getMembers: () => rmFetch<MembersResult>("/v1/members"),
  invite: (email: string, role = "member", customRoleId?: string) =>
    rmFetch<{ id: string; email: string; accept_url: string }>("/v1/invitations", {
      method: "POST",
      body: { email, role, custom_role_id: customRoleId },
    }),

  listRoles: () => rmFetch<RolesResult>("/v1/roles"),
  createRole: (body: { name: string; permissions: string[] }) =>
    rmFetch<Role>("/v1/roles", { method: "POST", body }),
  deleteRole: (id: string) => rmFetch<{ deleted: boolean }>(`/v1/roles/${id}`, { method: "DELETE" }),
  revokeInvite: (id: string) =>
    rmFetch<{ deleted: boolean }>(`/v1/invitations/${id}`, { method: "DELETE" }),

  listWebhooks: () => rmFetch<ListResponse<WebhookEndpoint>>("/v1/webhook-endpoints"),
  createWebhook: (body: { url: string; events?: string[]; description?: string }) =>
    rmFetch<CreatedWebhookEndpoint>("/v1/webhook-endpoints", { method: "POST", body }),
  updateWebhook: (
    id: string,
    body: Partial<{ url: string; events: string[]; description: string | null; status: "active" | "disabled" }>,
  ) => rmFetch<WebhookEndpoint>(`/v1/webhook-endpoints/${id}`, { method: "PATCH", body }),
  deleteWebhook: (id: string) =>
    rmFetch<{ deleted: boolean }>(`/v1/webhook-endpoints/${id}`, { method: "DELETE" }),
  webhookDeliveries: (id: string) =>
    rmFetch<ListResponse<WebhookDelivery>>(`/v1/webhook-endpoints/${id}/deliveries`),

  listApiKeys: () => rmFetch<ListResponse<ApiKey>>("/v1/api-keys"),
  createApiKey: (body: { name: string }) =>
    rmFetch<CreatedApiKey>("/v1/api-keys", { method: "POST", body }),
  revokeApiKey: (id: string) => rmFetch<ApiKey>(`/v1/api-keys/${id}`, { method: "DELETE" }),

  signup: (body: { email: string; password: string; name?: string; organization_name?: string }) =>
    rmFetch<SignupResult>("/v1/auth/signup", { method: "POST", body, noAuth: true }),
  login: (body: { email: string; password: string }) =>
    rmFetch<LoginResult>("/v1/auth/login", { method: "POST", body, noAuth: true }),
  mfaVerify: (body: { mfa_token: string; code?: string; recovery_code?: string }) =>
    rmFetch<AuthSession>("/v1/auth/mfa/verify", { method: "POST", body, noAuth: true }),
  mfaSetup: () => rmFetch<MfaSetup>("/v1/auth/mfa/setup", { method: "POST", body: {} }),
  mfaActivate: (code: string) =>
    rmFetch<MfaActivated>("/v1/auth/mfa/activate", { method: "POST", body: { code } }),
  mfaDisable: (body: { code?: string; password?: string }) =>
    rmFetch<{ enabled: boolean }>("/v1/auth/mfa/disable", { method: "POST", body }),
  verifyEmail: (token: string) =>
    rmFetch<{ verified: boolean }>("/v1/auth/verify-email", { method: "POST", body: { token }, noAuth: true }),
  resendVerification: () =>
    rmFetch<{ sent?: boolean; verified?: boolean }>("/v1/auth/verify-email/resend", { method: "POST", body: {} }),
  forgotPassword: (email: string) =>
    rmFetch<{ ok: boolean }>("/v1/auth/forgot-password", { method: "POST", body: { email }, noAuth: true }),
  resetPassword: (body: { token: string; password: string }) =>
    rmFetch<{ reset: boolean }>("/v1/auth/reset-password", { method: "POST", body, noAuth: true }),
  me: () => rmFetch<MeResult>("/v1/auth/me"),
  // Profile: display name + avatar. Personal (session-scoped), not workspace-gated.
  updateProfile: (body: { name?: string | null; remove_avatar?: boolean }) =>
    rmFetch<User>("/v1/auth/profile", { method: "POST", body }),
  // Multipart avatar upload — bypasses rmFetch (JSON-only). Server-side only.
  uploadAvatar: async (file: File): Promise<User> => {
    const token = await getSessionToken();
    if (!token) throw new ApiError(401, "Not signed in.");
    const fd = new FormData();
    fd.set("file", file);
    let res: Response;
    try {
      res = await fetch(new URL("/v1/auth/avatar", API_URL), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
        cache: "no-store",
      });
    } catch {
      throw new ConnectionError(`Cannot reach the rootmail API at ${API_URL}.`);
    }
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new ApiError(res.status, json?.error?.message ?? "Upload failed", json?.error?.type);
    }
    return json as User;
  },
  // Workspaces (products/brands). The org always has a Production + Sandbox;
  // additional live ones are plan-gated + buyable via the workspace_pack add-on.
  listWorkspaces: () => rmFetch<WorkspacesResult>("/v1/workspaces"),
  createWorkspace: (name: string) =>
    rmFetch<Workspace>("/v1/workspaces", { method: "POST", body: { name } }),
  renameWorkspace: (id: string, name: string) =>
    rmFetch<Workspace>(`/v1/workspaces/${id}`, { method: "PATCH", body: { name } }),
  deleteWorkspace: (id: string) =>
    rmFetch<void>(`/v1/workspaces/${id}`, { method: "DELETE" }),
  setActiveWorkspace: (workspaceId: string) =>
    rmFetch<MeResult>("/v1/auth/active-workspace", {
      method: "POST",
      body: { workspace_id: workspaceId },
    }),
  setAnnouncementPref: (optOut: boolean) =>
    rmFetch<User>("/v1/auth/preferences", { method: "POST", body: { announcement_opt_out: optOut } }),
  logout: () => rmFetch<{ ok: boolean }>("/v1/auth/logout", { method: "POST" }),
  // Exchange a one-time staff handoff code for an impersonated session.
  acceptImpersonation: (code: string) =>
    rmFetch<AuthSession>("/v1/auth/impersonate/accept", {
      method: "POST",
      body: { code },
      noAuth: true,
    }),

  getOrganization: () => rmFetch<Organization>("/v1/organization"),
  updateOrganization: (body: { name?: string; postal_address?: string | null }) =>
    rmFetch<Organization>("/v1/organization", { method: "PATCH", body }),

  // In-app "talk to a human": sales (Enterprise/custom) + support. Lands in the
  // admin Leads inbox. The public leads endpoint (noAuth) — the action attaches org context.
  createLead: (body: {
    name: string;
    email: string;
    company?: string;
    message?: string;
    source: string;
    expected_volume?: string;
  }) => rmFetch<{ object?: string; id?: string }>("/v1/leads", { method: "POST", body, noAuth: true }),

  // Support is customer care, NOT a sales lead — it files a ticket under the
  // signed-in user's org; staff reply (emailed) + close from the admin support inbox.
  createSupportTicket: (body: { subject?: string; message: string }) =>
    rmFetch<{ ticket_id: string }>("/v1/support", { method: "POST", body }),
};

/**
 * Exchange a verified social-login identity for a session. Server-to-server only
 * — authenticated with the shared internal secret, not a user session.
 */
export async function oauthUpsert(body: {
  provider: string;
  email: string;
  name?: string;
  email_verified?: boolean;
}): Promise<AuthSession> {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) throw new Error("INTERNAL_API_SECRET is not set");

  let res: Response;
  try {
    res = await fetch(new URL("/v1/auth/oauth", API_URL), {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Rootmail-Internal": secret },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ConnectionError(`Cannot reach the rootmail API at ${API_URL}.`);
  }
  if (!res.ok) throw new ApiError(res.status, "Social login failed");
  return (await res.json()) as AuthSession;
}

// --- SAML SSO login relay (dashboard → API, internal secret) ---------------
async function ssoInternal<T>(path: string, body: unknown): Promise<T> {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) throw new Error("INTERNAL_API_SECRET is not set");
  let res: Response;
  try {
    res = await fetch(new URL(path, API_URL), {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Rootmail-Internal": secret },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ConnectionError(`Cannot reach the rootmail API at ${API_URL}.`);
  }
  if (!res.ok) throw new ApiError(res.status, "SSO request failed");
  return (await res.json()) as T;
}

/** Does this email's domain use SSO? Returns the connection id to start the flow. */
export function ssoDiscover(email: string) {
  return ssoInternal<{ connection_id: string | null; enforced: boolean }>(
    "/v1/auth/sso/discover",
    { email },
  );
}

/** Build the IdP redirect (AuthnRequest) for a connection. */
export function samlAuthorize(connectionId: string) {
  return ssoInternal<{ url: string }>(`/v1/auth/saml/${connectionId}/authorize`, {});
}

/** Validate the IdP's SAML response and mint a session (JIT-provisions the member). */
export function samlAcs(connectionId: string, samlResponse: string) {
  return ssoInternal<AuthSession>(`/v1/auth/saml/${connectionId}/acs`, {
    saml_response: samlResponse,
  });
}
