import { createHash } from "node:crypto";
import { Webhook } from "standardwebhooks";
import { z } from "zod";

// Planner stays transport-independent. The optional HTTP adapter is exported below.
// Ordinary /v1/messages retains bodies and must never carry authentication secrets.
const actions = ["signup", "magiclink", "recovery", "invite", "reauthentication", "email_change"] as const;
export type AuthAction = (typeof actions)[number];
const identifier = z.string().min(1).max(256).regex(/^[\w.-]+$/);
const email = z.string().email().max(254);
const secretValue = z.string().min(1).max(512).regex(/^[A-Za-z0-9_-]+$/);
const optionalSecret = z.union([secretValue, z.literal("")]).optional();
const payloadSchema = z.object({
  user: z.object({ email, new_email: z.string().optional() }),
  email_data: z.object({
    email_action_type: z.enum(actions),
    token: optionalSecret,
    token_hash: optionalSecret,
    token_new: optionalSecret,
    token_hash_new: optionalSecret,
    redirect_to: z.string().max(2048).optional(),
  }),
});
const configSchema = z.object({
  hookSecrets: z.array(z.string().min(1)).min(1).max(2),
  supabaseUrl: z.string().url(),
  workspaceId: identifier,
  clientId: identifier.nullable(),
  from: email,
  brand: z.string().trim().min(1).max(100).regex(/^[^\r\n\u0000-\u001f\u007f]+$/),
  emailChangeMode: z.enum(["secure", "single"]),
  allowedRedirects: z.array(z.string().url().max(2048)).min(1).max(32),
  defaultRedirect: z.string().url().max(2048),
});

export type SupabaseEmailConfig = z.input<typeof configSchema>;
export type HookErrorCode = "invalid_configuration" | "invalid_signature" | "invalid_payload" | "unsupported_action" | "invalid_redirect";

/** Only fixed messages escape this boundary; never include a payload or cause. */
export class SupabaseHookError extends Error {
  constructor(readonly code: HookErrorCode) {
    super(`Supabase email hook: ${code}`);
    this.name = "SupabaseHookError";
  }
}

export type SensitiveEmailContent = Readonly<{
  to: string;
  subject: string;
  html: string;
  text: string;
  verificationUrl: string | null;
}>;

/**
 * Transient secret-bearing content. Accidental JSON/string/Node inspection is
 * redacted. Explicitly revealed content still MUST NOT be logged or persisted.
 * This is not encryption, memory zeroing, or a server-side retention guarantee.
 */
export class PreparedAuthEmail {
  #content: SensitiveEmailContent;
  constructor(
    readonly recipientRole: "current" | "new",
    readonly idempotencyKey: string,
    content: SensitiveEmailContent,
  ) {
    this.#content = Object.freeze(content);
    Object.freeze(this);
  }
  readSensitiveContent(): SensitiveEmailContent { return this.#content; }
  toJSON() { return { recipientRole: this.recipientRole, idempotencyKey: this.idempotencyKey, content: "[REDACTED]" }; }
  toString(): string { return "[PreparedAuthEmail: REDACTED]"; }
  [Symbol.for("nodejs.util.inspect.custom")]() { return this.toJSON(); }
}

export type SupabaseEmailPlan = Readonly<{
  eventKey: string;
  signedAt: number;
  action: AuthAction;
  workspaceId: string;
  clientId: string | null;
  from: string;
  messages: readonly PreparedAuthEmail[];
}>;

const titles: Record<AuthAction, string> = {
  signup: "Confirm your email",
  magiclink: "Sign in",
  recovery: "Reset your password",
  invite: "Accept your invitation",
  reauthentication: "Confirm it's you",
  email_change: "Confirm your email change",
};
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[c]!);

function required(value: string | undefined): string {
  if (!value) throw new SupabaseHookError("invalid_payload");
  return value;
}

function headersForVerification(headers: Headers | Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  const entries = headers instanceof Headers ? headers.entries() : Object.entries(headers);
  for (const [key, value] of entries) {
    const name = key.toLowerCase();
    if (!name.startsWith("webhook-")) continue;
    if (name in normalized) throw new SupabaseHookError("invalid_signature");
    normalized[name] = value;
  }
  // Reject parseInt-compatible garbage, duplicate/combined headers, and oversized IDs.
  if (!/^\d{10}$/.test(normalized["webhook-timestamp"] ?? "") ||
      !/^[\w.-]{1,256}$/.test(normalized["webhook-id"] ?? "") ||
      (normalized["webhook-signature"]?.length ?? 0) > 4096) {
    throw new SupabaseHookError("invalid_signature");
  }
  return normalized;
}

/**
 * Verify an unmodified req.text() body, then prepare messages in memory only.
 * A successful plan is NOT acceptance, a send, delivery, or a Supabase session.
 * Do not wire this to ordinary /v1/messages; see README's release gates.
 */
export function createSupabaseEmailPlanner(input: SupabaseEmailConfig) {
  const parsedConfig = configSchema.safeParse(input);
  if (!parsedConfig.success) throw new SupabaseHookError("invalid_configuration");
  const config = parsedConfig.data;
  const project = new URL(config.supabaseUrl);
  if (project.protocol !== "https:" || project.username || project.password || project.search || project.hash ||
      project.pathname !== "/" || !config.allowedRedirects.includes(config.defaultRedirect)) {
    throw new SupabaseHookError("invalid_configuration");
  }
  // HTTPS web callbacks and explicitly enumerated native-app callbacks only.
  for (const redirect of config.allowedRedirects) {
    const url = new URL(redirect);
    if (["http:", "javascript:", "data:", "file:", "ftp:", "vbscript:"].includes(url.protocol) ||
        url.username || url.password) throw new SupabaseHookError("invalid_configuration");
  }
  let verifiers: Webhook[];
  try {
    verifiers = config.hookSecrets.map((secret) => {
      const normalized = secret.replace(/^v1,/, "");
      if (!/^whsec_[A-Za-z0-9+/]+={0,2}$/.test(normalized)) throw new Error();
      if (Buffer.from(normalized.slice(6), "base64").byteLength < 32) throw new Error();
      return new Webhook(normalized);
    });
  } catch { throw new SupabaseHookError("invalid_configuration"); }

  return (rawBody: string, headers: Headers | Record<string, string>): SupabaseEmailPlan => {
    // Bound parsing work; the HTTP wrapper must also limit bytes while streaming.
    if (typeof rawBody !== "string" || Buffer.byteLength(rawBody, "utf8") > 128 * 1024) {
      throw new SupabaseHookError("invalid_payload");
    }
    const normalizedHeaders = headersForVerification(headers);
    let verified = false;
    for (const verifier of verifiers) {
      try {
        verifier.verify(rawBody, normalizedHeaders, { jsonParse: false });
        verified = true;
        break;
      } catch { /* Try the previous key during a bounded rotation overlap. */ }
    }
    if (!verified) throw new SupabaseHookError("invalid_signature");
    let payload: unknown;
    try { payload = JSON.parse(rawBody); }
    catch { throw new SupabaseHookError("invalid_payload"); }
    const actionValue = (payload as { email_data?: { email_action_type?: unknown } } | null)?.email_data?.email_action_type;
    if (typeof actionValue === "string" && !actions.includes(actionValue as AuthAction)) {
      throw new SupabaseHookError("unsupported_action");
    }
    const parsed = payloadSchema.safeParse(payload);
    if (!parsed.success) throw new SupabaseHookError("invalid_payload");
    const { user, email_data: data } = parsed.data;
    const action = data.email_action_type;
    const redirect = data.redirect_to || config.defaultRedirect;
    if (!config.allowedRedirects.includes(redirect)) throw new SupabaseHookError("invalid_redirect");
    const recipients: { to: string; role: "current" | "new"; token: string; hash: string | null }[] = [];
    if (action === "email_change") {
      const newEmail = email.safeParse(user.new_email);
      if (!newEmail.success || newEmail.data.toLowerCase() === user.email.toLowerCase()) {
        throw new SupabaseHookError("invalid_payload");
      }
      if (config.emailChangeMode === "secure") {
        // Supabase's hash suffixes are historically reversed. Do not pair by name.
        recipients.push({ to: user.email, role: "current", token: required(data.token), hash: required(data.token_hash_new) });
        recipients.push({ to: newEmail.data, role: "new", token: required(data.token_new), hash: required(data.token_hash) });
      } else {
        if (data.token_hash_new || Boolean(data.token) === Boolean(data.token_new)) {
          throw new SupabaseHookError("invalid_payload");
        }
        recipients.push({ to: newEmail.data, role: "new", token: required(data.token || data.token_new), hash: required(data.token_hash) });
      }
    } else {
      if (data.token_new || data.token_hash_new) throw new SupabaseHookError("invalid_payload");
      recipients.push({ to: user.email, role: "current", token: required(data.token),
        hash: action === "reauthentication" ? null : required(data.token_hash) });
    }
    const messages = recipients.map(({ to, role, token, hash }) => {
      let verificationUrl: string | null = null;
      if (hash) {
        const url = new URL("/auth/v1/verify", project);
        url.search = new URLSearchParams({ token: hash, type: action, redirect_to: redirect }).toString();
        verificationUrl = url.href;
      }
      // Do not hash the OTP/body: low-entropy codes can be recovered from a digest.
      // Timestamp is excluded so re-signed retries retain the same recipient key.
      const idempotencyKey = "supa_" + createHash("sha256").update(JSON.stringify([
        "v1", project.origin, config.workspaceId, config.clientId, normalizedHeaders["webhook-id"], action, role, to,
      ])).digest("hex");
      const subject = `${titles[action]} — ${config.brand}`;
      const instruction = `${titles[action]} for ${config.brand}. Your code is: ${token}`;
      const text = `${instruction}${verificationUrl ? `\n\nContinue: ${verificationUrl}` : ""}\n\nIf you did not request this, ignore this email.`;
      const html = `<p>${escapeHtml(instruction)}</p>${verificationUrl ? `<p><a href="${escapeHtml(verificationUrl)}">${escapeHtml(titles[action])}</a></p>` : ""}<p>If you did not request this, ignore this email.</p>`;
      return new PreparedAuthEmail(role, idempotencyKey, { to, subject, html, text, verificationUrl });
    });
    const eventKey = createHash("sha256").update(JSON.stringify([
      "rootmail-hook-v1", project.origin, config.workspaceId, config.clientId, normalizedHeaders["webhook-id"],
    ])).digest("hex");
    return Object.freeze({ eventKey, signedAt: Number(normalizedHeaders["webhook-timestamp"]) * 1000,
      action, workspaceId: config.workspaceId, clientId: config.clientId,
      from: config.from, messages: Object.freeze(messages) });
  };
}

export { createSupabaseEmailHook, type SupabaseHookConfig, type HookLedger } from "./hook";
export { createPostgresHookLedger, type LedgerQuery } from "./ledger";
