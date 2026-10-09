import assert from "node:assert/strict";
import { after, before, describe, it, mock } from "node:test";
import { SESv2Client } from "@aws-sdk/client-sesv2";
import { and, eq, inArray } from "drizzle-orm";
import { BETA_REPLY_CAPTURE_UNAVAILABLE, betaSenderAddress, closeQueues, closeRedis, env } from "@rootmail/core";
import { closeDb, contacts, db, messages, organizations, resolveReplyTo, threadMessages, threads, users } from "@rootmail/db";
import { provisionAccount, createSession } from "../lib/auth";
import { applySesInbound } from "../lib/ses-events";
import { buildServer } from "../server";
import { processSend } from "../../../worker/src/pipeline";
import { automationSend } from "../../../worker/src/send";

// Replies to a one-click beta address must come back into that org's Replies
// inbox. rootmail.io's own MX is a human mail host with no beta+ mailboxes, so a
// send without a routable Reply-To is a reply that hard-bounces. Every AWS call
// is intercepted here; nothing leaves the process.
const stamp = Date.now();
const ownerEmail = `beta-reply-${stamp}@example.test`;
const otherEmail = `beta-reply-other-${stamp}@example.test`;
const recipient = `customer-${stamp}@example.test`;
const sent: { from?: string; replyTo?: string[] }[] = [];
let account: Awaited<ReturnType<typeof provisionAccount>>;
let other: Awaited<ReturnType<typeof provisionAccount>>;
let app: Awaited<ReturnType<typeof buildServer>>;
let auth: { authorization: string };
let beta: string;
const previous = { provider: env.MAIL_PROVIDER, sandbox: env.SES_SANDBOX_MODE, inbound: env.INBOUND_DOMAIN };

const request = (method: "GET" | "POST", url: string, payload?: Record<string, unknown>) => app.inject({ method, url, headers: auth, payload });

async function sendAndProcess(payload: Record<string, unknown>) {
  const res = await request("POST", "/v1/messages", { to: recipient, subject: `Hello ${stamp}`, html: "<p>Hi</p>", from: { email: beta }, ...payload });
  assert.equal(res.statusCode, 202, res.body);
  const id = res.json().id as string;
  await processSend({ messageId: id } as Parameters<typeof processSend>[0]);
  const [row] = await db.select().from(messages).where(eq(messages.id, id));
  return row;
}

function inboundReply(to: string, opts: { from?: string; subject?: string } = {}) {
  const raw = [
    `From: Customer <${opts.from ?? recipient}>`,
    `To: ${to}`,
    `Subject: ${opts.subject ?? `Re: Hello ${stamp}`}`,
    `Message-ID: <reply-${Math.random().toString(36).slice(2)}@example.test>`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    "Thanks, this reached you?",
    "",
  ].join("\r\n");
  return applySesInbound({
    notificationType: "Received",
    mail: { source: opts.from ?? recipient, destination: [to] },
    receipt: { recipients: [to], action: { type: "SNS" } },
    content: Buffer.from(raw).toString("base64"),
  });
}

before(async () => {
  env.MAIL_PROVIDER = "ses";
  env.SES_SANDBOX_MODE = "false";
  env.INBOUND_DOMAIN = "reply.example.test";
  mock.method(SESv2Client.prototype, "send", async (command: { constructor: { name: string }; input: Record<string, any> }) => {
    const name = command.constructor.name;
    if (name === "GetEmailIdentityCommand") return { VerifiedForSendingStatus: true, DkimAttributes: { Status: "SUCCESS", SigningEnabled: true } };
    if (name === "SendEmailCommand") {
      sent.push({ from: command.input.FromEmailAddress, replyTo: command.input.ReplyToAddresses });
      return { MessageId: `ses-${sent.length}-${stamp}` };
    }
    throw new Error(`Unexpected AWS operation: ${name}`);
  });
  account = await provisionAccount({ email: ownerEmail, passwordHash: null, betaInviteId: "local-test-invite", name: "Reply fixture" });
  other = await provisionAccount({ email: otherEmail, passwordHash: null, betaInviteId: "local-test-invite", name: "Other fixture" });
  // Campaign/sequence mail is commercial and must carry a postal address.
  await db.update(organizations).set({ postalAddress: "1 Test Street, Lagos" }).where(eq(organizations.id, account.organizationId));
  for (const u of [account.user.id, other.user.id]) await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, u));
  auth = { authorization: `Bearer ${(await createSession(account.user.id, account.production.id)).token}` };
  app = await buildServer(); await app.ready();
  const activated = await request("POST", "/v1/senders/beta", {});
  assert.equal(activated.statusCode, 200, activated.body);
  beta = activated.json().email;
  assert.equal(beta, betaSenderAddress(account.organizationId, env.ROOTMAIL_DOMAIN));
});

after(async () => {
  await app?.close();
  await closeQueues(); await closeRedis();
  for (const a of [account, other]) if (a) {
    await db.delete(organizations).where(eq(organizations.id, a.organizationId));
    await db.delete(users).where(eq(users.id, a.user.id));
  }
  await db.delete(contacts).where(inArray(contacts.email, [ownerEmail, otherEmail, recipient]));
  mock.restoreAll();
  env.MAIL_PROVIDER = previous.provider; env.SES_SANDBOX_MODE = previous.sandbox; env.INBOUND_DOMAIN = previous.inbound;
  await closeDb();
});

describe("beta address reply capture", () => {
  it("never lets a beta address stand in as its own Reply-To", () => {
    const managed = betaSenderAddress("org_x", env.ROOTMAIL_DOMAIN);
    assert.equal(resolveReplyTo({ fromEmail: managed, conversationId: "thr_a", replyMode: "inbox", explicit: managed }), "reply+thr_a@reply.example.test");
    assert.equal(resolveReplyTo({ fromEmail: "hello@brand.example", conversationId: "thr_a", replyMode: "inbox", explicit: managed.toUpperCase() }), "reply+thr_a@reply.example.test");
    assert.equal(resolveReplyTo({ fromEmail: managed.toUpperCase(), conversationId: "thr_a", replyMode: "own_mailbox" }), "reply+thr_a@reply.example.test");
    assert.equal(resolveReplyTo({ fromEmail: managed, conversationId: "thr_a", replyMode: "inbox", explicit: "me@brand.example" }), "me@brand.example");
  });

  it("sends with a routable Reply-To, and a reply to it lands in that org's inbox", async () => {
    const before = sent.length;
    const row = await sendAndProcess({});
    assert.ok(["sent", "delivered"].includes(row.status), `${row.status}: ${row.error ?? ""}`);
    const out = sent.slice(before);
    assert.equal(out.length, 1);
    assert.equal(out[0].from?.includes(beta), true);
    assert.match(out[0].replyTo?.[0] ?? "", /^reply\+thr_[A-Za-z0-9_-]+@reply\.example\.test$/);
    assert.equal(row.replyTo, out[0].replyTo?.[0]);

    assert.equal(await inboundReply(out[0].replyTo![0]), "received");
    const threadId = /^reply\+([^@]+)@/.exec(out[0].replyTo![0])![1];
    const [thread] = await db.select().from(threads).where(eq(threads.id, threadId));
    assert.equal(thread.workspaceId, account.production.id, "the reply belongs to the sending org's workspace");
    const inbound = await db.select().from(threadMessages).where(and(eq(threadMessages.threadId, threadId), eq(threadMessages.direction, "inbound")));
    assert.equal(inbound.length, 1);
    assert.equal(inbound[0].fromEmail, recipient);
    const others = await db.select({ id: threads.id }).from(threads).where(eq(threads.workspaceId, other.production.id));
    for (const t of others) {
      assert.equal((await db.select().from(threadMessages).where(and(eq(threadMessages.threadId, t.id), eq(threadMessages.direction, "inbound")))).length, 0);
    }
  });

  it("drops a guessed reply token instead of filing it anywhere", async () => {
    assert.equal(await inboundReply("reply+thr_notarealthread000000@reply.example.test", { subject: `Unrelated ${stamp}` }), "ignored");
  });

  it("keeps an explicit customer Reply-To, but replaces one that is the beta address itself", async () => {
    let before = sent.length;
    const kept = await sendAndProcess({ reply_to: "support@brand.example" });
    assert.deepEqual(sent.slice(before)[0].replyTo, ["support@brand.example"]);
    assert.equal(kept.replyTo, "support@brand.example");
    before = sent.length;
    await sendAndProcess({ reply_to: beta });
    assert.match(sent.slice(before)[0].replyTo?.[0] ?? "", /^reply\+thr_.+@reply\.example\.test$/);
  });

  it("captures replies on campaign and sequence sends from the beta address", async () => {
    const before = sent.length;
    const { messageId } = await automationSend({
      workspaceId: account.production.id, subTenantId: null, organizationId: account.organizationId, mode: "live",
      type: "marketing", to: recipient, fromEmail: beta, subject: `Step one ${stamp}`, html: "<p>Step one</p>",
    });
    await processSend({ messageId } as Parameters<typeof processSend>[0]);
    const out = sent.slice(before);
    assert.equal(out.length, 1);
    assert.match(out[0].replyTo?.[0] ?? "", /^reply\+thr_.+@reply\.example\.test$/);
    assert.equal(await inboundReply(out[0].replyTo![0], { subject: `Re: Step one ${stamp}` }), "received");
  });

  it("refuses rather than sends when no reply address can be attached", async () => {
    env.INBOUND_DOMAIN = undefined;
    try {
      const refused = await request("POST", "/v1/messages", { to: recipient, subject: "No capture", html: "<p>x</p>", from: { email: beta } });
      assert.equal(refused.statusCode, 422, refused.body);
      assert.match(refused.body, /would bounce/);
      // An explicit, routable Reply-To is still a working reply path.
      const explicit = await request("POST", "/v1/messages", { to: recipient, subject: "Own reply", html: "<p>x</p>", from: { email: beta }, reply_to: "me@brand.example" });
      assert.equal(explicit.statusCode, 202, explicit.body);

      // Mail already queued (campaigns, sequences, scheduled) meets the same rule in the worker.
      const before = sent.length;
      const { messageId } = await automationSend({
        workspaceId: account.production.id, subTenantId: null, organizationId: account.organizationId, mode: "live",
        type: "marketing", to: recipient, fromEmail: beta, subject: `Queued ${stamp}`, html: "<p>Queued</p>",
      });
      await processSend({ messageId } as Parameters<typeof processSend>[0]);
      const [row] = await db.select().from(messages).where(eq(messages.id, messageId));
      assert.equal(row.status, "failed");
      assert.equal(row.error, BETA_REPLY_CAPTURE_UNAVAILABLE);
      assert.equal(sent.length, before, "nothing reached the provider");
    } finally { env.INBOUND_DOMAIN = "reply.example.test"; }
  });
});
