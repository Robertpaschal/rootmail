import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import { closeQueues, closeRedis, env, getRedis, getSystemMailQueue, hashPassword, newId, sha256Hex } from "@rootmail/core";
import { closeDb, db, staffAudit, staffResetTokens, staffUsers } from "@rootmail/db";
import { runStaffResetLink } from "../cli/staff-reset-link";
import { createStaffSession, resolveStaffSession } from "../lib/admin-auth";
import {
  STAFF_RESET_LIMITS,
  STAFF_RESET_TTL_MS,
  mintStaffResetToken,
  settleStaffResets,
  staffResetKeys,
} from "../lib/staff-password-reset";
import { buildServer } from "../server";
import { STAFF_FORGOT_NEUTRAL } from "./admin";

// No AWS is involved: mail is only ENQUEUED (MAIL_PROVIDER=mock, and no worker
// runs in tests), and these tests read the queue to see what would be sent.
const stamp = Date.now();
const staffEmail = `staff-reset-${stamp}@example.test`;
const goneEmail = `staff-gone-${stamp}@example.test`;
const strangerEmail = `not-staff-${stamp}@example.test`;
const OLD_PASSWORD = "old-password-123";
let staffId = "";
let goneId = "";
let app: Awaited<ReturnType<typeof buildServer>>;
const testEmails = () => [staffEmail, goneEmail, strangerEmail];

async function clearLimits() {
  const redis = getRedis();
  const k = staffResetKeys("127.0.0.1");
  await redis.del(k.ip, k.redeemIp, ...testEmails().map((e) => staffResetKeys("127.0.0.1", e).email!), `auth:fail:staff:${staffEmail}`);
}

async function mailTo(email: string) {
  const jobs = await getSystemMailQueue().getJobs(["waiting", "delayed", "prioritized", "paused"]);
  return jobs.filter((j) => j?.data?.to === email);
}

async function clearMail() {
  for (const email of testEmails()) for (const job of await mailTo(email)) await job.remove();
}

const tokensFor = (id: string) => db.select().from(staffResetTokens).where(eq(staffResetTokens.staffUserId, id));
const auditFor = (id: string, action: string) =>
  db.select().from(staffAudit).where(and(eq(staffAudit.staffUserId, id), eq(staffAudit.action, action)));

const post = (url: string, payload: Record<string, unknown>) => app.inject({ method: "POST", url, payload });
const forgot = (email: string) => post("/v1/admin/auth/forgot-password", { email });
const reset = (token: string, password: string) => post("/v1/admin/auth/reset-password", { token, password });
const login = (password: string) => post("/v1/admin/auth/login", { email: staffEmail, password });

before(async () => {
  env.MAIL_PROVIDER = "mock";
  staffId = newId("staffUser");
  goneId = newId("staffUser");
  await db.insert(staffUsers).values([
    { id: staffId, email: staffEmail, name: "Reset Fixture", passwordHash: hashPassword(OLD_PASSWORD), role: "superadmin" },
    { id: goneId, email: goneEmail, passwordHash: hashPassword(OLD_PASSWORD), role: "support", deactivatedAt: new Date() },
  ]);
  await clearLimits();
  await clearMail();
  app = await buildServer();
  await app.ready();
});

beforeEach(async () => {
  await clearLimits();
});

after(async () => {
  await settleStaffResets();
  await clearLimits();
  await clearMail();
  await app?.close();
  await db.delete(staffUsers).where(inArray(staffUsers.id, [staffId, goneId]));
  await closeQueues();
  await closeRedis();
  await closeDb();
});

describe("staff reset tokens", () => {
  it("are 32 random bytes and stored only as a SHA-256 hash", async () => {
    const { token, expiresAt } = await mintStaffResetToken(staffId);
    assert.ok(Buffer.from(token, "base64url").length >= 32, "at least 32 bytes of randomness");
    const rows = await tokensFor(staffId);
    const row = rows.find((r) => r.tokenHash === sha256Hex(token));
    assert.ok(row, "the hash is stored");
    assert.ok(rows.every((r) => r.tokenHash !== token && !JSON.stringify(r).includes(token)), "the raw token is stored nowhere");
    const ttl = expiresAt.getTime() - row!.createdAt.getTime();
    assert.ok(Math.abs(ttl - STAFF_RESET_TTL_MS) < 60_000, "expires in about 30 minutes");
  });
});

describe("POST /v1/admin/auth/forgot-password", () => {
  it("answers staff and strangers identically, and only emails staff", async () => {
    await clearMail();
    const before = (await tokensFor(staffId)).length;
    const known = await forgot(staffEmail.toUpperCase());
    const stranger = await forgot(strangerEmail);
    const gone = await forgot(goneEmail);
    for (const r of [known, stranger, gone]) {
      assert.equal(r.statusCode, 202);
      assert.equal(r.body, known.body);
    }
    assert.deepEqual(known.json(), STAFF_FORGOT_NEUTRAL);
    await settleStaffResets();

    assert.equal((await tokensFor(staffId)).length, before + 1);
    assert.equal((await tokensFor(goneId)).length, 0, "a deactivated account gets no link");
    const mail = await mailTo(staffEmail);
    assert.equal(mail.length, 1);
    assert.equal(mail[0]!.data.cls, "security");
    const link = /https?:\/\/\S+\/login\/reset\?token=([\w-]+)/.exec(mail[0]!.data.text);
    assert.ok(link, "the email carries a console reset link");
    assert.equal((await mailTo(strangerEmail)).length, 0);
    assert.equal((await mailTo(goneEmail)).length, 0);

    const [audit] = await auditFor(staffId, "staff.password_reset.requested");
    assert.ok(audit, "the request is audited");
    assert.ok(!JSON.stringify(audit).includes(link![1]!), "the audit never holds the token");
    assert.equal((await auditFor(goneId, "staff.password_reset.request_refused")).length, 1);

    // And the emailed link actually works.
    assert.equal((await reset(decodeURIComponent(link![1]!), "emailed-link-pass-1")).statusCode, 200);
    await clearMail();
  });

  it("rate-limits per email, the same for staff and strangers", async () => {
    for (const email of [staffEmail, strangerEmail]) {
      for (let i = 0; i < STAFF_RESET_LIMITS.perEmail; i++) assert.equal((await forgot(email)).statusCode, 202);
      assert.equal((await forgot(email)).statusCode, 429);
    }
    await settleStaffResets();
    await clearMail();
  });

  it("rate-limits per IP", async () => {
    let last = 0;
    for (let i = 0; i <= STAFF_RESET_LIMITS.perIp; i++) last = (await forgot(`ip-${i}-${stamp}@example.test`)).statusCode;
    assert.equal(last, 429);
    await settleStaffResets();
  });
});

describe("POST /v1/admin/auth/reset-password", () => {
  it("enforces the staff password rule without spending the link", async () => {
    const { token } = await mintStaffResetToken(staffId);
    assert.equal((await reset(token, "short")).statusCode, 422);
    assert.equal((await reset(token, "long-enough-pass")).statusCode, 200, "the link still works after a rejected password");
  });

  it("is single use, spends every other link, and signs out every staff session", async () => {
    const a = await mintStaffResetToken(staffId);
    const b = await mintStaffResetToken(staffId);
    const session = await createStaffSession(staffId);
    assert.ok(await resolveStaffSession(session.token), "session works before the reset");

    const ok = await reset(a.token, "brand-new-pass-1");
    assert.equal(ok.statusCode, 200, ok.body);

    assert.equal(await resolveStaffSession(session.token), null, "old sessions are gone");
    const me = await app.inject({ method: "GET", url: "/v1/admin/auth/me", headers: { authorization: `Bearer ${session.token}` } });
    assert.equal(me.statusCode, 401);

    const again = await reset(a.token, "another-pass-12");
    assert.equal(again.statusCode, 400, "a used link cannot be used again");
    assert.equal((await reset(b.token, "another-pass-12")).statusCode, 400, "other outstanding links were spent");
    assert.equal(again.body, (await reset("x".repeat(43), "another-pass-12")).body, "every failure reads the same");

    assert.equal((await login(OLD_PASSWORD)).statusCode, 401);
    assert.equal((await login("brand-new-pass-1")).statusCode, 200);

    assert.equal((await auditFor(staffId, "staff.password_reset.completed")).length >= 1, true);
    const failed = await auditFor(staffId, "staff.password_reset.failed");
    assert.ok(failed.some((f) => f.metadata.reason === "used"));
    for (const row of [...failed, ...(await auditFor(staffId, "staff.password_reset.completed"))]) {
      const text = JSON.stringify(row);
      assert.ok(!text.includes(a.token) && !text.includes(b.token) && !text.includes("brand-new-pass-1"), "no token or password in the audit");
    }
    const notice = await mailTo(staffEmail);
    assert.ok(notice.some((j) => /password was changed/.test(j.data.subject)), "the owner is told");
    await clearMail();
  });

  it("refuses an expired link and audits why", async () => {
    const { token } = await mintStaffResetToken(staffId, new Date(Date.now() - STAFF_RESET_TTL_MS - 60_000));
    assert.equal((await reset(token, "too-late-pass-1")).statusCode, 400);
    const failed = await auditFor(staffId, "staff.password_reset.failed");
    assert.ok(failed.some((f) => f.metadata.reason === "expired"));
  });

  it("rate-limits redeem attempts per IP", async () => {
    let last = 0;
    for (let i = 0; i <= STAFF_RESET_LIMITS.redeemPerIp; i++) last = (await reset(`guess-${i}-${"y".repeat(30)}`, "whatever-pass-1")).statusCode;
    assert.equal(last, 429);
  });
});

describe("staff:reset-link CLI", () => {
  const io = () => {
    const out: string[] = [];
    const err: string[] = [];
    return { out, err, io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) } };
  };

  it("refuses an unknown email and creates nothing", async () => {
    const t = io();
    const before = await db.select().from(staffUsers).where(eq(staffUsers.email, strangerEmail));
    assert.equal(await runStaffResetLink(["--email", strangerEmail], t.io), 1);
    assert.deepEqual(t.out, [], "nothing on stdout");
    assert.match(t.err.join("\n"), /No staff account/);
    assert.deepEqual(await db.select().from(staffUsers).where(eq(staffUsers.email, strangerEmail)), before);
  });

  it("refuses a deactivated account and a missing --email", async () => {
    const t = io();
    assert.equal(await runStaffResetLink([`--email=${goneEmail}`], t.io), 1);
    assert.equal((await tokensFor(goneId)).length, 0);
    assert.equal(await runStaffResetLink([], io().io), 2);
  });

  it("prints exactly one working link to stdout and audits the mint without the token", async () => {
    const t = io();
    assert.equal(await runStaffResetLink(["--", "--email", staffEmail.toUpperCase(), "--base-url", "https://internal.example.test"], t.io), 0);
    assert.equal(t.out.length, 1);
    const m = /^https:\/\/internal\.example\.test\/login\/reset\?token=([\w-]+)$/.exec(t.out[0]!);
    assert.ok(m, t.out[0]);
    const token = decodeURIComponent(m![1]!);
    assert.ok(!t.err.join("\n").includes(token), "the token only goes to stdout");
    const minted = await auditFor(staffId, "staff.password_reset.link_minted");
    assert.ok(minted.some((r) => r.metadata.via === "cli" && r.metadata.delivery === "stdout"));
    assert.ok(minted.every((r) => !JSON.stringify(r).includes(token)));
    assert.equal((await reset(token, "cli-chosen-pass-1")).statusCode, 200);
  });

  it("--send emails the link instead of printing it", async () => {
    await clearMail();
    const t = io();
    assert.equal(await runStaffResetLink(["--email", staffEmail, "--send"], t.io), 0);
    assert.deepEqual(t.out, []);
    const mail = await mailTo(staffEmail);
    assert.equal(mail.length, 1);
    assert.match(mail[0]!.data.text, /\/login\/reset\?token=/);
    await clearMail();
  });
});
