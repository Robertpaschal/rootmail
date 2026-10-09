import assert from "node:assert/strict";
import { after, before, describe, it, mock } from "node:test";
import { SESv2Client } from "@aws-sdk/client-sesv2";
import { eq, inArray } from "drizzle-orm";
import { closeQueues, closeRedis, env, newId } from "@rootmail/core";
import { closeDb, contacts, db, messages, organizations, senderIdentities, users } from "@rootmail/db";
import { provisionAccount, createSession } from "../lib/auth";
import { buildServer } from "../server";
import { processSend } from "../../../worker/src/pipeline";
import { automationSend } from "../../../worker/src/send";

// An org in own_mailbox mode with no verified sender sends From the platform
// no-reply. A reply to that must be captured, not bounced; an org sending from
// its own verified mailbox in own_mailbox mode keeps replies going to that
// mailbox, exactly as before. Every AWS call is intercepted.
const stamp = Date.now();
const recipient = `nrc-to-${stamp}@example.test`;
const own = `nrc-hello-${stamp}@brand.example`;
const wire: { from?: string; replyTo?: string[] }[] = [];
let account: Awaited<ReturnType<typeof provisionAccount>>;
let app: Awaited<ReturnType<typeof buildServer>>;
let auth: { authorization: string };
const previous = { provider: env.MAIL_PROVIDER, sandbox: env.SES_SANDBOX_MODE, inbound: env.INBOUND_DOMAIN };

async function send(payload: Record<string, unknown>) {
  const res = await app.inject({ method: "POST", url: "/v1/messages", headers: auth, payload: { to: recipient, subject: `NRC ${stamp}`, html: "<p>x</p>", ...payload } });
  assert.equal(res.statusCode, 202, res.body);
  const before = wire.length;
  await processSend({ messageId: res.json().id } as Parameters<typeof processSend>[0]);
  assert.equal(wire.length, before + 1);
  return wire[wire.length - 1];
}

before(async () => {
  env.MAIL_PROVIDER = "ses"; env.SES_SANDBOX_MODE = "false"; env.INBOUND_DOMAIN = "reply.example.test";
  mock.method(SESv2Client.prototype, "send", async (command: { constructor: { name: string }; input: Record<string, any> }) => {
    if (command.constructor.name === "SendEmailCommand") {
      wire.push({ from: command.input.FromEmailAddress, replyTo: command.input.ReplyToAddresses });
      return { MessageId: `ses-nrc-${wire.length}-${stamp}` };
    }
    if (command.constructor.name === "GetEmailIdentityCommand") return { VerifiedForSendingStatus: true, DkimAttributes: { Status: "SUCCESS", SigningEnabled: true } };
    throw new Error(`Unexpected AWS operation: ${command.constructor.name}`);
  });
  account = await provisionAccount({ email: `nrc-owner-${stamp}@example.test`, passwordHash: null, betaInviteId: "local-test-invite", name: "NRC" });
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, account.user.id));
  await db.update(organizations).set({ replyMode: "own_mailbox", postalAddress: "1 Test Street, Lagos" }).where(eq(organizations.id, account.organizationId));
  auth = { authorization: `Bearer ${(await createSession(account.user.id, account.production.id)).token}` };
  app = await buildServer(); await app.ready();
});

after(async () => {
  await app?.close();
  await closeQueues(); await closeRedis();
  await db.delete(messages).where(eq(messages.toEmail, recipient));
  await db.delete(organizations).where(eq(organizations.id, account.organizationId));
  await db.delete(users).where(eq(users.id, account.user.id));
  await db.delete(contacts).where(inArray(contacts.email, [recipient]));
  mock.restoreAll();
  Object.assign(env, { MAIL_PROVIDER: previous.provider, SES_SANDBOX_MODE: previous.sandbox, INBOUND_DOMAIN: previous.inbound });
  await closeDb();
});

describe("own_mailbox mode", () => {
  it("no verified sender → From no-reply@, and the reply is still captured (API send)", async () => {
    const w = await send({});
    assert.ok(w.from?.includes(`no-reply@${env.ROOTMAIL_DOMAIN}`), w.from);
    assert.match(w.replyTo?.[0] ?? "", /^reply\+thr_[A-Za-z0-9_-]+@reply\.example\.test$/);
  });

  it("…and on campaign/sequence sends from the default no-reply", async () => {
    const before = wire.length;
    const { messageId } = await automationSend({
      workspaceId: account.production.id, subTenantId: null, organizationId: account.organizationId, mode: "live",
      type: "marketing", to: recipient, fromEmail: `no-reply@${env.ROOTMAIL_DOMAIN}`, subject: `Seq ${stamp}`, html: "<p>s</p>",
    });
    await processSend({ messageId } as Parameters<typeof processSend>[0]);
    assert.equal(wire.length, before + 1);
    assert.match(wire[wire.length - 1].replyTo?.[0] ?? "", /^reply\+thr_.+@reply\.example\.test$/);
  });

  it("an explicit reply_to still wins over capture", async () => {
    const w = await send({ reply_to: "support@brand.example" });
    assert.deepEqual(w.replyTo, ["support@brand.example"]);
  });

  it("a real verified mailbox keeps replies to itself, exactly as before", async () => {
    await db.insert(senderIdentities).values({ id: newId("senderIdentity"), organizationId: account.organizationId, email: own, status: "verified", verifiedAt: new Date(), isDefault: true });
    const named = await send({ from: { email: own } });
    assert.deepEqual(named.replyTo, [own]);
    const byDefault = await send({});
    assert.ok(byDefault.from?.includes(own), byDefault.from);
    assert.deepEqual(byDefault.replyTo, [own]);
  });
});
