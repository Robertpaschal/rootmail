import "server-only";

// Social-login scaffold. Providers light up once their client id/secret are set
// in the environment (e.g. apps/dashboard/.env.local); until then no buttons
// render and the routes redirect back to /login. Google and GitHub are wired;
// Apple and Facebook can be added here (Apple needs a JWT client secret).

export type OAuthProviderId = "google" | "github";

export interface ProviderConfig {
  id: OAuthProviderId;
  label: string;
  authorizeUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  scope: string;
  clientId?: string;
  clientSecret?: string;
}

function registry(): Record<OAuthProviderId, ProviderConfig> {
  return {
    google: {
      id: "google",
      label: "Google",
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      userinfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
      scope: "openid email profile",
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
    github: {
      id: "github",
      label: "GitHub",
      authorizeUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      userinfoUrl: "https://api.github.com/user",
      scope: "read:user user:email",
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    },
  };
}

export function isConfigured(p: ProviderConfig): boolean {
  return Boolean(p.clientId && p.clientSecret);
}

export function getProvider(id: string): ProviderConfig | null {
  const all = registry();
  return id in all ? all[id as OAuthProviderId] : null;
}

/** Providers with credentials set — drives which buttons render. */
export function enabledProviders(): { id: OAuthProviderId; label: string }[] {
  return Object.values(registry())
    .filter(isConfigured)
    .map((p) => ({ id: p.id, label: p.label }));
}

function baseUrl(): string {
  return process.env.DASHBOARD_URL ?? "http://localhost:3001";
}

export function redirectUri(id: OAuthProviderId): string {
  return `${baseUrl()}/oauth/${id}/callback`;
}

export function authorizeUrl(p: ProviderConfig, state: string): string {
  const u = new URL(p.authorizeUrl);
  u.searchParams.set("client_id", p.clientId ?? "");
  u.searchParams.set("redirect_uri", redirectUri(p.id));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", p.scope);
  u.searchParams.set("state", state);
  return u.toString();
}

export async function exchangeCode(p: ProviderConfig, code: string): Promise<string> {
  const res = await fetch(p.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      client_id: p.clientId ?? "",
      client_secret: p.clientSecret ?? "",
      code,
      redirect_uri: redirectUri(p.id),
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("OAuth token exchange failed");
  return data.access_token;
}

export interface OAuthProfile {
  email: string;
  name?: string;
  emailVerified?: boolean;
}

export async function fetchProfile(p: ProviderConfig, token: string): Promise<OAuthProfile> {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "User-Agent": "rootmail",
  };
  const data = (await (await fetch(p.userinfoUrl, { headers, cache: "no-store" })).json()) as Record<
    string,
    unknown
  >;

  if (p.id === "google") {
    return {
      email: String(data.email ?? ""),
      name: data.name ? String(data.name) : undefined,
      emailVerified: data.email_verified === true,
    };
  }

  // GitHub: the primary email may be private; fall back to /user/emails.
  let email = data.email ? String(data.email) : "";
  if (!email) {
    const emails = (await (
      await fetch("https://api.github.com/user/emails", { headers, cache: "no-store" })
    ).json()) as Array<{ email: string; primary: boolean }>;
    const primary = Array.isArray(emails) ? (emails.find((e) => e.primary) ?? emails[0]) : null;
    email = primary?.email ?? "";
  }
  return {
    email,
    name: (data.name as string) || (data.login as string) || undefined,
    emailVerified: true,
  };
}
