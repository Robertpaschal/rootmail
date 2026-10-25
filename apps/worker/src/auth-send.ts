import { and, eq } from "drizzle-orm";
import { AuthContentError, assertAuthLifetime, env, getAuthContentVault, type AuthContent } from "@rootmail/core";
import { db, messages, organizations, orgSendingProviders, workspaces, type Message } from "@rootmail/db";
import { sendAuthViaSes } from "./providers/auth-ses";

export type AuthSend = (message: Message, content: AuthContent) => Promise<{ provider: string; providerMessageId: string }>;
type Audit = (message: Message, event: "sending" | "sent" | "failed" | "suppressed", extra?: {
  provider?: string; providerMessageId?: string; metadata?: Record<string, unknown>;
}) => Promise<void>;

/** Called only after the normal recipient/reputation/suspension checks. Never threads or renders. */
export async function processAuthSend(message: Message, audit: Audit, suppressed: () => Promise<boolean>, send: AuthSend = sendAuthViaSes): Promise<void> {
  if (!message.authExpiresAt) throw new Error("not_auth_message");
  const scope = { ...message, authExpiresAt: message.authExpiresAt };
  let vault: ReturnType<typeof getAuthContentVault> | undefined;
  let sentRecorded = false;
  let ownsClaim = false;
  try {
    if (!env.AUTH_MESSAGES_ENABLED || message.sandbox) throw new AuthContentError("auth_unavailable");
    assertAuthLifetime(message.authExpiresAt);
    vault = getAuthContentVault();
    const [org] = await db.select({ id: organizations.id, byo: organizations.byoProvider, dedicated: organizations.dedicatedIpStatus })
      .from(organizations).innerJoin(workspaces, eq(workspaces.organizationId, organizations.id))
      .where(eq(workspaces.id, message.workspaceId)).limit(1);
    if (!org || org.byo || org.dedicated === "active") throw new AuthContentError("auth_unavailable");
    const [own] = await db.select({ id: orgSendingProviders.id }).from(orgSendingProviders)
      .where(eq(orgSendingProviders.organizationId, org.id)).limit(1);
    if (own) throw new AuthContentError("auth_unavailable");
    // A durable CAS, not just a BullMQ job ID. Concurrent/stalled workers cannot resend.
    const [claimed] = await db.update(messages).set({ status: "sending", updatedAt: new Date() })
      .where(and(eq(messages.id, message.id), eq(messages.status, "queued"))).returning({ id: messages.id });
    if (!claimed) return;
    ownsClaim = true;
    await audit(message, "sending");
    if (await suppressed()) {
      await db.update(messages).set({ status: "suppressed", error: "auth_recipient_suppressed", updatedAt: new Date() }).where(eq(messages.id, message.id));
      await audit(message, "suppressed");
      await vault.discard(scope);
      return;
    }
    // Atomic GETDEL: no second fetch/retry after the provider might have accepted.
    const content = await vault.take(scope);
    assertAuthLifetime(message.authExpiresAt);
    const result = await send(message, content);
    if (result.provider !== "ses" || !result.providerMessageId) throw new Error("auth_simulation_refused");
    await db.update(messages).set({ status: "sent", provider: result.provider, providerMessageId: result.providerMessageId,
      error: null, updatedAt: new Date() }).where(eq(messages.id, message.id));
    sentRecorded = true;
    await audit(message, "sent", result);
  } catch (error) {
    // A later audit failure cannot undo an observed, durably recorded provider acceptance.
    if (sentRecorded) return;
    const reason = error instanceof AuthContentError ? error.code : "auth_send_outcome_unknown";
    const [failed] = await db.update(messages).set({ status: "failed", error: reason, updatedAt: new Date() })
      .where(and(eq(messages.id, message.id), eq(messages.status, ownsClaim ? "sending" : "queued")))
      .returning({ id: messages.id });
    // A stale worker must neither replace another worker's outcome nor purge its content.
    if (!failed) return;
    await audit(message, "failed", { metadata: { reason } });
    if (vault) await vault.discard(scope);
    // Deliberately no rethrow: raw errors and secret-bearing provider requests
    // must not land in BullMQ failedReason/stacktrace, logs, or automatic retries.
  }
}
