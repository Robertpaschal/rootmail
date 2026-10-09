import assert from "node:assert/strict";
import { after, before, describe, it, mock } from "node:test";
import { SESv2Client } from "@aws-sdk/client-sesv2";
import { eq } from "drizzle-orm";
import { closeQueues, closeRedis, env, getSystemMailQueue, newId, platformReplyTo, type SystemMailJob } from "@rootmail/core";
import { closeDb, db, staffUsers, supportTickets } from "@rootmail/db";
import { createStaffSession } from "../lib/admin-auth";
import { buildServer } from "../server";
import { processSystemMail } from "../../../worker/src/system-mail";
import { winBackJob } from "../../../worker/src/lifecycle";

// Platform Reply-To. PLATFORM_REPLY_TO (default admin@<ROOTMAIL_DOMAIN>) is
// only named in the beta daily-cap text. A support ticket reply, the win-back
// and the beta invite (beta-readiness.test.ts) set no Reply-To, so — as before
// #26 — replies go to the capture address (reply+thr_…@INBOUND_DOMAIN) and
// land in the Replies inbox.
// All AWS calls are intercepted.
const stamp = Date.now();
const human = `admin@${env.ROOTMAIL_DOMAIN}`;
const replyTos: Record<string, string[] | undefined> = {};
const previous = { provider: env.MAIL_PROVIDER, sandbox: env.SES_SANDBOX_MODE, inbound: env.INBOUND_DOMAIN, replyTo: env.PLATFORM_REPLY_TO };
let app: Awaited<ReturnType<typeof buildServer>>;
const staffId = newId("staffUser");
const ticketId = newId("supportTicket");

async function queuedFor(to: string): Promise<SystemMailJob | undefined> {
  const jobs = await getSystemMailQueue().getJobs(["waiting", "delayed", "prioritized", "active", "completed"]);
  return jobs.map((j) => j?.data).find((d) => d?.to === to);
}

before(async () => {
  env.MAIL_PROVIDER = "ses";
  env.SES_SANDBOX_MODE = "false";
  env.INBOUND_DOMAIN = "reply.example.test";
  env.PLATFORM_REPLY_TO = undefined;
  mock.method(SESv2Client.prototype, "send", async (command: { constructor: { name: string }; input: Record<string, any> }) => {
    if (command.constructor.name !== "SendEmailCommand") throw new Error(`Unexpected AWS operation: ${command.constructor.name}`);
    replyTos[command.input.Destination?.ToAddresses?.[0]] = command.input.ReplyToAddresses;
    return { MessageId: `ses-${stamp}-${Object.keys(replyTos).length}` };
  });
  app = await buildServer(); await app.ready();
});

after(async () => {
  await app?.close();
  await db.delete(supportTickets).where(eq(supportTickets.id, ticketId));
  await db.delete(staffUsers).where(eq(staffUsers.id, staffId));
  await closeQueues(); await closeRedis();
  mock.restoreAll();
  env.MAIL_PROVIDER = previous.provider; env.SES_SANDBOX_MODE = previous.sandbox; env.INBOUND_DOMAIN = previous.inbound; env.PLATFORM_REPLY_TO = previous.replyTo;
  await closeDb();
});

describe("platform mail Reply-To", () => {
  it("defaults to admin@<ROOTMAIL_DOMAIN> and follows PLATFORM_REPLY_TO when set", () => {
    assert.equal(platformReplyTo(), human);
    env.PLATFORM_REPLY_TO = "Ops@Example.test";
    try {
      assert.equal(platformReplyTo(), "ops@example.test");
    } finally { env.PLATFORM_REPLY_TO = undefined; }
  });

  it("the worker puts a job's Reply-To on the wire, over the capture address", async () => {
    const to = `sys-human-${stamp}@example.test`;
    await processSystemMail({ to, subject: "Hi", html: "<p>Just reply.</p>", text: "Just reply.", cls: "transactional", replyTo: human });
    assert.deepEqual(replyTos[to], [human]);
  });

  it("mail without one keeps today's behaviour: the capture address", async () => {
    const to = `sys-default-${stamp}@example.test`;
    await processSystemMail({ to, subject: "Hi", html: "<p>Hi</p>", text: "Hi", cls: "transactional" });
    assert.match(replyTos[to]?.[0] ?? "", /^reply\+thr_.+@reply\.example\.test$/);
  });

  it("a staff support reply sets no Reply-To, so the reply is captured (pre-#26)", async () => {
    const customer = `ticket-${stamp}@example.test`;
    await db.insert(staffUsers).values({ id: staffId, email: `staff-human-${stamp}@example.test`, passwordHash: "unused", role: "superadmin" });
    await db.insert(supportTickets).values({ id: ticketId, email: customer, subject: "Help" });
    const staff = { authorization: `Bearer ${(await createStaffSession(staffId)).token}` };
    const res = await app.inject({ method: "POST", url: `/v1/admin/support/${ticketId}/reply`, headers: staff, payload: { body: "Here is the answer." } });
    assert.equal(res.statusCode < 300, true, res.body);
    const job = await queuedFor(customer);
    assert.ok(job, "reply email queued");
    assert.equal(job.replyTo, undefined);
    assert.equal(job.from ?? null, null, "From no-reply@, unchanged");
    assert.equal(job.cls, "transactional", "classification unchanged");
    await processSystemMail(job);
    assert.match(replyTos[customer]?.[0] ?? "", /^reply\+thr_.+@reply\.example\.test$/);
  });

  it("the win-back sets no Reply-To (captured, pre-#26) and stays marketing", async () => {
    const to = `dormant-${stamp}@example.test`;
    const job = winBackJob({ email: to, name: "Ada" });
    assert.equal(job.replyTo, undefined);
    assert.equal(job.cls, "marketing");
    assert.match(job.text, /Just reply/);
    await processSystemMail(job);
    assert.match(replyTos[to]?.[0] ?? "", /^reply\+thr_.+@reply\.example\.test$/);
  });
});
