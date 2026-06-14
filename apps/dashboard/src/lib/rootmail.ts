import { getSessionToken } from "./session";
import type {
  ApiKey,
  AuditTrail,
  AuthSession,
  Contact,
  ContactStatus,
  CreatedApiKey,
  ListResponse,
  MeResult,
  Message,
  MessageStatus,
  SignupResult,
  SubTenant,
  Template,
  TemplateType,
  VerifyResult,
} from "./types";

/** Where the rootmail REST API lives. The dashboard only ever calls it server-side. */
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
    throw new ApiError(res.status, message, json?.error?.code ?? json?.code);
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
  listMessages: (q: { limit?: number; status?: MessageStatus } = {}) =>
    rmFetch<ListResponse<Message>>("/v1/messages", { query: q }),
  getMessage: (id: string) => rmFetch<Message>(`/v1/messages/${id}`),
  getAudit: (id: string) => rmFetch<AuditTrail>(`/v1/messages/${id}/audit`),
  send: (body: SendBody) =>
    rmFetch<Message>("/v1/messages", { method: "POST", body, subTenantId: body.sub_tenant_id }),
  recordEvent: (id: string, body: { event: SimulatableEvent; url?: string; reason?: string }) =>
    rmFetch<{ ok: boolean }>(`/v1/messages/${id}/events`, { method: "POST", body }),

  listSubTenants: () => rmFetch<ListResponse<SubTenant>>("/v1/sub-tenants"),
  getSubTenant: (id: string) => rmFetch<SubTenant>(`/v1/sub-tenants/${id}`),
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
    blocks?: unknown[] | null;
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
      blocks: unknown[] | null;
    }>,
  ) => rmFetch<Template>(`/v1/templates/${id}`, { method: "PATCH", body }),
  deleteTemplate: (id: string) =>
    rmFetch<{ object: "template"; id: string; deleted: boolean }>(`/v1/templates/${id}`, {
      method: "DELETE",
    }),

  listApiKeys: () => rmFetch<ListResponse<ApiKey>>("/v1/api-keys"),
  createApiKey: (body: { name: string }) =>
    rmFetch<CreatedApiKey>("/v1/api-keys", { method: "POST", body }),
  revokeApiKey: (id: string) => rmFetch<ApiKey>(`/v1/api-keys/${id}`, { method: "DELETE" }),

  signup: (body: { email: string; password: string; name?: string; organization_name?: string }) =>
    rmFetch<SignupResult>("/v1/auth/signup", { method: "POST", body, noAuth: true }),
  login: (body: { email: string; password: string }) =>
    rmFetch<AuthSession>("/v1/auth/login", { method: "POST", body, noAuth: true }),
  me: () => rmFetch<MeResult>("/v1/auth/me"),
  logout: () => rmFetch<{ ok: boolean }>("/v1/auth/logout", { method: "POST" }),
};
