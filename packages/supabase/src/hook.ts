import { createHmac } from "node:crypto";
import { z } from "zod";
import { createSupabaseEmailPlanner, SupabaseHookError, type SupabaseEmailConfig } from "./index";

export interface HookLedger {
  /** Atomic insert-or-read, immutable expiry/commitment. Must be durable across hosts/restarts. */
  claim(input: { eventKey: string; fingerprint: string; expiresAt: string }): Promise<{ fingerprint: string; expiresAt: string }>;
}
export interface SupabaseHookConfig extends SupabaseEmailConfig {
  rootmailUrl: string;
  rootmailApiKey: string;
  replyTo?: string;
  /** Optional controlled-pilot restriction, checked after signature verification. */
  allowedRecipients?: readonly string[];
  /** Match the project's OTP TTL; currently supports 10–60 minutes with a 5-minute reserve. */
  credentialLifetimeSeconds: number;
  /** Independent stable 32-byte base64 secret. Rotation is not transparent to existing events. */
  ledgerKey: string;
  ledger: HookLedger;
  budgetMs?: number;
}
class HookFailure extends Error {
  constructor(readonly status: number) { super("authentication_email_unconfirmed"); }
}
function rootmailUrl(value: string): URL {
  try { return new URL(value); }
  catch { throw new SupabaseHookError("invalid_configuration"); }
}
function pause(signal: AbortSignal, milliseconds: number): Promise<void> {
  return new Promise(resolve => {
    const finish = () => { clearTimeout(timer); signal.removeEventListener("abort", finish); resolve(); };
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });
    if (signal.aborted) finish();
  });
}

/** Race as well as abort: broken adapters/streams must not hold a hook response open. */
function bounded<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new HookFailure(503));
    if (signal.aborted) { void operation.catch(() => {}); abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
async function readLimited(body: ReadableStream<Uint8Array> | null, limit: number, signal: AbortSignal): Promise<string> {
  if (!body) throw new HookFailure(400);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await bounded(reader.read(), signal);
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new HookFailure(413);
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } finally { void reader.cancel().catch(() => {}); }
}
const receipt = z.object({
  id: z.string().regex(/^msg_[A-Za-z0-9_-]+$/), content_policy: z.literal("authentication-v1"),
  workspace_id: z.string(), sub_tenant_id: z.string().nullable(), to: z.string(),
  expires_at: z.string().datetime(), sandbox: z.literal(false), test_recipient: z.null(),
  status: z.string(), provider: z.string().nullable(), provider_message_id: z.string().nullable(),
});

/** Web Request -> Response reference hook. No runtime app installs it automatically. */
export function createSupabaseEmailHook(input: SupabaseHookConfig, dependencies: { fetch?: typeof fetch } = {}) {
  const planner = createSupabaseEmailPlanner(input);
  const url = rootmailUrl(input.rootmailUrl);
  const key = Buffer.from(typeof input.ledgerKey === "string" ? input.ledgerKey : "", "base64");
  const budget = input.budgetMs ?? 4500;
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
      !/^rm_live_[A-Za-z0-9_-]+$/.test(input.rootmailApiKey) || key.length !== 32 || key.toString("base64") !== input.ledgerKey ||
      !Number.isInteger(input.credentialLifetimeSeconds) || input.credentialLifetimeSeconds < 600 || input.credentialLifetimeSeconds > 3600 ||
      !Number.isInteger(budget) || budget < 50 || budget > 4500 || typeof input.ledger?.claim !== "function" ||
      (input.replyTo !== undefined && (!z.string().email().safeParse(input.replyTo).success || input.replyTo.toLowerCase().startsWith("reply+")))) {
    throw new SupabaseHookError("invalid_configuration");
  }
  if (input.allowedRecipients !== undefined && !z.array(z.string().email()).min(1).max(10).safeParse(input.allowedRecipients).success) {
    throw new SupabaseHookError("invalid_configuration");
  }
  const allowedRecipients = input.allowedRecipients ? new Set(input.allowedRecipients.map(email => email.toLowerCase())) : null;
  // Copy mutable caller config once. Per-request tenant claims never affect these values.
  const { rootmailApiKey, replyTo, credentialLifetimeSeconds, ledger } = input;
  const fetcher = dependencies.fetch ?? fetch;
  return async (request: Request): Promise<Response> => {
    const started = performance.now();
    const controller = new AbortController();
    const abort = () => controller.abort();
    const timer = setTimeout(abort, budget);
    request.signal.addEventListener("abort", abort, { once: true });
    if (request.signal.aborted) abort();
    const signal = controller.signal;
    const checkBudget = () => {
      if (signal.aborted || performance.now() - started >= budget) throw new HookFailure(503);
    };
    try {
      if (request.method !== "POST") throw new HookFailure(405);
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) throw new HookFailure(415);
      const length = request.headers.get("content-length");
      if (length && (!/^\d+$/.test(length) || Number(length) > 128 * 1024)) throw new HookFailure(413);
      const raw = await readLimited(request.body, 128 * 1024, signal);
      const plan = planner(raw, request.headers); // verifies before any ledger or network operation
      if (allowedRecipients && plan.messages.some(message => !allowedRecipients.has(message.readSensitiveContent().to.toLowerCase()))) {
        throw new HookFailure(403);
      }
      const headers = { authorization: `Bearer ${rootmailApiKey}`, "content-type": "application/json",
        ...(plan.clientId ? { "x-rootmail-subtenant": plan.clientId } : {}) };
      const api = async (path: string, method = "GET", body?: unknown): Promise<unknown> => {
        checkBudget();
        const init = {
          method, headers, body: body === undefined ? undefined : JSON.stringify(body),
          redirect: "error" as const, cache: "no-store" as const, signal,
        };
        const response = await bounded(fetcher(new URL(path, url), init), signal);
        if (!response.ok) {
          void response.body?.cancel().catch(() => {});
          throw new HookFailure([401, 402, 403, 409, 422, 429].includes(response.status) ? response.status : 503);
        }
        return JSON.parse(await readLimited(response.body, 64 * 1024, signal));
      };
      // Old servers must reject BEFORE receiving secret content. Never fall back to ordinary mail.
      const capability = z.object({ policy: z.literal("authentication-v1"), provider: z.literal("ses"),
        workspace_id: z.literal(plan.workspaceId), sub_tenant_id: z.literal(plan.clientId) }).safeParse(
        await api("/v1/auth-messages/capabilities"));
      if (!capability.success) throw new HookFailure(503);
      const fingerprint = createHmac("sha256", key).update("rootmail-hook-content-v1\0").update(JSON.stringify([
        plan.action, plan.from, replyTo ?? null, credentialLifetimeSeconds,
        plan.messages.map(m => [m.idempotencyKey, m.readSensitiveContent()]),
      ])).digest("hex");
      // Timestamp is a signature time, NOT proven issuance. Reserve the whole allowed signature
      // age (5 minutes), then persist this first-event bound. Re-signing never renews it.
      const proposed = Math.min(Date.now(), plan.signedAt) + (credentialLifetimeSeconds - 300) * 1000;
      checkBudget();
      const entry = await bounded(ledger.claim({ eventKey: plan.eventKey, fingerprint, expiresAt: new Date(proposed).toISOString() }), signal);
      if (entry.fingerprint !== fingerprint) throw new HookFailure(409);
      const expiresAt = new Date(entry.expiresAt);
      if (!Number.isFinite(+expiresAt) || +expiresAt > proposed || +expiresAt - Date.now() <= 15_000) throw new HookFailure(422);
      const deadline = expiresAt.toISOString();
      // Both recipients share the single request budget; no nested POST retry loop.
      await Promise.all(plan.messages.map(async message => {
        const content = message.readSensitiveContent();
        let result = await api("/v1/auth-messages", "POST", { policy: "authentication-v1", to: content.to,
          from: plan.from, ...(replyTo ? { reply_to: replyTo } : {}), html: content.html, text: content.text,
          expires_at: deadline, idempotency_key: message.idempotencyKey });
        let id: string | undefined;
        let pollDelay = 100;
        for (;;) {
          const parsed = receipt.safeParse(result);
          if (!parsed.success) throw new HookFailure(503);
          const row = parsed.data;
          if (row.workspace_id !== plan.workspaceId || row.sub_tenant_id !== plan.clientId || row.to !== content.to ||
              row.expires_at !== deadline || (id && row.id !== id)) throw new HookFailure(503);
          id = row.id;
          if (["sent", "delivered"].includes(row.status) && row.provider === "ses" && row.provider_message_id) return;
          if (!["queued", "sending"].includes(row.status)) throw new HookFailure(409);
          if (+expiresAt - Date.now() <= 15_000) throw new HookFailure(422);
          await bounded(pause(signal, pollDelay), signal);
          pollDelay = Math.min(400, pollDelay * 2);
          result = await api(`/v1/messages/${id}`);
        }
      }));
      checkBudget();
      return Response.json({}, { status: 200, headers: { "cache-control": "no-store" } });
    } catch (error) {
      const status = error instanceof HookFailure ? error.status : error instanceof SupabaseHookError
        ? error.code === "invalid_signature" ? 401 : 422 : 503;
      return Response.json({ error: { http_code: status, message: "Authentication email could not be confirmed. Request a new code if needed." } },
        { status, headers: { "cache-control": "no-store" } });
    } finally {
      clearTimeout(timer);
      request.signal.removeEventListener("abort", abort);
      controller.abort(); // cancel sibling recipient work after partial failure
    }
  };
}
