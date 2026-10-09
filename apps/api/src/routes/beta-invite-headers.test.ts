import assert from "node:assert/strict";
import { after, before, describe, it, mock } from "node:test";
import { SESv2Client } from "@aws-sdk/client-sesv2";
import { eq, inArray } from "drizzle-orm";
import { closeQueues, closeRedis, env, newId } from "@rootmail/core";
import { closeDb, contacts, db, ensureBetaInviteAutomation, ensureInternalAccount, messages, organizations, sequenceEnrollments, sequences, templates, users } from "@rootmail/db";
import { provisionAccount } from "../lib/auth";
import { processSend } from "../../../worker/src/pipeline";
import { processSequenceTick } from "../../../worker/src/sequences";

// The beta invite is a code someone asked for. It used to go out through the
// sequence runner as MARKETING: bulk List-Unsubscribe headers, an unsubscribe +
// postal footer and a "Sent with rootmail" ad, which is how Gmail files mail
// under Promotions. Every AWS call is intercepted; nothing is sent.
const stamp = Date.now();
const invitee = `invitee-${stamp}@example.test`;
const customerRecipient = `drip-${stamp}@example.test`;
const sent: { to: string; headers: string[]; html: string; text: string }[] = [];
const enrollmentIds: string[] = [];
let customer: Awaited<ReturnType<typeof provisionAccount>> | undefined;
const previous = { provider: env.MAIL_PROVIDER, sandbox: env.SES_SANDBOX_MODE };

before(() => {
  env.MAIL_PROVIDER = "ses";
  env.SES_SANDBOX_MODE = "false";
  mock.method(SESv2Client.prototype, "send", async (command: { constructor: { name: string }; input: Record<string, any> }) => {
    if (command.constructor.name !== "SendEmailCommand") throw new Error(`Unexpected AWS operation: ${command.constructor.name}`);
    const simple = command.input.Content?.Simple;
    sent.push({
      to: command.input.Destination?.ToAddresses?.[0],
      headers: (simple?.Headers ?? []).map((h: { Name: string }) => h.Name.toLowerCase()),
      html: simple?.Body?.Html?.Data ?? "",
      text: simple?.Body?.Text?.Data ?? "",
    });
    return { MessageId: `ses-${sent.length}-${stamp}` };
  });
});

after(async () => {
  await db.delete(sequenceEnrollments).where(inArray(sequenceEnrollments.id, enrollmentIds));
  await db.delete(contacts).where(inArray(contacts.email, [invitee, customerRecipient]));
  if (customer) {
    await db.delete(organizations).where(eq(organizations.id, customer.organizationId));
    await db.delete(users).where(eq(users.id, customer.user.id));
  }
  await closeQueues(); await closeRedis();
  mock.restoreAll(); env.MAIL_PROVIDER = previous.provider; env.SES_SANDBOX_MODE = previous.sandbox;
  await closeDb();
});

async function enrollAndRun(workspaceId: string, sequenceId: string, email: string, metadata: Record<string, unknown> = {}) {
  const contactId = newId("contact");
  await db.insert(contacts).values({ id: contactId, workspaceId, email, metadata });
  const id = newId("sequenceEnrollment");
  enrollmentIds.push(id);
  await db.insert(sequenceEnrollments).values({ id, sequenceId, workspaceId, contactId, email, nextRunAt: new Date(Date.now() - 1000) });
  await processSequenceTick();
  const [enr] = await db.select().from(sequenceEnrollments).where(eq(sequenceEnrollments.id, id));
  assert.ok(enr.lastMessageId, `enrollment ${enr.status}`);
  const before = sent.length;
  await processSend({ messageId: enr.lastMessageId } as Parameters<typeof processSend>[0]);
  const [message] = await db.select().from(messages).where(eq(messages.id, enr.lastMessageId!));
  const out = sent.slice(before).find((s) => s.to === email);
  assert.ok(out, `${message.status}: ${message.error ?? ""}`);
  return { message, out };
}

describe("the beta invite reads as a personal note, not a bulk send", () => {
  it("goes out as transactional: no List-Unsubscribe, no unsubscribe/postal footer, no 'Sent with rootmail'", async () => {
    const { workspaceId } = await ensureInternalAccount();
    const automation = await ensureBetaInviteAutomation({ workspaceId });
    assert.ok(automation.sequenceId, JSON.stringify(automation));
    const { message, out } = await enrollAndRun(workspaceId, automation.sequenceId!, invitee, { beta_invite_code: "RM-TEST-CODE" });
    assert.equal(message.type, "transactional");
    assert.match(out.html, /RM-TEST-CODE/);
    assert.ok(!out.headers.includes("list-unsubscribe"), out.headers.join(","));
    assert.ok(!out.headers.includes("list-unsubscribe-post"));
    assert.doesNotMatch(out.html, /Unsubscribe/i);
    assert.doesNotMatch(out.html, /Sent with/i);
    assert.doesNotMatch(out.text, /Unsubscribe|Sent with rootmail/i);
  });

  it("leaves customer drips exactly as they were: marketing, with unsubscribe headers and footer", async () => {
    customer = await provisionAccount({ email: `drip-owner-${stamp}@example.test`, passwordHash: null, name: "Drip fixture" });
    await db.update(organizations).set({ postalAddress: "1 Test Street, Lagos" }).where(eq(organizations.id, customer.organizationId));
    const ws = customer.production.id;
    const templateId = newId("template");
    // A template left on the default type, as most customer templates are.
    await db.insert(templates).values({ id: templateId, workspaceId: ws, subTenantId: null, name: "Drip", slug: `drip-${stamp}`, subject: "Hello", html: "<p>Hello</p>", text: "Hello" });
    const sequenceId = newId("sequence");
    await db.insert(sequences).values({ id: sequenceId, workspaceId: ws, subTenantId: null, name: "Drip", status: "active", trigger: { type: "manual" }, steps: [{ type: "send", template: templateId }], exitOn: ["unsubscribed"] } as typeof sequences.$inferInsert);
    const { message, out } = await enrollAndRun(ws, sequenceId, customerRecipient);
    assert.equal(message.type, "marketing");
    assert.ok(out.headers.includes("list-unsubscribe"));
    assert.match(out.html, /Unsubscribe/);
  });
});
