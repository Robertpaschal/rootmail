import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { Redis } from "ioredis";
import { z } from "zod";
import { env } from "./env";

export const AUTH_CONTENT_POLICY = "authentication-v1";
export const AUTH_SUBJECT = "Authentication email";
export const AUTH_MAX_LIFETIME_MS = 60 * 60 * 1000;
export const AUTH_SEND_MARGIN_MS = 15_000;

/** Both admission and worker recheck this so removing a pilot stops queued work. */
export function authScopeEnabled(workspaceId: string, subTenantId: string | null): boolean {
  return env.AUTH_MESSAGES_ENABLED && env.AUTH_MESSAGE_SCOPES.some(scope =>
    scope.workspaceId === workspaceId && scope.subTenantId === subTenantId);
}
const contentSchema = z.object({ html: z.string().min(1).max(64_000), text: z.string().max(32_000) }).strict();
export type AuthContent = z.infer<typeof contentSchema>;
export interface AuthContentScope {
  id: string;
  workspaceId: string;
  subTenantId: string | null;
  authExpiresAt: Date;
}

export class AuthContentError extends Error {
  constructor(readonly code: "auth_unavailable" | "auth_expired" | "auth_content_unavailable" | "auth_content_invalid") {
    super(code);
    this.name = "AuthContentError";
  }
}

export function assertAuthLifetime(expiresAt: Date, now = Date.now()): void {
  const remaining = expiresAt.getTime() - now;
  if (!Number.isFinite(remaining) || remaining <= AUTH_SEND_MARGIN_MS || remaining > AUTH_MAX_LIFETIME_MS) {
    throw new AuthContentError("auth_expired");
  }
}

function keyBytes(secret: string): Buffer {
  const key = Buffer.from(secret, "base64");
  if (key.length !== 32 || key.toString("base64") !== secret) throw new AuthContentError("auth_unavailable");
  return key;
}
const binding = (scope: AuthContentScope) => JSON.stringify([
  AUTH_CONTENT_POLICY, scope.id, scope.workspaceId, scope.subTenantId, scope.authExpiresAt.getTime(),
]);

/** No bare OTP/body hashes: a keyed, domain-separated commitment is private to the server. */
export function authRequestFingerprint(value: unknown, secret = env.AUTH_CONTENT_KEY ?? ""): string {
  return createHmac("sha256", keyBytes(secret)).update("rootmail-auth-request-v1\0").update(JSON.stringify(value)).digest("hex");
}

export function sealAuthContent(content: AuthContent, scope: AuthContentScope, secret: string): string {
  assertAuthLifetime(scope.authExpiresAt);
  const parsed = contentSchema.safeParse(content);
  if (!parsed.success) throw new AuthContentError("auth_content_invalid");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(secret), iv);
  cipher.setAAD(Buffer.from(binding(scope)));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(parsed.data), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(".");
}

export function openAuthContent(sealed: string, scope: AuthContentScope, secret: string): AuthContent {
  assertAuthLifetime(scope.authExpiresAt);
  try {
    const [version, iv, tag, ciphertext, extra] = sealed.split(".");
    if (version !== "v1" || extra !== undefined || !ciphertext) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", keyBytes(secret), Buffer.from(iv, "base64"));
    decipher.setAAD(Buffer.from(binding(scope)));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    const raw = Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]);
    return contentSchema.parse(JSON.parse(raw.toString("utf8")));
  } catch { throw new AuthContentError("auth_content_unavailable"); }
}

export class AuthContentVault {
  constructor(private readonly redis: Redis, private readonly secret: string) { keyBytes(secret); }

  /** Checked on every put/take; any missing permission or unsafe setting fails closed. */
  async assertEphemeral(): Promise<void> {
    try {
      const settings = await this.redis.config("GET", "save", "appendonly", "maxmemory-policy", "maxmemory") as string[];
      const values = Object.fromEntries(Array.from({ length: settings.length / 2 }, (_, i) => [settings[i * 2], settings[i * 2 + 1]]));
      const role = await this.redis.role() as [string, number, unknown[]];
      if (values.save !== "" || values.appendonly !== "no" || values["maxmemory-policy"] !== "noeviction" || !(Number(values.maxmemory) > 0) ||
          role[0] !== "master" || !Array.isArray(role[2]) || role[2].length) throw new Error();
    } catch { throw new AuthContentError("auth_unavailable"); }
  }

  async put(scope: AuthContentScope, content: AuthContent): Promise<void> {
    await this.assertEphemeral();
    const sealed = sealAuthContent(content, scope, this.secret);
    try {
      const result = await this.redis.set(this.key(scope), sealed, "PXAT", scope.authExpiresAt.getTime(), "NX");
      if (result !== "OK") throw new Error(); // never overwrite or extend a lifetime
    } catch { throw new AuthContentError("auth_content_unavailable"); }
  }

  async take(scope: AuthContentScope): Promise<AuthContent> {
    await this.assertEphemeral();
    assertAuthLifetime(scope.authExpiresAt);
    let sealed: string | null;
    try { sealed = await this.redis.getdel(this.key(scope)); }
    catch { throw new AuthContentError("auth_content_unavailable"); }
    if (!sealed) throw new AuthContentError("auth_content_unavailable");
    return openAuthContent(sealed, scope, this.secret);
  }

  async discard(scope: AuthContentScope): Promise<void> {
    try { await this.redis.del(this.key(scope)); }
    catch { /* The absolute TTL remains; never print a Redis error with command arguments. */ }
  }

  private key(scope: AuthContentScope): string {
    // Scope is authenticated again by GCM, including the deadline.
    return `rootmail-auth:${scope.workspaceId}:${scope.id}`;
  }
}

let connection: Redis | undefined;
let vault: AuthContentVault | undefined;
export function getAuthContentVault(): AuthContentVault {
  if (!env.AUTH_MESSAGES_ENABLED || !env.AUTH_CONTENT_REDIS_URL || !env.AUTH_CONTENT_KEY) throw new AuthContentError("auth_unavailable");
  if (vault) return vault;
  try {
    keyBytes(env.AUTH_CONTENT_KEY);
    const url = new URL(env.AUTH_CONTENT_REDIS_URL);
    const queue = new URL(env.REDIS_URL);
    if (!["redis:", "rediss:"].includes(url.protocol) ||
        (url.hostname === queue.hostname && (url.port || "6379") === (queue.port || "6379"))) throw new Error();
    connection = new Redis(env.AUTH_CONTENT_REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 1000,
      commandTimeout: 1500, retryStrategy: () => null });
    connection.on("error", () => { /* Fixed safe errors are returned by vault operations. */ });
    vault = new AuthContentVault(connection, env.AUTH_CONTENT_KEY);
    return vault;
  } catch { throw new AuthContentError("auth_unavailable"); }
}
export async function closeAuthContentVault(): Promise<void> {
  const open = connection;
  connection = undefined;
  vault = undefined;
  if (open) await open.quit().catch(() => open.disconnect());
}
