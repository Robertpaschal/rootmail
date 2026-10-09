import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { closeQueues, closeRedis, env } from "@rootmail/core";
import { closeDb, contacts, db, openConversationForSend, organizations, users } from "@rootmail/db";
import { provisionAccount, createSession } from "../lib/auth";
import { applySesInbound } from "../lib/ses-events";
import { buildServer } from "../server";

// Replies shows the REAL sender of every inbound email. A reply through the
// conversation's reply address can come from someone other than its contact
// (a colleague, an alias, a forward); it joins that conversation, keeps its own
// From, and the thread list reports who actually replied.
const stamp = Date.now();
const contact = `ric-contact-${stamp}@client.example`;
const colleague = `ric-colleague-${stamp}@client.example`;
let account: Awaited<ReturnType<typeof provisionAccount>>;
let app: Awaited<ReturnType<typeof buildServer>>;
let auth: { authorization: string };
let threadId = "";
const previousInbound = env.INBOUND_DOMAIN;

function reply(from: string, body: string) {
  const to = `reply+${threadId}@${env.INBOUND_DOMAIN}`;
  const raw = [`From: Someone <${from}>`, `To: ${to}`, `Subject: Re: Proposal ${stamp}`, `Message-ID: <ric-${Math.random().toString(36).slice(2)}@client.example>`, "Content-Type: text/plain; charset=utf-8", "", body, ""].join("\r\n");
  return applySesInbound({ notificationType: "Received", mail: { source: from, destination: [to] }, receipt: { recipients: [to], action: { type: "SNS" } }, content: Buffer.from(raw).toString("base64") });
}

before(async () => {
  env.INBOUND_DOMAIN = "reply.example.test";
  account = await provisionAccount({ email: `ric-owner-${stamp}@example.test`, passwordHash: null, betaInviteId: "local-test-invite", name: "RIC" });
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, account.user.id));
  auth = { authorization: `Bearer ${(await createSession(account.user.id, account.production.id)).token}` };
  // The contact is known by name — the name must never be borrowed for someone else.
  await db.insert(contacts).values({ id: `con_ric_${stamp}`, workspaceId: account.production.id, email: contact, name: "Ada Client" } as typeof contacts.$inferInsert);
  const t = await openConversationForSend({ workspaceId: account.production.id, subTenantId: null, contactEmail: contact, subject: `Proposal ${stamp}`, fromEmail: `no-reply@${env.ROOTMAIL_DOMAIN}`, messageId: null, bodyText: "Here it is" } as Parameters<typeof openConversationForSend>[0]);
  threadId = t.id;
  app = await buildServer(); await app.ready();
});

after(async () => {
  await app?.close();
  await closeQueues(); await closeRedis();
  await db.delete(organizations).where(eq(organizations.id, account.organizationId));
  await db.delete(users).where(eq(users.id, account.user.id));
  await db.delete(contacts).where(inArray(contacts.email, [contact, colleague]));
  env.INBOUND_DOMAIN = previousInbound;
  await closeDb();
});

describe("Replies: the real sender of each email", () => {
  it("a reply from the contact keeps the contact's address", async () => {
    assert.equal(await reply(contact, "Looks good"), "received");
    const list = (await app.inject({ method: "GET", url: "/v1/threads", headers: auth })).json().data;
    const row = list.find((t: { id: string }) => t.id === threadId);
    assert.equal(row.contact_email, contact);
    assert.equal(row.last_reply_from, contact);
  });

  it("a reply from another address joins the same conversation and shows ITS From", async () => {
    assert.equal(await reply(colleague, "Adding my colleague's view"), "received");
    const list = (await app.inject({ method: "GET", url: "/v1/threads", headers: auth })).json().data;
    const row = list.find((t: { id: string }) => t.id === threadId);
    assert.equal(row.contact_email, contact, "the conversation is still filed under the contact");
    assert.equal(row.last_reply_from, colleague, "the list names who actually replied");

    const detail = (await app.inject({ method: "GET", url: `/v1/threads/${threadId}`, headers: auth })).json();
    const inbound = detail.messages.filter((m: { direction: string }) => m.direction === "inbound");
    assert.deepEqual(inbound.map((m: { from: string }) => m.from), [contact, colleague]);
    for (const m of inbound) {
      assert.equal(m.from_name, null, "inbound never carries a borrowed or outbound name");
      assert.notEqual(String(m.from).toLowerCase(), "you");
    }
    assert.equal(detail.last_reply_from, colleague);
  });
});
