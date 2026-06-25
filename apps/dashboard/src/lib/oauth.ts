import "server-only";
import { appleClientSecret, appleConfigured, decodeAppleIdToken } from "./apple";

// Social-login scaffold. Providers light up once their credentials are set in the
// environment (e.g. apps/dashboard/.env.local); until then no buttons render and
// the routes redirect back to /login. Google + GitHub use the standard
// code→token→userinfo flow; Apple uses a generated ES256 client_secret, a
// form_post callback, and reads the profile from the id_token (see ./apple).

export type OAuthProviderId = "google" | "github" | "apple";

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
    apple: {
      id: "apple",
      label: "Apple",
      authorizeUrl: "https://appleid.apple.com/auth/authorize",
      tokenUrl: "https://appleid.apple.com/auth/token",
      userinfoUrl: "", // Apple has none — the profile comes from the id_token
      scope: "name email",
      clientId: process.env.APPLE_CLIENT_ID,
      // clientSecret is a generated ES256 JWT (see exchangeCode), not static.
    },
  };
}

export function isConfigured(p: ProviderConfig): boolean {
  // Apple has no static secret — it's "configured" when all four .p8 creds exist.
  if (p.id === "apple") return appleConfigured();
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

/**
 * Absolute URL on the dashboard's own public origin (DASHBOARD_URL). Use this for
 * post-OAuth redirects instead of `new URL(path, req.url)`: behind a reverse proxy
 * Next resolves `req.url` to the container's internal origin (localhost:PORT), so a
 * relative redirect would bounce the user to localhost after a successful sign-in.
 */
export function appUrl(path: string): string {
  return new URL(path, baseUrl()).toString();
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
  // Apple requires form_post when name/email scope is requested.
  if (p.id === "apple") u.searchParams.set("response_mode", "form_post");
  return u.toString();
}

export async function exchangeCode(p: ProviderConfig, code: string): Promise<string> {
  // Apple's client_secret is a freshly-signed ES256 JWT; others use the static secret.
  const clientSecret = p.id === "apple" ? appleClientSecret() : (p.clientSecret ?? "");
  const res = await fetch(p.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      client_id: p.clientId ?? "",
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri(p.id),
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  const data = (await res.json()) as { access_token?: string; id_token?: string };
  // Apple carries the profile in the id_token; Google/GitHub use the access_token.
  const token = p.id === "apple" ? data.id_token : data.access_token;
  if (!token) throw new Error("OAuth token exchange failed");
  return token;
}

export interface OAuthProfile {
  email: string;
  name?: string;
  emailVerified?: boolean;
}

export async function fetchProfile(p: ProviderConfig, token: string): Promise<OAuthProfile> {
  // Apple: the token IS the id_token — read the email straight from its claims
  // (the display name, if any, arrives separately in the form_post callback).
  if (p.id === "apple") {
    const claims = decodeAppleIdToken(token);
    return { email: claims.email ?? "", emailVerified: claims.emailVerified ?? false };
  }

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
