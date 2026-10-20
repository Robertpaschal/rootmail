import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, beforeEach, describe, it, mock } from "node:test";
import { SESv2Client } from "@aws-sdk/client-sesv2";
import { and, eq, inArray } from "drizzle-orm";
import {
  announcementUnsubscribeUrl,
  closeQueues,
  closeRedis,
  env,
  getSystemMailQueue,
  hashPassword,
  newId,
  type SystemMailJob,
} from "@rootmail/core";
import {
  announcements,
  closeDb,
  contacts,
  db,
  ensureInternalAccount,
  messages,
  organizations,
  staffAudit,
  staffUsers,
  transactionalDailyUsage,
  users,
} from "@rootmail/db";
import { createStaffSession } from "../lib/admin-auth";
import { createSession, provisionAccount } from "../lib/auth";
import { currentDay } from "../lib/billing";
import { announcementEmail } from "../lib/emails";
import { buildSystemMailPreviewJob, PREVIEW_SUBJECT_PREFIX } from "../lib/system-mail-preview";
import { buildServer } from "../server";
import { winBackJob } from "../../../worker/src/lifecycle";
import { processSystemMail } from "../../../worker/src/system-mail";

// Staff-only preview of marketing-class system mail. The API only ENQUEUES
// (MAIL_PROVIDER=mock, no worker in tests); the header test then runs the
// enqueued job through the real worker path with every AWS call intercepted.
const stamp = Date.now();
const staffEmail = `preview-staff-${stamp}@example.test`;
const supportEmail = `preview-support-${stamp}@example.test`;
const ownerEmail = `preview-owner-${stamp}@example.test`;
const allTest = [staffEmail, supportEmail, ownerEmail];
let staffId = "";
let supportId = "";
let staffToken = "";
let supportToken = "";
let internalOrgId = "";
let customer: Awaited<ReturnType<typeof provisionAccount>>;
let app: Awaited<ReturnType<typeof buildServer>>;
const previous = {
  provider: env.MAIL_PROVIDER,
  sandbox: env.SES_SANDBOX_MODE,
  platform: env.SES_PLATFORM_CONFIGURATION_SET,
  cap: env.BETA_DAILY_SEND_CAP,
  dash: env.DASHBOARD_URL,
};

async function jobsTo(email: string) {
  const jobs = await getSystemMailQueue().getJobs(["waiting", "delayed", "prioritized", "paused"]);
  return jobs.filter((j) => j?.data?.to === email);
}
async function clearMail() {
  for (const e of allTest) for (const j of await jobsTo(e)) await j.remove();
}
async function setCounter(n: number | null) {
  await db
    .delete(transactionalDailyUsage)
    .where(and(eq(transactionalDailyUsage.organizationId, internalOrgId), eq(transactionalDailyUsage.day, currentDay())));
  if (n !== null) {
    await db.insert(transactionalDailyUsage).values({ id: newId("usage"), organizationId: internalOrgId, day: currentDay(), sent: n });
  }
}
async function counter() {
  const [r] = await db
    .select({ n: transactionalDailyUsage.sent })
    .from(transactionalDailyUsage)
    .where(and(eq(transactionalDailyUsage.organizationId, internalOrgId), eq(transactionalDailyUsage.day, currentDay())));
  return r?.n ?? 0;
}
const preview = (token: string | null, payload: Record<string, unknown>) =>
  app.inject({
    method: "POST",
    url: "/v1/admin/system-mail/preview",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    payload,
  });

before(async () => {
  env.MAIL_PROVIDER = "mock";
  env.DASHBOARD_URL = "https://app.rootmail.io";
  env.BETA_DAILY_SEND_CAP = 12;
  staffId = newId("staffUser");
  supportId = newId("staffUser");
  await db.insert(staffUsers).values([
    { id: staffId, email: staffEmail, name: "Preview Staff", passwordHash: hashPassword("x-password-123"), role: "superadmin" },
    { id: supportId, email: supportEmail, name: null, passwordHash: hashPassword("x-password-123"), role: "support" },
  ]);
  staffToken = (await createStaffSession(staffId)).token;
  supportToken = (await createStaffSession(supportId)).token;
  internalOrgId = (await ensureInternalAccount()).organizationId;
  customer = await provisionAccount({ email: ownerEmail, passwordHash: null, betaInviteId: "local-test-invite", name: "Owner Ada" });
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, customer.user.id));
  app = await buildServer();
  await app.ready();
});

beforeEach(async () => {
  await clearMail();
  await setCounter(null);
});

after(async () => {
  await clearMail();
  await setCounter(null);
  await app?.close();
  await db.delete(staffAudit).where(inArray(staffAudit.staffUserId, [staffId, supportId]));
  await db.delete(announcements).where(eq(announcements.sentByStaffId, staffId));
  await db.delete(staffUsers).where(inArray(staffUsers.id, [staffId, supportId]));
  await db.delete(messages).where(inArray(messages.toEmail, allTest));
  await db.delete(contacts).where(inArray(contacts.email, allTest));
  await db.delete(organizations).where(eq(organizations.id, customer.organizationId));
  await db.delete(users).where(eq(users.id, customer.user.id));
  await closeQueues();
  await closeRedis();
  mock.restoreAll();
  Object.assign(env, {
    MAIL_PROVIDER: previous.provider,
    SES_SANDBOX_MODE: previous.sandbox,
    SES_PLATFORM_CONFIGURATION_SET: previous.platform,
    BETA_DAILY_SEND_CAP: previous.cap,
    DASHBOARD_URL: previous.dash,
  });
  await closeDb();
});

describe("POST /v1/admin/system-mail/preview", () => {
  it("is staff only: no session is 401, a staff role without announce.send is 403, a customer session is 401", async () => {
    assert.equal((await preview(null, { kind: "announcement" })).statusCode, 401);
    const denied = await preview(supportToken, { kind: "announcement" });
    assert.equal(denied.statusCode, 403, denied.body);
    const customerToken = (await createSession(customer.user.id, customer.production.id)).token;
    assert.equal((await preview(customerToken, { kind: "announcement" })).statusCode, 401);
    for (const e of allTest) assert.equal((await jobsTo(e)).length, 0, `nothing enqueued to ${e}`);
    assert.equal(await counter(), 0, "refusals do not spend the cap");
  });

  it("takes no recipient input: a `to` field is rejected and nothing is sent", async () => {
    const res = await preview(staffToken, { kind: "announcement", to: ownerEmail });
    assert.equal(res.statusCode, 422, res.body);
    assert.equal((await jobsTo(ownerEmail)).length, 0);
    assert.equal((await jobsTo(staffEmail)).length, 0);
  });

  for (const kind of ["announcement", "win_back"] as const) {
    it(`${kind}: enqueues exactly one marketing job, to the caller only, with a [Preview] subject`, async () => {
      const res = await preview(staffToken, { kind });
      assert.equal(res.statusCode, 200, res.body);
      assert.equal(res.json().to, staffEmail);
      assert.equal(res.json().used_today, 1);
      const jobs = await jobsTo(staffEmail);
      assert.equal(jobs.length, 1, "exactly one enqueue");
      const job = jobs[0].data as SystemMailJob;
      assert.equal(job.to, staffEmail);
      assert.equal(job.cls, "marketing");
      assert.ok(job.subject.startsWith(PREVIEW_SUBJECT_PREFIX), job.subject);
      assert.equal(job.from, undefined, "same default sender as the real send");
      assert.equal(job.replyTo, undefined, "same default Reply-To as the real send");
      assert.equal((await jobsTo(ownerEmail)).length, 0, "no customer is mailed");
      assert.equal(await counter(), 1, "counts toward the daily cap");
      const audit = await db.select().from(staffAudit).where(and(eq(staffAudit.staffUserId, staffId), eq(staffAudit.action, "system_mail.preview")));
      assert.ok(audit.length >= 1, "audited");
    });
  }

  it("in the SES sandbox, refuses (409) when the caller's own address is not verified, before spending the cap", async () => {
    Object.assign(env, { MAIL_PROVIDER: "ses", SES_SANDBOX_MODE: "true" });
    const m = mock.method(SESv2Client.prototype, "send", async (command: { constructor: { name: string } }) => {
      if (command.constructor.name === "GetEmailIdentityCommand") return { VerifiedForSendingStatus: false };
      throw new Error(`Unexpected AWS operation: ${command.constructor.name}`);
    });
    try {
      const res = await preview(staffToken, { kind: "announcement" });
      assert.equal(res.statusCode, 409, res.body);
      assert.equal((await jobsTo(staffEmail)).length, 0);
      assert.equal(await counter(), 0);
    } finally {
      m.mock.restore();
      Object.assign(env, { MAIL_PROVIDER: "mock", SES_SANDBOX_MODE: previous.sandbox });
    }
  });

  it("respects the sandbox daily cap: refuses with a clear 402 at the cap and enqueues nothing", async () => {
    await setCounter(env.BETA_DAILY_SEND_CAP);
    const res = await preview(staffToken, { kind: "win_back" });
    assert.equal(res.statusCode, 402, res.body);
    assert.match(res.json().error.message, /daily cap|send cap/i);
    assert.equal((await jobsTo(staffEmail)).length, 0);
    assert.equal(await counter(), env.BETA_DAILY_SEND_CAP, "the counter is not pushed past the cap");

    await setCounter(env.BETA_DAILY_SEND_CAP - 1);
    assert.equal((await preview(staffToken, { kind: "win_back" })).statusCode, 200, "the last slot is usable");
    assert.equal((await preview(staffToken, { kind: "win_back" })).statusCode, 402, "then refused");
    assert.equal((await jobsTo(staffEmail)).length, 1);
  });
});

describe("the preview carries exactly the real headers", () => {
  it("List-Unsubscribe + List-Unsubscribe-Post on the wire, same as the real job; only the subject differs", async () => {
    const wire: { subject: string; headers: { Name: string; Value: string }[]; set?: string }[] = [];
    Object.assign(env, { MAIL_PROVIDER: "ses", SES_SANDBOX_MODE: "false", SES_PLATFORM_CONFIGURATION_SET: undefined });
    const m = mock.method(SESv2Client.prototype, "send", async (command: { constructor: { name: string }; input: Record<string, any> }) => {
      const name = command.constructor.name;
      if (name === "GetEmailIdentityCommand") return { VerifiedForSendingStatus: true, DkimAttributes: { Status: "SUCCESS", SigningEnabled: true } };
      if (name !== "SendEmailCommand") throw new Error(`Unexpected AWS operation: ${name}`);
      const simple = command.input.Content.Simple;
      wire.push({ subject: simple?.Subject?.Data ?? "", headers: simple?.Headers ?? [], set: command.input.ConfigurationSetName });
      return { MessageId: `ses-preview-${wire.length}-${stamp}` };
    });
    try {
      for (const kind of ["announcement", "win_back"] as const) {
        const previewJob = buildSystemMailPreviewJob(kind, staffEmail, "Preview Staff");
        const realJob: SystemMailJob = { ...previewJob, subject: previewJob.subject.slice(PREVIEW_SUBJECT_PREFIX.length) };
        await processSystemMail(previewJob);
        await processSystemMail(realJob);
        const [p, r] = wire.slice(-2);
        const strip = (h: { Name: string; Value: string }[]) => h.map((x) => [x.Name, x.Value]);
        assert.deepEqual(strip(p.headers), strip(r.headers), `${kind}: identical headers`);
        assert.deepEqual(p.headers.map((h) => h.Name), ["List-Unsubscribe", "List-Unsubscribe-Post"]);
        assert.equal(p.headers[1].Value, "List-Unsubscribe=One-Click");
        assert.equal(p.set, r.set, "same configuration set");
        assert.equal(p.subject, `${PREVIEW_SUBJECT_PREFIX}${r.subject}`);
      }
    } finally {
      m.mock.restore();
      env.MAIL_PROVIDER = "mock";
    }
  });
});

describe("characterization: existing marketing system mail is unchanged", () => {
  it("winBackJob is byte-identical to the pre-change output (moved to core, not edited)", () => {
    const out = JSON.stringify([winBackJob({ email: "A@x.test", name: "Ada <&>" }), winBackJob({ email: "b@x.test", name: null })]) + "\n";
    assert.equal(createHash("sha256").update(out).digest("hex"), "9ca17bbb1938210d0aa0b8f0638b45a0fd0435fed707d6458c36c14965331e74");
  });

  it("POST /v1/admin/announcements still enqueues the plain marketing job to each owner, no [Preview], no cap spend", async () => {
    const subject = `Real announcement ${stamp}`;
    const body = "Hello owners.";
    const res = await app.inject({ method: "POST", url: "/v1/admin/announcements", headers: { authorization: `Bearer ${staffToken}` }, payload: { subject, body } });
    assert.equal(res.statusCode, 200, res.body);
    const jobs = await jobsTo(ownerEmail);
    assert.equal(jobs.length, 1);
    const mail = announcementEmail({ subject, body, recipientName: "Owner Ada", unsubscribeUrl: announcementUnsubscribeUrl(ownerEmail) });
    assert.deepEqual(jobs[0].data, { to: ownerEmail, subject: mail.subject, html: mail.html, text: mail.text, cls: "marketing" });
    assert.equal((await jobsTo(staffEmail)).length, 0, "staff are not added as recipients");
    assert.equal(await counter(), 0, "real announcements do not touch the preview counter");
    for (const j of await getSystemMailQueue().getJobs(["waiting", "delayed", "prioritized", "paused"])) {
      if (j?.data?.subject === subject) await j.remove();
    }
  });
});
