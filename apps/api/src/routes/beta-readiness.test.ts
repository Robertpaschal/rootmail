import assert from "node:assert/strict";
import { after, before, describe, it, mock } from "node:test";
import { SESv2Client } from "@aws-sdk/client-sesv2";
import { and, eq, inArray, like } from "drizzle-orm";
import { betaSenderAddress, closeQueues, closeRedis, env, isPublicMailboxSender, newId, testRecipientAddress } from "@rootmail/core";
import { betaInvites, closeDb, contacts, db, ensureBetaInviteAutomation, listContacts, lists, messages, organizations, orgSendingProviders, sequenceEnrollments, sequences, templates, users, verifiedRecipients, unverifiedSendRecipients, orgAddons, workspaces } from "@rootmail/db";
import { provisionAccount, createSession, upsertOAuthUser } from "../lib/auth";
import { seedBetaTestKit } from "../lib/beta-test-kit";
import { betaWaitlistAudience, promoteVerifiedTesters, BetaInviteAutomationError, BETA_WAITLIST_TAG, BETA_READY_TAG } from "../lib/beta-waitlist";
import { buildServer } from "../server";
import { processSend } from "../../../worker/src/pipeline";
import { appendInbound, appendOutbound, openConversationForSend, resolveReplyTo, senderIdentities, threadMessages, threads } from "@rootmail/db";
import { assertSenderAllowed } from "../lib/senders";

// Exercise actual beta flags and SES policy, but intercept every AWS operation.
// No worker runs and no network delivery or verification email can occur.
const stamp = Date.now();
const ownerEmail = `beta-${stamp}@example.test`;
const inviteEmails = [`invite-${stamp}@example.test`, `ready-${stamp}@example.test`, `held-${stamp}@example.test`, `late-${stamp}@example.test`, `prompt-${stamp}@example.test`, `seatless-${stamp}@example.test`];
const states = new Map<string, boolean>();
let verificationRequests = 0;
let verificationUnavailable = false;
let dkimReady = true;
let account: Awaited<ReturnType<typeof provisionAccount>>;
let app: Awaited<ReturnType<typeof buildServer>>;
let auth: { authorization: string };
let oauthOrg: string | undefined;
let oauthUser: string | undefined;
const previousProvider = env.MAIL_PROVIDER;
const previousSandbox = env.SES_SANDBOX_MODE;
const previousInbound = env.INBOUND_DOMAIN;
const previousDns = env.DNS_VERIFY_MODE;
const previousAutoAdmit = env.BETA_AUTO_ADMIT_LIMIT;

before(async () => {
  env.MAIL_PROVIDER = "ses";
  env.SES_SANDBOX_MODE = "true";
  env.INBOUND_DOMAIN = "reply.example.test";
  // Seats are counted across the whole (shared) test database; never run out.
  env.BETA_AUTO_ADMIT_LIMIT = 1_000_000;
  mock.method(SESv2Client.prototype, "send", async (command: { constructor: { name: string }; input: { EmailIdentity: string } }) => {
    const email = command.input.EmailIdentity;
    if (command.constructor.name === "GetEmailIdentityCommand") {
      if (verificationUnavailable) throw Object.assign(new Error("Unavailable"), { name: "ServiceUnavailableException" });
      if (email === env.ROOTMAIL_DOMAIN) return { VerifiedForSendingStatus: true, DkimAttributes: { Status: "SUCCESS", SigningEnabled: dkimReady } };
      if (!states.has(email)) throw Object.assign(new Error("Not found"), { name: "NotFoundException" });
      return { VerifiedForSendingStatus: states.get(email) };
    }
    if (command.constructor.name === "CreateEmailIdentityCommand") {
      verificationRequests++;
      states.set(email, false);
      return {};
    }
    throw new Error(`Unexpected AWS operation: ${command.constructor.name}`);
  });
  account = await provisionAccount({ email: ownerEmail, passwordHash: null, betaInviteId: "local-test-invite", name: "Beta fixture" });
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, account.user.id));
  auth = { authorization: `Bearer ${(await createSession(account.user.id, account.production.id)).token}` };
  app = await buildServer(); await app.ready();
});

after(async () => {
  await app?.close();
  await closeQueues(); await closeRedis();
  if (account) { await db.delete(organizations).where(eq(organizations.id, account.organizationId)); await db.delete(users).where(eq(users.id, account.user.id)); }
  if (oauthOrg) await db.delete(organizations).where(eq(organizations.id, oauthOrg));
  if (oauthUser) await db.delete(users).where(eq(users.id, oauthUser));
  await db.delete(contacts).where(inArray(contacts.email, [ownerEmail, `oauth-beta-${stamp}@example.test`, ...inviteEmails]));
  await db.delete(verifiedRecipients).where(inArray(verifiedRecipients.email, [ownerEmail, ...inviteEmails]));
  await db.delete(sequenceEnrollments).where(inArray(sequenceEnrollments.email, inviteEmails));
  for (const email of inviteEmails) await db.delete(betaInvites).where(like(betaInvites.label, `%${email}`));
  mock.restoreAll(); env.MAIL_PROVIDER = previousProvider; env.SES_SANDBOX_MODE = previousSandbox;
  env.INBOUND_DOMAIN = previousInbound; env.DNS_VERIFY_MODE = previousDns; env.BETA_AUTO_ADMIT_LIMIT = previousAutoAdmit;
  await closeDb();
});

const request = (method: "GET" | "POST" | "DELETE", url: string, payload?: Record<string, unknown>) => app.inject({ method, url, headers: auth, payload });
const send = (to: string) => request("POST", "/v1/messages", { to, subject: "Beta rehearsal", html: "<p>Rehearsal</p>" });

describe("closed beta — a verified inbox, a reusable audience and honest sending gates", () => {
  it("seeds recognised scenarios and registers the owner without claiming SES verification", async () => {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, account.organizationId));
    assert.equal(org.isBeta, true);
    const [inbox] = await db.select().from(verifiedRecipients).where(eq(verifiedRecipients.workspaceId, account.production.id));
    assert.equal(inbox.email, ownerEmail); assert.equal(inbox.status, "pending");
    assert.equal(verificationRequests, 0, "provisioning must not email anybody");
    const rows = await db.select().from(contacts).where(eq(contacts.workspaceId, account.production.id));
    assert.deepEqual(rows.map(c => c.email).sort(), [ownerEmail, ...["delivered", "bounced", "complained"].map(testRecipientAddress)].sort());
    assert.equal((await send(ownerEmail)).statusCode, 400);
    const scenario = await send(testRecipientAddress("delivered"));
    assert.equal(scenario.statusCode, 202, scenario.body);
  });

  it("requests confirmation once, refreshes from SES and then permits the inbox", async () => {
    const pending = await request("POST", "/v1/testing/recipients", { email: ownerEmail });
    assert.equal(pending.statusCode, 200, pending.body);
    assert.equal(pending.json().status, "pending");
    await request("POST", "/v1/testing/recipients", { email: ownerEmail });
    assert.equal(verificationRequests, 1);
    states.set(ownerEmail, true);
    const ready = await request("GET", "/v1/testing/recipients");
    assert.equal(ready.json().required, true);
    assert.equal(ready.json().data[0].status, "verified");
    const sent = await send(ownerEmail);
    assert.equal(sent.statusCode, 202, sent.body);
  });

  it("distinguishes an unavailable provider from an unconfirmed inbox", async () => {
    await db.insert(verifiedRecipients).values({ id: newId("verifiedRecipient"), workspaceId: account.production.id, email: "pending-service@example.test", status: "pending" });
    verificationUnavailable = true;
    try {
      const result = (await request("GET", "/v1/testing/recipients")).json();
      assert.equal(result.verification_unavailable, true);
      assert.equal(result.data.find((r: { email: string }) => r.email === "pending-service@example.test").status, "pending");
    } finally { verificationUnavailable = false; }
  });

  it("does not accept a verification recorded in a different workspace", async () => {
    await db.insert(verifiedRecipients).values({ id: newId("verifiedRecipient"), workspaceId: account.sandbox.id, email: "sibling@example.test", status: "verified" });
    const blocked = await send("sibling@example.test");
    assert.equal(blocked.statusCode, 400);
    assert.match(blocked.body, /Test inboxes/);
  });

  it("rejects a whole campaign before changing its draft when one inbox is unconfirmed", async () => {
    const [audience] = await db.select().from(lists).where(eq(lists.workspaceId, account.production.id));
    const [template] = await db.select().from(templates).where(eq(templates.workspaceId, account.production.id));
    const extra = newId("contact");
    await db.insert(contacts).values({ id: extra, workspaceId: account.production.id, email: "unconfirmed@example.test" });
    await db.insert(listContacts).values({ id: newId("listContact"), listId: audience.id, contactId: extra });
    const created = await request("POST", "/v1/campaigns", { name: "Rehearsal", list_id: audience.id, template_id: template.id });
    assert.equal(created.statusCode, 201, created.body);
    const refused = await request("POST", `/v1/campaigns/${created.json().id}/send`, {});
    assert.equal(refused.statusCode, 400, refused.body);
    assert.match(refused.body, /unconfirmed@example.test/);
    assert.equal((await request("GET", `/v1/campaigns/${created.json().id}`)).json().status, "draft");
  });

  it("rechecks queued mail when an inbox has been removed", async () => {
    const queued = await send(ownerEmail);
    assert.equal(queued.statusCode, 202, queued.body);
    const [inbox] = await db.select().from(verifiedRecipients).where(and(eq(verifiedRecipients.workspaceId, account.production.id), eq(verifiedRecipients.email, ownerEmail)));
    assert.equal((await request("DELETE", `/v1/testing/recipients/${inbox.id}`)).statusCode, 200);
    await processSend({ messageId: queued.json().id, workspaceId: account.production.id });
    const [record] = await db.select().from(messages).where(eq(messages.id, queued.json().id));
    assert.equal(record.status, "failed"); assert.equal(record.providerMessageId, null);
    assert.match(record.error ?? "", /Test inboxes/);
  });

  it("repairs an older starter audience without deleting contact history or opting someone back in", async () => {
    const [audience] = await db.select().from(lists).where(eq(lists.workspaceId, account.production.id));
    const legacy = newId("contact");
    await db.insert(contacts).values({ id: legacy, workspaceId: account.production.id, email: "bounce@simulator.amazonses.com" });
    await db.insert(listContacts).values({ id: newId("listContact"), listId: audience.id, contactId: legacy });
    await db.update(contacts).set({ status: "unsubscribed" }).where(and(eq(contacts.workspaceId, account.production.id), eq(contacts.email, ownerEmail)));
    const a = await seedBetaTestKit(account.production.id, ownerEmail);
    const b = await seedBetaTestKit(account.production.id, ownerEmail);
    assert.equal(a.listId, b.listId); assert.equal(b.added, 0);
    assert.equal((await db.select().from(listContacts).where(and(eq(listContacts.listId, a.listId), eq(listContacts.contactId, legacy)))).length, 0);
    assert.equal((await db.select().from(contacts).where(eq(contacts.id, legacy))).length, 1);
    assert.equal((await db.select().from(contacts).where(and(eq(contacts.workspaceId, account.production.id), eq(contacts.email, ownerEmail))))[0].status, "unsubscribed");
  });

  it("gives OAuth beta accounts the same test audience", async () => {
    const result = await upsertOAuthUser({ email: `oauth-beta-${stamp}@example.test`, betaInviteId: "local-test-invite", emailVerified: true });
    oauthUser = result.user.id;
    const [org] = await db.select().from(organizations).where(eq(organizations.name, `oauth-beta-${stamp}`));
    oauthOrg = org.id;
    const rows = await db.select().from(contacts).innerJoin(workspaces, eq(contacts.workspaceId, workspaces.id))
      .where(and(eq(contacts.email, result.user.email), eq(workspaces.organizationId, oauthOrg)));
    assert.equal(rows.length, 1);
  });

  it("records observed confirmation for beta invites and repairs previously ready testers", async () => {
    const { workspaceId } = await betaWaitlistAudience();
    for (const [i, email] of inviteEmails.slice(0, 2).entries()) {
      states.set(email, true);
      await db.insert(contacts).values({ id: newId("contact"), workspaceId, email, tags: i ? [BETA_WAITLIST_TAG, BETA_READY_TAG] : [BETA_WAITLIST_TAG] });
    }
    assert.equal(await promoteVerifiedTesters(), 1, "only the newly ready tester triggers an invite");
    const rows = await db.select().from(verifiedRecipients).where(and(eq(verifiedRecipients.workspaceId, workspaceId), inArray(verifiedRecipients.email, inviteEmails)));
    assert.equal(rows.length, 2);
    assert.ok(rows.every(r => r.status === "verified"));
    assert.deepEqual(await unverifiedSendRecipients(workspaceId, inviteEmails.slice(0, 2)), []);
    assert.equal(await promoteVerifiedTesters(), 0, "repair must not repeat an invite");
    const enrolled = await db.select().from(sequenceEnrollments).where(inArray(sequenceEnrollments.email, inviteEmails));
    assert.deepEqual(enrolled.map(e => e.email), [inviteEmails[0]], "the sweep ensured the invite sequence and enrolled only the new tester");
  });

  it("holds a verified tester while the invite sequence cannot send, then invites them once it can", async () => {
    const { workspaceId } = await betaWaitlistAudience();
    const automation = await ensureBetaInviteAutomation({ workspaceId });
    const email = inviteEmails[2];
    states.set(email, true);
    const id = newId("contact");
    await db.insert(contacts).values({ id, workspaceId, email, tags: [BETA_WAITLIST_TAG] });
    await db.update(sequences).set({ status: "paused" }).where(eq(sequences.id, automation.sequenceId!));
    try {
      await assert.rejects(promoteVerifiedTesters(), (err: unknown) => err instanceof BetaInviteAutomationError && err.held === 1 && /sequence_paused/.test(err.message));
      const [held] = await db.select().from(contacts).where(eq(contacts.id, id));
      assert.ok(!held.tags.includes(BETA_READY_TAG), "the one-shot trigger tag must not be spent while nothing can fire");
    } finally {
      await db.update(sequences).set({ status: "active" }).where(eq(sequences.id, automation.sequenceId!));
    }
    assert.equal(await promoteVerifiedTesters(), 1);
    assert.equal((await db.select().from(sequenceEnrollments).where(eq(sequenceEnrollments.email, email))).length, 1);
  });

  it("mints the invite code when a tester verifies, so a late verifier never gets a dead code", async () => {
    const { workspaceId } = await betaWaitlistAudience();
    const day = 86_400_000;
    const [late, prompt] = [inviteEmails[3], inviteEmails[4]];
    // `late` signed up before this fix and was handed a code that has since lapsed;
    // `prompt` holds one that is still live.
    await db.insert(betaInvites).values([
      { id: newId("betaInvite"), code: `beta-L${stamp}`, label: `auto: ${late}`, maxUses: 1, expiresAt: new Date(Date.now() - day) },
      { id: newId("betaInvite"), code: `beta-P${stamp}`, label: `auto: ${prompt}`, maxUses: 1, expiresAt: new Date(Date.now() + day) },
    ]);
    for (const [email, code] of [[late, `beta-L${stamp}`], [prompt, `beta-P${stamp}`]]) {
      states.set(email, true);
      await db.insert(contacts).values({ id: newId("contact"), workspaceId, email, tags: [BETA_WAITLIST_TAG], metadata: { beta_invite_code: code } });
    }
    assert.equal(await promoteVerifiedTesters(), 2);
    const codeOf = async (email: string) => {
      const [c] = await db.select().from(contacts).where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.email, email)));
      const code = (c.metadata as Record<string, string>).beta_invite_code;
      const [invite] = await db.select().from(betaInvites).where(eq(betaInvites.code, code));
      return { code, invite, tags: c.tags };
    };
    const a = await codeOf(late);
    assert.notEqual(a.code, `beta-L${stamp}`, "a lapsed code is replaced, not revived past the seat cap");
    assert.ok(a.invite.expiresAt!.getTime() > Date.now() + 6 * day);
    const b = await codeOf(prompt);
    assert.equal(b.code, `beta-P${stamp}`, "a live code they may already have seen keeps working");
    assert.ok(b.invite.expiresAt!.getTime() > Date.now() + 6 * day, "and gets a full window from verification");
  });

  it("never runs two sweeps at once, so an overlapping pass cannot mint a second code", async () => {
    const { workspaceId } = await betaWaitlistAudience();
    const email = `overlap-${stamp}@example.test`;
    states.set(email, true);
    await db.insert(contacts).values({ id: newId("contact"), workspaceId, email, tags: [BETA_WAITLIST_TAG] });
    try {
      const results = await Promise.all([promoteVerifiedTesters(), promoteVerifiedTesters(), promoteVerifiedTesters()]);
      assert.equal(results.reduce((a, b) => a + b, 0), 1);
      assert.equal((await db.select().from(betaInvites).where(like(betaInvites.label, `%${email}`))).length, 1);
    } finally {
      await db.delete(sequenceEnrollments).where(eq(sequenceEnrollments.email, email));
      await db.delete(betaInvites).where(like(betaInvites.label, `%${email}`));
      await db.delete(verifiedRecipients).where(eq(verifiedRecipients.email, email));
      await db.delete(contacts).where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.email, email)));
    }
  });

  it("holds a verified tester when no seat is free, and never spends a seat on an existing account", async () => {
    const { workspaceId } = await betaWaitlistAudience();
    const seatless = inviteEmails[5];
    states.set(seatless, true);
    await db.insert(contacts).values([
      { id: newId("contact"), workspaceId, email: seatless, tags: [BETA_WAITLIST_TAG] },
      { id: newId("contact"), workspaceId, email: ownerEmail, tags: [BETA_WAITLIST_TAG] },
    ]);
    env.BETA_AUTO_ADMIT_LIMIT = 0;
    try {
      assert.equal(await promoteVerifiedTesters(), 0);
      const [c] = await db.select().from(contacts).where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.email, seatless)));
      assert.ok(!c.tags.includes(BETA_READY_TAG), "no seat, no trigger — not an invite with an empty code");
    } finally { env.BETA_AUTO_ADMIT_LIMIT = 1_000_000; }
    assert.equal(await promoteVerifiedTesters(), 1, "the seat frees up and only the stranger is invited");
    const [owner] = await db.select().from(contacts).where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.email, ownerEmail)));
    assert.ok(!owner.tags.includes(BETA_READY_TAG));
    assert.equal((await db.select().from(betaInvites).where(like(betaInvites.label, `%${ownerEmail}`))).length, 0);
  });

  it("uses the same AI allowance in billing and Assistant when credit packs are added", async () => {
    await db.insert(orgAddons).values({ id: newId("orgAddon"), organizationId: account.organizationId, addonId: "ai_credit_pack", quantity: 1 });
    const billing = await request("GET", "/v1/billing");
    const credits = await request("GET", "/v1/assistant/credits");
    assert.equal(credits.json().allowance, billing.json().usage.ai_credits);
    assert.ok(credits.json().allowance > 20);
  });

  it("records one outbound entry across simultaneous API/worker observations and retries", async () => {
    const queued = await send(testRecipientAddress("delivered"));
    assert.equal(queued.statusCode, 202, queued.body);
    const [m] = await db.select().from(messages).where(eq(messages.id, queued.json().id));
    const input = { workspaceId: m.workspaceId, subTenantId: m.subTenantId, contactEmail: m.toEmail, subject: m.subject, fromEmail: m.fromEmail, messageId: m.id };
    const results = await Promise.all(Array.from({ length: 6 }, () => openConversationForSend(input)));
    assert.equal(new Set(results.map(t => t.id)).size, 1);
    assert.equal((await db.select().from(threadMessages).where(eq(threadMessages.messageId, m.id))).length, 1);
    await appendInbound(results[0], { fromEmail: m.toEmail, toEmail: m.fromEmail, bodyText: "A real reply" });
    await openConversationForSend(input);
    const [thread] = await db.select().from(threads).where(eq(threads.id, results[0].id));
    assert.equal(thread.status, "needs_reply", "a worker retry must not clear a later reply");
    await appendOutbound(thread, { fromEmail: m.fromEmail, toEmail: m.toEmail, messageId: m.id });
    assert.equal((await db.select().from(threadMessages).where(eq(threadMessages.messageId, m.id))).length, 1);
  });

  it("collapses historical duplicates on read without removing history or inbound replies", async () => {
    const queued = await send(testRecipientAddress("delivered"));
    const [entry] = await db.select().from(threadMessages).where(eq(threadMessages.messageId, queued.json().id));
    await db.insert(threadMessages).values({ ...entry, id: newId("threadMessage") });
    const result = await request("GET", `/v1/threads/${entry.threadId}`);
    assert.equal(result.statusCode, 200, result.body);
    assert.equal(result.json().messages.filter((m: { message_id: string }) => m.message_id === entry.messageId).length, 1);
    assert.ok(result.json().messages.some((m: { direction: string }) => m.direction === "inbound"));
    assert.equal((await db.select().from(threadMessages).where(eq(threadMessages.messageId, entry.messageId!))).length, 2);
  });

  it("clears Needs reply once when a fast worker has already recorded our genuine reply", async () => {
    const queued = await send(testRecipientAddress("delivered"));
    const [entry] = await db.select().from(threadMessages).where(eq(threadMessages.messageId, queued.json().id));
    const [thread] = await db.select().from(threads).where(eq(threads.id, entry.threadId));
    await appendOutbound(thread, { fromEmail: entry.fromEmail, toEmail: entry.toEmail, messageId: entry.messageId });
    const [updated] = await db.select().from(threads).where(eq(threads.id, thread.id));
    assert.equal(updated.status, "open");
    assert.equal((await db.select().from(threadMessages).where(eq(threadMessages.messageId, entry.messageId!))).length, 1);
  });

  it("restricts beta activation to eligible live accounts with working reply configuration", async () => {
    const sandboxAuth = { authorization: `Bearer ${(await createSession(account.user.id, account.sandbox.id)).token}` };
    assert.equal((await app.inject({ method: "POST", url: "/v1/senders/beta", headers: sandboxAuth, payload: {} })).statusCode, 403);
    await db.update(organizations).set({ isBeta: false }).where(eq(organizations.id, account.organizationId));
    try { assert.equal((await request("POST", "/v1/senders/beta", {})).statusCode, 403); }
    finally { await db.update(organizations).set({ isBeta: true }).where(eq(organizations.id, account.organizationId)); }
    env.INBOUND_DOMAIN = "not-a-hostname";
    try { assert.equal((await request("POST", "/v1/senders/beta", {})).statusCode, 422); }
    finally { env.INBOUND_DOMAIN = "reply.example.test"; }
  });

  it("refuses beta activation before DKIM is signing and preserves existing senders", async () => {
    env.DNS_VERIFY_MODE = "live"; dkimReady = false;
    try {
      const result = await request("POST", "/v1/senders/beta", {});
      assert.equal(result.statusCode, 422, result.body);
      assert.match(result.body, /not ready/);
      assert.equal((await db.select().from(senderIdentities).where(eq(senderIdentities.organizationId, account.organizationId))).length, 0);
    } finally { dkimReady = true; }
  });

  it("activates one org-owned authenticated beta default without a mailbox verification email", async () => {
    const count = verificationRequests;
    const [first, second] = await Promise.all([request("POST", "/v1/senders/beta", {}), request("POST", "/v1/senders/beta", {})]);
    assert.equal(first.statusCode, 200, first.body); assert.equal(second.statusCode, 200, second.body);
    assert.equal(first.json().id, second.json().id);
    assert.equal(first.json().email, betaSenderAddress(account.organizationId, env.ROOTMAIL_DOMAIN));
    assert.equal(first.json().is_default, true); assert.equal(first.json().status, "verified");
    assert.equal(verificationRequests, count);
    assert.equal((await db.select().from(senderIdentities).where(eq(senderIdentities.organizationId, account.organizationId))).length, 1);
    await assertSenderAllowed({ organizationId: account.organizationId, fromEmail: first.json().email });
    await assert.rejects(assertSenderAllowed({ organizationId: oauthOrg!, fromEmail: first.json().email }));
    assert.equal((await request("POST", "/v1/senders", { email: betaSenderAddress("org_someone_else", env.ROOTMAIL_DOMAIN) })).statusCode, 422);
    const denied = await request("POST", "/v1/messages", { to: testRecipientAddress("delivered"), subject: "No impersonation", html: "<p>test</p>", from: { email: betaSenderAddress("org_someone_else", env.ROOTMAIL_DOMAIN) } });
    assert.equal(denied.statusCode, 422, denied.body);
  });

  it("keeps managed replies captured and warns about personal mailbox senders", () => {
    const managed = betaSenderAddress(account.organizationId, env.ROOTMAIL_DOMAIN);
    assert.equal(resolveReplyTo({ fromEmail: managed, conversationId: "thr_beta", replyMode: "own_mailbox" }), "reply+thr_beta@reply.example.test");
    assert.equal(resolveReplyTo({ fromEmail: managed, conversationId: "thr_beta", replyMode: "inbox", explicit: "support@example.test" }), "support@example.test");
    for (const email of ["Person@GMAIL.COM", "person@outlook.com", "person@yahoo.co.uk"]) assert.equal(isPublicMailboxSender(email), true);
    assert.equal(isPublicMailboxSender(managed), false);
    assert.equal(isPublicMailboxSender("hello@brand.example"), false);
  });

  it("does not impose platform SES verification on a connected provider or application sandbox", async () => {
    assert.deepEqual(await unverifiedSendRecipients(account.sandbox.id, ["any@example.test"]), []);
    await db.insert(orgSendingProviders).values({ id: newId("sendingProvider"), organizationId: account.organizationId, provider: "mailgun", status: "active", credentials: "unused-test-value" });
    assert.equal((await request("GET", "/v1/testing/recipients")).json().required, false);
    assert.deepEqual(await unverifiedSendRecipients(account.production.id, ["any@example.test"]), []);
    assert.equal((await request("POST", "/v1/testing/recipients", { email: "any@example.test" })).statusCode, 400);
    assert.equal((await request("POST", "/v1/senders/beta", {})).statusCode, 403);
  });
});
