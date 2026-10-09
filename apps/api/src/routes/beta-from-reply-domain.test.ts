import assert from "node:assert/strict";
import { after, before, describe, it, mock } from "node:test";
import { SESv2Client } from "@aws-sdk/client-sesv2";
import { and, eq, inArray } from "drizzle-orm";
import { betaSenderAddress, closeQueues, closeRedis, env, newId } from "@rootmail/core";
import {
  betaAddressOrgId, betaSenderDomain, campaigns, closeDb, contacts, db, isPlatformBetaFrom, messages, organizations,
  resolveReplyTo, senderIdentities, threadMessages, threads, users,
} from "@rootmail/db";
import { provisionAccount, createSession } from "../lib/auth";
import { migrateBetaSenders } from "../lib/beta-sender-migration";
import { applySesInbound } from "../lib/ses-events";
import { runBetaSenderMigrate } from "../cli/beta-sender-migrate";
import { buildServer } from "../server";
import { processSend } from "../../../worker/src/pipeline";

// Beta addresses move from beta+<org>@<apex> (no mailbox: a hand-typed reply
// bounced) to beta+<org>@reply.<apex>, which our SES inbound receives. Old apex
// addresses, their threads and integrations that hard-code them keep working.
// Every AWS call is intercepted; nothing leaves the process.
const stamp = Date.now();
const apex = () => env.ROOTMAIL_DOMAIN.toLowerCase();
const recipient = `bfr-customer-${stamp}@example.test`;
const stranger = `bfr-stranger-${stamp}@example.test`;
const sent: { from?: string; replyTo?: string[] }[] = [];
const awsCalls: string[] = [];
type Account = Awaited<ReturnType<typeof provisionAccount>>;
const accounts: Account[] = [];
let fresh: Account; let legacy: Account; let unmigrated: Account;
let app: Awaited<ReturnType<typeof buildServer>>;
const previous = { provider: env.MAIL_PROVIDER, sandbox: env.SES_SANDBOX_MODE, inbound: env.INBOUND_DOMAIN };

async function bearer(a: Account) { return { authorization: `Bearer ${(await createSession(a.user.id, a.production.id)).token}` }; }
async function call(a: Account, method: "GET" | "POST", url: string, payload?: Record<string, unknown>) {
  return app.inject({ method, url, headers: await bearer(a), payload });
}
async function send(a: Account, from: string, subject: string) {
  const res = await call(a, "POST", "/v1/messages", { to: recipient, subject, html: '<p>Hi <a href="https://example.test">x</a></p>', from: { email: from } });
  assert.equal(res.statusCode, 202, res.body);
  const id = res.json().id as string;
  const before = sent.length;
  await processSend({ messageId: id } as Parameters<typeof processSend>[0]);
  const [row] = await db.select().from(messages).where(eq(messages.id, id));
  return { row, wire: sent.slice(before) };
}
function inbound(to: string, opts: { from?: string; subject: string; inReplyTo?: string }) {
  const raw = [
    `From: Someone <${opts.from ?? recipient}>`, `To: ${to}`, `Subject: ${opts.subject}`,
    `Message-ID: <in-${Math.random().toString(36).slice(2)}@example.test>`,
    ...(opts.inReplyTo ? [`In-Reply-To: ${opts.inReplyTo}`, `References: ${opts.inReplyTo}`] : []),
    "Content-Type: text/plain; charset=utf-8", "", "Hello there", "",
  ].join("\r\n");
  return applySesInbound({
    notificationType: "Received",
    mail: { source: opts.from ?? recipient, destination: [to] },
    receipt: { recipients: [to], action: { type: "SNS" } },
    content: Buffer.from(raw).toString("base64"),
  });
}
async function inboundCount(threadId: string) {
  return (await db.select().from(threadMessages).where(and(eq(threadMessages.threadId, threadId), eq(threadMessages.direction, "inbound")))).length;
}
async function betaRows(orgId: string) {
  return (await db.select().from(senderIdentities).where(eq(senderIdentities.organizationId, orgId))).filter((s) => s.email.startsWith("beta+"));
}
async function insertLegacy(a: Account) {
  const id = newId("senderIdentity");
  await db.insert(senderIdentities).values({
    id, organizationId: a.organizationId, email: betaSenderAddress(a.organizationId, apex()),
    displayName: "Legacy · Rootmail beta", status: "verified", verifiedAt: new Date("2026-09-01T00:00:00Z"), isDefault: true,
  });
  return id;
}

before(async () => {
  env.MAIL_PROVIDER = "ses";
  env.SES_SANDBOX_MODE = "false";
  env.INBOUND_DOMAIN = `reply.${apex()}`;
  mock.method(SESv2Client.prototype, "send", async (command: { constructor: { name: string }; input: Record<string, any> }) => {
    const name = command.constructor.name;
    awsCalls.push(name);
    if (name === "GetEmailIdentityCommand") return { VerifiedForSendingStatus: true, DkimAttributes: { Status: "SUCCESS", SigningEnabled: true } };
    if (name === "SendEmailCommand") {
      sent.push({ from: command.input.FromEmailAddress, replyTo: command.input.ReplyToAddresses });
      return { MessageId: `ses-bfr-${sent.length}-${stamp}` };
    }
    throw new Error(`Unexpected AWS operation: ${name}`);
  });
  for (const label of ["fresh", "legacy", "unmigrated"]) {
    const a = await provisionAccount({ email: `bfr-${label}-${stamp}@example.test`, passwordHash: null, betaInviteId: "local-test-invite", name: `BFR ${label}` });
    await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, a.user.id));
    accounts.push(a);
  }
  [fresh, legacy, unmigrated] = accounts;
  app = await buildServer(); await app.ready();
});

after(async () => {
  await app?.close();
  await closeQueues(); await closeRedis();
  for (const a of accounts) {
    await db.delete(organizations).where(eq(organizations.id, a.organizationId));
    await db.delete(users).where(eq(users.id, a.user.id));
  }
  await db.delete(contacts).where(inArray(contacts.email, [recipient, stranger]));
  mock.restoreAll();
  env.MAIL_PROVIDER = previous.provider; env.SES_SANDBOX_MODE = previous.sandbox; env.INBOUND_DOMAIN = previous.inbound;
  await closeDb();
});

describe("beta address on the reply subdomain", () => {
  it("issues on INBOUND_DOMAIN only when it is a subdomain of ROOTMAIL_DOMAIN", () => {
    assert.equal(betaSenderDomain(), `reply.${apex()}`);
    const saved = env.INBOUND_DOMAIN;
    try {
      env.INBOUND_DOMAIN = "reply.example.test"; // outside rootmail.io: not covered by its SES identity
      assert.equal(betaSenderDomain(), apex());
      env.INBOUND_DOMAIN = undefined;
      assert.equal(betaSenderDomain(), apex());
    } finally { env.INBOUND_DOMAIN = saved; }
  });

  it("recognises both forms as platform beta addresses, and nothing else", () => {
    assert.equal(isPlatformBetaFrom(`beta+org_a@${apex()}`), true);
    assert.equal(isPlatformBetaFrom(`BETA+org_a@REPLY.${apex()}`), true);
    assert.equal(isPlatformBetaFrom("beta+org_a@brand.example"), false);
    assert.equal(isPlatformBetaFrom(`beta+org_a@evil${apex()}`), false);
    assert.equal(isPlatformBetaFrom(`hello@reply.${apex()}`), false);
    assert.equal(betaAddressOrgId(`beta+org_a@reply.${apex()}`), "org_a");
    for (const from of [`beta+org_a@${apex()}`, `beta+org_a@reply.${apex()}`]) {
      assert.equal(resolveReplyTo({ fromEmail: from, conversationId: "thr_a", replyMode: "own_mailbox" }), `reply+thr_a@reply.${apex()}`);
      assert.equal(resolveReplyTo({ fromEmail: "x@brand.example", conversationId: "thr_a", replyMode: "inbox", explicit: from }), `reply+thr_a@reply.${apex()}`);
    }
  });

  it("activates new orgs on the subdomain and sends From it with a captured Reply-To", async () => {
    const res = await call(fresh, "POST", "/v1/senders/beta", {});
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().email, betaSenderAddress(fresh.organizationId, `reply.${apex()}`));
    const { row, wire } = await send(fresh, res.json().email, `Fresh ${stamp}`);
    assert.ok(["sent", "delivered"].includes(row.status), `${row.status}: ${row.error ?? ""}`);
    assert.equal(wire.length, 1);
    assert.ok(wire[0].from?.includes(`@reply.${apex()}`));
    assert.match(wire[0].replyTo?.[0] ?? "", new RegExp(`^reply\\+thr_[A-Za-z0-9_-]+@reply\\.${apex().replace(/\./g, "\\.")}$`));
  });

  it("refuses to let anyone add a beta-shaped address by hand, in either form", async () => {
    for (const email of [`beta+${fresh.organizationId.toLowerCase()}x@reply.${apex()}`, `beta+someone@${apex()}`]) {
      const res = await call(fresh, "POST", "/v1/senders", { email });
      assert.ok(res.statusCode >= 400 && res.statusCode < 500, `${email}: ${res.statusCode} ${res.body}`);
    }
  });

  it("moves an unmigrated apex address in place on activation, without a second row", async () => {
    const id = await insertLegacy(unmigrated);
    const res = await call(unmigrated, "POST", "/v1/senders/beta", {});
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().id, id);
    assert.equal(res.json().email, betaSenderAddress(unmigrated.organizationId, `reply.${apex()}`));
    const rows = await betaRows(unmigrated.organizationId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].isDefault, true);
    assert.equal(rows[0].verifiedAt?.toISOString(), "2026-09-01T00:00:00.000Z");
    // Activating again is a no-op.
    const again = await call(unmigrated, "POST", "/v1/senders/beta", {});
    assert.equal(again.json().id, id);
    assert.equal((await betaRows(unmigrated.organizationId)).length, 1);
  });

  let oldMessageId = "";
  let oldThreadId = "";
  let senderId = "";
  it("migration: dry run lists without changing; --apply moves rows and pending campaigns; re-run is a no-op", async () => {
    senderId = await insertLegacy(legacy);
    const oldFrom = betaSenderAddress(legacy.organizationId, apex());
    const newFrom = betaSenderAddress(legacy.organizationId, `reply.${apex()}`);
    // Before the move: a real send from the apex address opens a thread.
    const { row, wire } = await send(legacy, oldFrom, `Old thread ${stamp}`);
    assert.ok(wire[0].from?.includes(oldFrom));
    oldMessageId = row.id;
    oldThreadId = /^reply\+([^@]+)@/.exec(wire[0].replyTo![0])![1];
    const draft = newId("campaign"); const done = newId("campaign");
    for (const [id, status] of [[draft, "draft"], [done, "sent"]] as const) {
      await db.insert(campaigns).values({ id, workspaceId: legacy.production.id, name: `c ${status}`, subject: "s", fromEmail: oldFrom, status } as typeof campaigns.$inferInsert);
    }

    const out: string[] = [];
    assert.equal(await runBetaSenderMigrate([], { out: (l) => out.push(l), err: (l) => out.push(l) }), 0);
    assert.match(out.join("\n"), /^DRY RUN/);
    const dryLine = out.find((l) => l.includes(oldFrom));
    assert.ok(dryLine?.startsWith("would_migrate"), out.join("\n"));
    assert.match(dryLine!, /campaigns=1/);
    assert.equal((await betaRows(legacy.organizationId))[0].email, oldFrom, "dry run changed nothing");

    const applied = await migrateBetaSenders({ apply: true });
    const mine = applied.rows.find((r) => r.sender_id === senderId);
    assert.equal(mine?.status, "migrated");
    const rows = await betaRows(legacy.organizationId);
    assert.deepEqual(rows.map((r) => [r.id, r.email, r.isDefault]), [[senderId, newFrom, true]]);
    const [d] = await db.select().from(campaigns).where(eq(campaigns.id, draft));
    const [s] = await db.select().from(campaigns).where(eq(campaigns.id, done));
    assert.equal(d.fromEmail, newFrom, "draft campaign follows the address");
    assert.equal(s.fromEmail, oldFrom, "sent campaign history is untouched");
    const [m] = await db.select().from(messages).where(eq(messages.id, oldMessageId));
    assert.equal(m.fromEmail, oldFrom, "message history is untouched");

    const rerun = await migrateBetaSenders({ apply: true });
    assert.equal(rerun.rows.some((r) => r.organization_id === legacy.organizationId), false);
  });

  it("skips (and reports) an apex row whose target already exists", async () => {
    const orgId = fresh.organizationId; // already holds the subdomain form
    const id = newId("senderIdentity");
    await db.insert(senderIdentities).values({ id, organizationId: orgId, email: betaSenderAddress(orgId, apex()), status: "verified", verifiedAt: new Date(), isDefault: false });
    try {
      const report = await migrateBetaSenders({ apply: true });
      assert.equal(report.rows.find((r) => r.sender_id === id)?.status, "skipped_conflict");
      const [still] = await db.select().from(senderIdentities).where(eq(senderIdentities.id, id));
      assert.equal(still.email, betaSenderAddress(orgId, apex()));
    } finally { await db.delete(senderIdentities).where(eq(senderIdentities.id, id)); }
  });

  it("after migration the org can still send as the apex form (hard-coded integrations), others cannot", async () => {
    const oldFrom = betaSenderAddress(legacy.organizationId, apex());
    const { row, wire } = await send(legacy, oldFrom, `Integration ${stamp}`);
    assert.ok(["sent", "delivered"].includes(row.status), `${row.status}: ${row.error ?? ""}`);
    assert.match(wire[0].replyTo?.[0] ?? "", /^reply\+thr_/);
    const stolen = await call(fresh, "POST", "/v1/messages", { to: recipient, subject: "x", html: "<p>x</p>", from: { email: oldFrom } });
    assert.ok(stolen.statusCode >= 400 && stolen.statusCode < 500, stolen.body);
    const stolenNew = await call(fresh, "POST", "/v1/messages", { to: recipient, subject: "x", html: "<p>x</p>", from: { email: betaSenderAddress(legacy.organizationId, `reply.${apex()}`) } });
    assert.ok(stolenNew.statusCode >= 400 && stolenNew.statusCode < 500, stolenNew.body);
  });

  it("old threads keep threading: a reply to the apex address with In-Reply-To lands in its thread", async () => {
    const before = await inboundCount(oldThreadId);
    const r = await inbound(betaSenderAddress(legacy.organizationId, apex()), { subject: `Re: Old thread ${stamp}`, inReplyTo: `<${oldMessageId}@${apex()}>` });
    assert.equal(r, "received");
    assert.equal(await inboundCount(oldThreadId), before + 1);
  });

  it("hand-typed mail to the beta address (either form) joins that sender's conversation", async () => {
    for (const to of [betaSenderAddress(legacy.organizationId, `reply.${apex()}`), betaSenderAddress(legacy.organizationId, apex())]) {
      const before = await inboundCount(oldThreadId);
      assert.equal(await inbound(to, { subject: `Re: Old thread ${stamp}` }), "received", to);
      assert.equal(await inboundCount(oldThreadId), before + 1, `${to} matched the thread by subject`);
    }
  });

  it("drops mail to a beta address from someone the org never wrote to, and never crosses orgs", async () => {
    assert.equal(await inbound(betaSenderAddress(legacy.organizationId, `reply.${apex()}`), { from: stranger, subject: "Hi" }), "ignored");
    // `recipient` has threads with fresh and legacy, not with unmigrated.
    assert.equal(await inbound(betaSenderAddress(unmigrated.organizationId, `reply.${apex()}`), { subject: `Re: Fresh ${stamp}` }), "ignored");
    const freshThreads = await db.select({ id: threads.id }).from(threads).where(eq(threads.workspaceId, unmigrated.production.id));
    assert.equal(freshThreads.length, 0);
  });

  it("reply modes on the wire, both beta forms: own_mailbox still captures; an active branded reply domain wins", async () => {
    const forms = [betaSenderAddress(legacy.organizationId, `reply.${apex()}`), betaSenderAddress(legacy.organizationId, apex())];
    const brand = `reply.theirco-${stamp}.example`;
    try {
      await db.update(organizations).set({ replyMode: "own_mailbox" }).where(eq(organizations.id, legacy.organizationId));
      for (const from of forms) {
        const { wire } = await send(legacy, from, `Own mailbox ${stamp}`);
        assert.match(wire[0].replyTo?.[0] ?? "", new RegExp(`^reply\\+thr_[A-Za-z0-9_-]+@reply\\.${apex().replace(/\./g, "\\.")}$`), from);
      }
      await db.update(organizations).set({ replyMode: "inbox", replyDomain: brand, replyDomainStatus: "active" }).where(eq(organizations.id, legacy.organizationId));
      for (const from of forms) {
        const { wire } = await send(legacy, from, `Branded ${stamp}`);
        assert.ok(wire[0].from?.includes(from));
        assert.match(wire[0].replyTo?.[0] ?? "", new RegExp(`^reply\\+thr_[A-Za-z0-9_-]+@${brand.replace(/\./g, "\\.")}$`), from);
        assert.equal(await inbound(wire[0].replyTo![0], { subject: `Re: Branded ${stamp}` }), "received");
      }
      // Not live yet → the shared capture address, so no reply is lost meanwhile.
      await db.update(organizations).set({ replyDomainStatus: "pending" }).where(eq(organizations.id, legacy.organizationId));
      const { wire } = await send(legacy, forms[0], `Pending ${stamp}`);
      assert.ok(wire[0].replyTo?.[0]?.endsWith(`@reply.${apex()}`));
    } finally {
      await db.update(organizations).set({ replyMode: "inbox", replyDomain: null, replyDomainStatus: "none" }).where(eq(organizations.id, legacy.organizationId));
    }
  });

  it("never asked SES to create or delete an identity", () => {
    assert.deepEqual([...new Set(awsCalls)].sort(), ["GetEmailIdentityCommand", "SendEmailCommand"].filter((n) => awsCalls.includes(n)).sort());
    assert.equal(awsCalls.some((n) => /Create|Delete|Put/.test(n)), false);
  });
});
