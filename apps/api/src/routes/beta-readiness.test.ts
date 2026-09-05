import assert from "node:assert/strict";
import { after, before, describe, it, mock } from "node:test";
import { SESv2Client } from "@aws-sdk/client-sesv2";
import { and, eq, inArray } from "drizzle-orm";
import { closeQueues, closeRedis, env, newId, testRecipientAddress } from "@rootmail/core";
import { closeDb, contacts, db, listContacts, lists, messages, organizations, orgSendingProviders, templates, users, verifiedRecipients, unverifiedSendRecipients, orgAddons, workspaces } from "@rootmail/db";
import { provisionAccount, createSession, upsertOAuthUser } from "../lib/auth";
import { seedBetaTestKit } from "../lib/beta-test-kit";
import { betaWaitlistAudience, promoteVerifiedTesters, BETA_WAITLIST_TAG, BETA_READY_TAG } from "../lib/beta-waitlist";
import { buildServer } from "../server";
import { processSend } from "../../../worker/src/pipeline";

// Exercise actual beta flags and SES policy, but intercept every AWS operation.
// No worker runs and no network delivery or verification email can occur.
const stamp = Date.now();
const ownerEmail = `beta-${stamp}@example.test`;
const inviteEmails = [`invite-${stamp}@example.test`, `ready-${stamp}@example.test`];
const states = new Map<string, boolean>();
let verificationRequests = 0;
let verificationUnavailable = false;
let account: Awaited<ReturnType<typeof provisionAccount>>;
let app: Awaited<ReturnType<typeof buildServer>>;
let auth: { authorization: string };
let oauthOrg: string | undefined;
let oauthUser: string | undefined;
const previousProvider = env.MAIL_PROVIDER;
const previousSandbox = env.SES_SANDBOX_MODE;

before(async () => {
  env.MAIL_PROVIDER = "ses";
  env.SES_SANDBOX_MODE = "true";
  mock.method(SESv2Client.prototype, "send", async (command: { constructor: { name: string }; input: { EmailIdentity: string } }) => {
    const email = command.input.EmailIdentity;
    if (command.constructor.name === "GetEmailIdentityCommand") {
      if (verificationUnavailable) throw Object.assign(new Error("Unavailable"), { name: "ServiceUnavailableException" });
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
  await db.delete(verifiedRecipients).where(inArray(verifiedRecipients.email, inviteEmails));
  mock.restoreAll(); env.MAIL_PROVIDER = previousProvider; env.SES_SANDBOX_MODE = previousSandbox;
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
    for (const [i, email] of inviteEmails.entries()) {
      states.set(email, true);
      await db.insert(contacts).values({ id: newId("contact"), workspaceId, email, tags: i ? [BETA_WAITLIST_TAG, BETA_READY_TAG] : [BETA_WAITLIST_TAG] });
    }
    assert.equal(await promoteVerifiedTesters(), 1, "only the newly ready tester triggers an invite");
    const rows = await db.select().from(verifiedRecipients).where(and(eq(verifiedRecipients.workspaceId, workspaceId), inArray(verifiedRecipients.email, inviteEmails)));
    assert.equal(rows.length, 2);
    assert.ok(rows.every(r => r.status === "verified"));
    assert.deepEqual(await unverifiedSendRecipients(workspaceId, inviteEmails), []);
    assert.equal(await promoteVerifiedTesters(), 0, "repair must not repeat an invite");
  });

  it("uses the same AI allowance in billing and Assistant when credit packs are added", async () => {
    await db.insert(orgAddons).values({ id: newId("orgAddon"), organizationId: account.organizationId, addonId: "ai_credit_pack", quantity: 1 });
    const billing = await request("GET", "/v1/billing");
    const credits = await request("GET", "/v1/assistant/credits");
    assert.equal(credits.json().allowance, billing.json().usage.ai_credits);
    assert.ok(credits.json().allowance > 20);
  });

  it("does not impose platform SES verification on a connected provider or application sandbox", async () => {
    assert.deepEqual(await unverifiedSendRecipients(account.sandbox.id, ["any@example.test"]), []);
    await db.insert(orgSendingProviders).values({ id: newId("sendingProvider"), organizationId: account.organizationId, provider: "mailgun", status: "active", credentials: "unused-test-value" });
    assert.equal((await request("GET", "/v1/testing/recipients")).json().required, false);
    assert.deepEqual(await unverifiedSendRecipients(account.production.id, ["any@example.test"]), []);
    assert.equal((await request("POST", "/v1/testing/recipients", { email: "any@example.test" })).statusCode, 400);
  });
});
