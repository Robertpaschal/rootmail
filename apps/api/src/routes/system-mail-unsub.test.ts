import assert from "node:assert/strict";
import { after, before, describe, it, mock } from "node:test";
import { SESv2Client } from "@aws-sdk/client-sesv2";
import { and, eq, inArray } from "drizzle-orm";
import { closeQueues, closeRedis, env, unsubscribeUrl, verifyUnsubscribeToken } from "@rootmail/core";
import { closeDb, contacts, db, ensureInternalAccount, messages, organizations, suppressions, users } from "@rootmail/db";
import { createSession, provisionAccount } from "../lib/auth";
import { buildServer } from "../server";
import { processSend } from "../../../worker/src/pipeline";
import { winBackJob } from "../../../worker/src/lifecycle";
import { processSystemMail } from "../../../worker/src/system-mail";

// RFC 8058 one-click unsubscribe on rootmail's OWN non-essential mail.
// Assertions are on the SendEmailCommand input handed to SES (every AWS call is
// intercepted; nothing leaves the process).
const stamp = Date.now();
const to = `unsub-${stamp}@example.test`;
const wire: { to: string; subject: string; headers: { Name: string; Value: string }[] }[] = [];
let internal: { organizationId: string; workspaceId: string };
let customer: Awaited<ReturnType<typeof provisionAccount>>;
let app: Awaited<ReturnType<typeof buildServer>>;
const previous = { provider: env.MAIL_PROVIDER, sandbox: env.SES_SANDBOX_MODE, platform: env.SES_PLATFORM_CONFIGURATION_SET };

async function last(fn: () => Promise<unknown>) {
  const n = wire.length;
  await fn();
  assert.equal(wire.length, n + 1, "exactly one SES send");
  return wire[wire.length - 1];
}
const names = (s: (typeof wire)[number]) => s.headers.map((h) => h.Name.toLowerCase());
const sys = (cls: "security" | "transactional" | "marketing", subject: string) =>
  processSystemMail({ to, subject: `${subject} ${stamp}`, html: "<p>x</p>", text: "x", cls });
const oneClick = (url: string) =>
  app.inject({
    method: "POST",
    url: url.replace(/^https?:\/\/[^/]+/, ""),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: "List-Unsubscribe=One-Click",
  });
const urlOf = (s: (typeof wire)[number]) => /^<([^>]+)>$/.exec(s.headers.find((h) => h.Name === "List-Unsubscribe")!.Value)![1];

before(async () => {
  env.MAIL_PROVIDER = "ses";
  env.SES_SANDBOX_MODE = "false";
  env.SES_PLATFORM_CONFIGURATION_SET = undefined;
  mock.method(SESv2Client.prototype, "send", async (command: { constructor: { name: string }; input: Record<string, any> }) => {
    const name = command.constructor.name;
    if (name === "GetEmailIdentityCommand") return { VerifiedForSendingStatus: true, DkimAttributes: { Status: "SUCCESS", SigningEnabled: true } };
    if (name !== "SendEmailCommand") throw new Error(`Unexpected AWS operation: ${name}`);
    const simple = command.input.Content.Simple;
    wire.push({ to: command.input.Destination.ToAddresses[0], subject: simple?.Subject?.Data ?? "", headers: simple?.Headers ?? [] });
    return { MessageId: `ses-unsub-${wire.length}-${stamp}` };
  });
  internal = await ensureInternalAccount();
  customer = await provisionAccount({ email: `unsub-owner-${stamp}@example.test`, passwordHash: null, betaInviteId: "local-test-invite", name: "Unsub customer" });
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, customer.user.id));
  app = await buildServer(); await app.ready();
});

after(async () => {
  await app?.close();
  await closeQueues(); await closeRedis();
  await db.delete(suppressions).where(eq(suppressions.email, to));
  await db.delete(messages).where(eq(messages.toEmail, to));
  await db.delete(contacts).where(inArray(contacts.email, [to]));
  await db.delete(organizations).where(eq(organizations.id, customer.organizationId));
  await db.delete(users).where(eq(users.id, customer.user.id));
  mock.restoreAll();
  Object.assign(env, { MAIL_PROVIDER: previous.provider, SES_SANDBOX_MODE: previous.sandbox, SES_PLATFORM_CONFIGURATION_SET: previous.platform });
  await closeDb();
});

describe("one-click unsubscribe on rootmail's own mail", () => {
  it("non-essential mail (win-back job, announcement class) carries both headers with a valid signed URL", async () => {
    const winBack = winBackJob({ email: to, name: "Ada" });
    assert.equal(winBack.cls, "marketing");
    for (const run of [() => processSystemMail(winBack), () => sys("marketing", "Announcement")]) {
      const s = await last(run);
      assert.deepEqual(names(s).filter((n) => n.startsWith("list-")), ["list-unsubscribe", "list-unsubscribe-post"]);
      assert.equal(s.headers.find((h) => h.Name === "List-Unsubscribe-Post")!.Value, "List-Unsubscribe=One-Click");
      const url = new URL(urlOf(s));
      assert.equal(url.pathname, "/v1/unsubscribe");
      assert.deepEqual(verifyUnsubscribeToken(url.searchParams.get("token")!), { w: internal.workspaceId, e: to });
    }
  });

  it("must-arrive mail (security, transactional) carries neither header", async () => {
    for (const cls of ["security", "transactional"] as const) {
      const s = await last(() => sys(cls, `Must arrive ${cls}`));
      assert.ok(!names(s).includes("list-unsubscribe"), `${cls}: ${names(s).join(",")}`);
      assert.ok(!names(s).includes("list-unsubscribe-post"), cls);
    }
  });

  it("customer mail is unchanged: transactional has no List-Unsubscribe headers", async () => {
    const token = (await createSession(customer.user.id, customer.production.id)).token;
    const res = await app.inject({ method: "POST", url: "/v1/messages", headers: { authorization: `Bearer ${token}` }, payload: { to, subject: `Customer ${stamp}`, html: "<p>x</p>" } });
    assert.equal(res.statusCode, 202, res.body);
    const s = await last(() => processSend({ messageId: res.json().id } as Parameters<typeof processSend>[0]));
    assert.ok(!names(s).includes("list-unsubscribe"), names(s).join(","));
  });

  it("a form-encoded one-click POST unsubscribes; a repeat POST is idempotent; must-arrive mail still goes", async () => {
    const s = await last(() => sys("marketing", "Before unsubscribe"));
    const url = urlOf(s);
    for (let i = 0; i < 2; i++) {
      const res = await oneClick(url);
      assert.equal(res.statusCode, 200, `POST #${i + 1}: ${res.body}`);
      assert.deepEqual(res.json(), { ok: true });
    }
    const rows = await db.select().from(suppressions).where(and(eq(suppressions.workspaceId, internal.workspaceId), eq(suppressions.email, to), eq(suppressions.reason, "unsubscribe")));
    assert.equal(rows.length, 1, "one suppression row after two POSTs");

    const n = wire.length;
    await sys("marketing", "After unsubscribe");
    assert.equal(wire.length, n, "marketing system mail is now suppressed");
    const [row] = await db.select().from(messages).where(eq(messages.subject, `After unsubscribe ${stamp}`));
    assert.equal(row.status, "suppressed");
    await last(() => sys("security", "Still arrives"));
    await last(() => sys("transactional", "Still arrives too"));
  });

  it("the one-click POST still works with no body, and rejects a forged token", async () => {
    const good = unsubscribeUrl({ w: internal.workspaceId, e: to }).replace(/^https?:\/\/[^/]+/, "");
    const noBody = await app.inject({ method: "POST", url: good });
    assert.equal(noBody.statusCode, 200, noBody.body);
    const bad = await oneClick(`/v1/unsubscribe?token=${encodeURIComponent("e30.forged")}`);
    assert.equal(bad.statusCode, 400, bad.body);
  });
});
