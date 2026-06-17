import { getStaffToken } from "./session";
import type {
  ListResponse,
  LoginResult,
  MessageDetail,
  MessageSummary,
  OrgDetail,
  OrgSummary,
  StaffUser,
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
};

