import assert from "node:assert/strict";
import { after, before, describe, it, mock } from "node:test";
import { SESv2Client } from "@aws-sdk/client-sesv2";
import { eq, inArray } from "drizzle-orm";
import { closeQueues, closeRedis, env, newId } from "@rootmail/core";
import { appendInbound, closeDb, contacts, db, messages, organizations, senderIdentities, threads, users } from "@rootmail/db";
import { provisionAccount, createSession } from "../lib/auth";
import { buildServer } from "../server";
import { processSend } from "../../../worker/src/pipeline";
import { fallbackReplyFrom } from "./threads";

// Replying in a conversation we never sent into (it holds only inbound mail)
// used to send From no-reply@<slug>.rootmail.dev, which no SES identity of ours
// covers. It now uses the org's default verified sender, else the platform
// no-reply. Every AWS call is intercepted.
const stamp = Date.now();
const contact = `trf-contact-${stamp}@example.test`;
const own = `trf-hello-${stamp}@brand.example`;
const wire: { from?: string; replyTo?: string[] }[] = [];
let account: Awaited<ReturnType<typeof provisionAccount>>;
let app: Awaited<ReturnType<typeof buildServer>>;
let auth: { authorization: string };
const previous = { provider: env.MAIL_PROVIDER, sandbox: env.SES_SANDBOX_MODE, inbound: env.INBOUND_DOMAIN };

async function inboundOnlyThread(subject: string) {
  const [t] = await db.insert(threads).values({ id: newId("thread"), workspaceId: account.production.id, subTenantId: null, contactEmail: contact, subject }).returning();
  await appendInbound(t, { fromEmail: contact, toEmail: `reply+${t.id}@reply.example.test`, bodyText: "Hello, out of the blue" });
  return t;
}
async function replyIn(threadId: string) {
  const res = await app.inject({ method: "POST", url: `/v1/threads/${threadId}/reply`, headers: auth, payload: { text: "Thanks for writing" } });
  assert.equal(res.statusCode, 200, res.body);
  const rows = await db.select().from(messages).where(eq(messages.toEmail, contact));
  const latest = rows.sort((a, b) => +b.createdAt - +a.createdAt)[0];
  const before = wire.length;
  await processSend({ messageId: latest.id } as Parameters<typeof processSend>[0]);
  assert.equal(wire.length, before + 1, `${latest.status}: ${latest.error ?? ""}`);
  return { row: latest, wire: wire[wire.length - 1] };
}

before(async () => {
  env.MAIL_PROVIDER = "ses"; env.SES_SANDBOX_MODE = "false"; env.INBOUND_DOMAIN = "reply.example.test";
  mock.method(SESv2Client.prototype, "send", async (command: { constructor: { name: string }; input: Record<string, any> }) => {
    if (command.constructor.name === "SendEmailCommand") {
      wire.push({ from: command.input.FromEmailAddress, replyTo: command.input.ReplyToAddresses });
      return { MessageId: `ses-trf-${wire.length}-${stamp}` };
    }
    if (command.constructor.name === "GetEmailIdentityCommand") return { VerifiedForSendingStatus: true, DkimAttributes: { Status: "SUCCESS", SigningEnabled: true } };
    throw new Error(`Unexpected AWS operation: ${command.constructor.name}`);
  });
  account = await provisionAccount({ email: `trf-owner-${stamp}@example.test`, passwordHash: null, betaInviteId: "local-test-invite", name: "TRF" });
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, account.user.id));
  auth = { authorization: `Bearer ${(await createSession(account.user.id, account.production.id)).token}` };
  app = await buildServer(); await app.ready();
});

after(async () => {
  await app?.close();
  await closeQueues(); await closeRedis();
  await db.delete(messages).where(eq(messages.toEmail, contact));
  await db.delete(organizations).where(eq(organizations.id, account.organizationId));
  await db.delete(users).where(eq(users.id, account.user.id));
  await db.delete(contacts).where(inArray(contacts.email, [contact]));
  mock.restoreAll();
  Object.assign(env, { MAIL_PROVIDER: previous.provider, SES_SANDBOX_MODE: previous.sandbox, INBOUND_DOMAIN: previous.inbound });
  await closeDb();
});

describe("reply From in a conversation with no outbound email", () => {
  it("no verified sender → the platform no-reply (never rootmail.dev), with the reply captured", async () => {
    const t = await inboundOnlyThread(`Inbound only A ${stamp}`);
    const { row, wire: w } = await replyIn(t.id);
    assert.equal(row.fromEmail, `no-reply@${env.ROOTMAIL_DOMAIN}`);
    assert.doesNotMatch(w.from ?? "", /rootmail\.dev/);
    assert.match(w.replyTo?.[0] ?? "", /^reply\+thr_.+@reply\.example\.test$/);
  });

  it("with a default verified sender → that sender", async () => {
    await db.insert(senderIdentities).values({ id: newId("senderIdentity"), organizationId: account.organizationId, email: own, status: "verified", verifiedAt: new Date(), isDefault: true });
    const t = await inboundOnlyThread(`Inbound only B ${stamp}`);
    const { row, wire: w } = await replyIn(t.id);
    assert.equal(row.fromEmail, own);
    assert.ok(w.from?.includes(own));
  });

  it("a pending (unverified) address is never used", async () => {
    const other = await provisionAccount({ email: `trf-other-${stamp}@example.test`, passwordHash: null, betaInviteId: "local-test-invite", name: "TRF2" });
    try {
      await db.insert(senderIdentities).values({ id: newId("senderIdentity"), organizationId: other.organizationId, email: `trf-pending-${stamp}@brand.example`, status: "pending", isDefault: false });
      assert.equal(await fallbackReplyFrom({ subTenantId: null }, other.organizationId), `no-reply@${env.ROOTMAIL_DOMAIN}`);
    } finally {
      await db.delete(organizations).where(eq(organizations.id, other.organizationId));
      await db.delete(users).where(eq(users.id, other.user.id));
    }
  });
});
