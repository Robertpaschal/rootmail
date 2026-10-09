import assert from "node:assert/strict";
import { after, before, describe, it, mock } from "node:test";
import { SESv2Client } from "@aws-sdk/client-sesv2";
import { eq, inArray } from "drizzle-orm";
import { closeQueues, closeRedis, env } from "@rootmail/core";
import { closeDb, contacts, db, ensureInternalAccount, messages, organizations, users } from "@rootmail/db";
import { provisionAccount, createSession } from "../lib/auth";
import { buildServer } from "../server";
import { processSend } from "../../../worker/src/pipeline";
import { automationSend } from "../../../worker/src/send";
import { processSystemMail } from "../../../worker/src/system-mail";

// rootmail-hq's own mail is tracked (opens and clicks) like all other mail:
// with SES_PLATFORM_CONFIGURATION_SET unset (prod), its HTML reaches SES exactly
// as stored, with no ses:no-track, on the shared rootmail-events set. Only when
// the override is set does platform mail get ses:no-track and that set.
// Customer mail is untouched either way, and #25's transactional classification
// (no List-Unsubscribe, no unsubscribe/postal or "Sent with rootmail" footer)
// holds in both states. Every AWS call is intercepted; nothing leaves the process.
const stamp = Date.now();
const to = `pnt-${stamp}@example.test`;
const html = '<p>Hi <a href="https://rootmail.io/x">join</a> <a class="b" href="https://rootmail.io/y">docs</a></p>';
const wire: { config?: string; html?: string; text?: string; headers: string[]; raw?: boolean }[] = [];
let customer: Awaited<ReturnType<typeof provisionAccount>>;
let internal: { organizationId: string; workspaceId: string };
let internalPostal: string | null = null;
let app: Awaited<ReturnType<typeof buildServer>>;
const previous = { provider: env.MAIL_PROVIDER, sandbox: env.SES_SANDBOX_MODE, shared: env.SES_CONFIGURATION_SET, platform: env.SES_PLATFORM_CONFIGURATION_SET };

async function last<T>(fn: () => Promise<T>) {
  const before = wire.length;
  await fn();
  assert.equal(wire.length, before + 1, "exactly one SES send");
  return wire[wire.length - 1];
}
async function customerSend() {
  const res = await app.inject({
    method: "POST", url: "/v1/messages",
    headers: { authorization: `Bearer ${(await createSession(customer.user.id, customer.production.id)).token}` },
    payload: { to, subject: `Customer ${stamp}`, html },
  });
  assert.equal(res.statusCode, 202, res.body);
  await processSend({ messageId: res.json().id } as Parameters<typeof processSend>[0]);
}
async function internalSend(kind: "transactional" | "sequence" | "campaign") {
  const { messageId } = await automationSend({
    workspaceId: internal.workspaceId, subTenantId: null, organizationId: internal.organizationId, mode: "live",
    type: kind === "transactional" ? "transactional" : "marketing", to, fromEmail: `no-reply@${env.ROOTMAIL_DOMAIN}`,
    subject: `Internal ${kind} ${stamp}`, html,
    sequenceId: kind === "sequence" ? "seq_pnt_test" : null, campaignId: kind === "campaign" ? "cmp_pnt_test" : null,
  });
  await processSend({ messageId } as Parameters<typeof processSend>[0]);
}
const systemMail = () => processSystemMail({ to, subject: `System ${stamp}`, html, text: "Hi", cls: "transactional" });
const tracked = (h?: string) => !/ses:no-track/.test(h ?? "");
// The links exactly as written: no attribute added, nothing rewritten.
const linksAsWritten = (h?: string) =>
  (h ?? "").includes('<a href="https://rootmail.io/x">join</a>') && (h ?? "").includes('<a class="b" href="https://rootmail.io/y">docs</a>');
function assertTransactionalShape(s: (typeof wire)[number], label: string) {
  assert.ok(!s.headers.includes("list-unsubscribe"), `${label}: ${s.headers.join(",")}`);
  assert.ok(!s.headers.includes("list-unsubscribe-post"), label);
  assert.doesNotMatch(s.html ?? "", /Sent with rootmail|unsubscribe/i, label);
  assert.doesNotMatch(s.text ?? "", /Sent with rootmail|unsubscribe/i, label);
}
const allNoTrack = (h?: string) => (h?.match(/<a[\s>]/gi)?.length ?? 0) === (h?.match(/<a ses:no-track/g)?.length ?? -1);

before(async () => {
  env.MAIL_PROVIDER = "ses";
  env.SES_SANDBOX_MODE = "false";
  env.SES_CONFIGURATION_SET = "rootmail-events";
  env.SES_PLATFORM_CONFIGURATION_SET = undefined;
  mock.method(SESv2Client.prototype, "send", async (command: { constructor: { name: string }; input: Record<string, any> }) => {
    const name = command.constructor.name;
    if (name === "GetEmailIdentityCommand") return { VerifiedForSendingStatus: true, DkimAttributes: { Status: "SUCCESS", SigningEnabled: true } };
    if (name === "SendEmailCommand") {
      const c = command.input.Content;
      const raw = c.Raw ? Buffer.from(c.Raw.Data).toString("utf8") : null;
      wire.push({
        config: command.input.ConfigurationSetName,
        html: c.Simple?.Body?.Html?.Data ?? raw ?? "",
        text: c.Simple?.Body?.Text?.Data ?? raw ?? "",
        headers: raw
          ? [...raw.split(/\r?\n\r?\n/)[0].matchAll(/^([A-Za-z-]+):/gm)].map((m) => m[1].toLowerCase())
          : (c.Simple?.Headers ?? []).map((h: { Name: string }) => h.Name.toLowerCase()),
        raw: Boolean(raw),
      });
      return { MessageId: `ses-pnt-${wire.length}-${stamp}` };
    }
    throw new Error(`Unexpected AWS operation: ${name}`);
  });
  customer = await provisionAccount({ email: `pnt-owner-${stamp}@example.test`, passwordHash: null, betaInviteId: "local-test-invite", name: "PNT customer" });
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, customer.user.id));
  internal = await ensureInternalAccount();
  const [org] = await db.select({ postal: organizations.postalAddress }).from(organizations).where(eq(organizations.id, internal.organizationId));
  internalPostal = org?.postal ?? null;
  await db.update(organizations).set({ postalAddress: "1 Test Street, Lagos" }).where(eq(organizations.id, internal.organizationId));
  app = await buildServer(); await app.ready();
});

after(async () => {
  await app?.close();
  await closeQueues(); await closeRedis();
  await db.update(organizations).set({ postalAddress: internalPostal }).where(eq(organizations.id, internal.organizationId));
  await db.delete(messages).where(eq(messages.toEmail, to));
  await db.delete(organizations).where(eq(organizations.id, customer.organizationId));
  await db.delete(users).where(eq(users.id, customer.user.id));
  await db.delete(contacts).where(inArray(contacts.email, [to]));
  mock.restoreAll();
  Object.assign(env, { MAIL_PROVIDER: previous.provider, SES_SANDBOX_MODE: previous.sandbox, SES_CONFIGURATION_SET: previous.shared, SES_PLATFORM_CONFIGURATION_SET: previous.platform });
  await closeDb();
});

describe("platform mail tracking", () => {
  it("override unset (prod): system mail goes out exactly as stored, tracked, on rootmail-events", async () => {
    const s = await last(systemMail);
    assert.equal(s.html, html, "byte-identical to the stored HTML");
    assert.ok(tracked(s.html) && linksAsWritten(s.html), s.html);
    assert.equal(s.config, "rootmail-events");
    const [row] = await db.select().from(messages).where(eq(messages.subject, `System ${stamp}`));
    assert.equal(row.renderedHtml, html, "the stored copy is not rewritten");
  });

  it("override unset (prod): internal transactional and sequence (invite) mail links are unmodified, no ses:no-track", async () => {
    for (const kind of ["transactional", "sequence", "campaign"] as const) {
      const s = await last(() => internalSend(kind));
      assert.ok(tracked(s.html), `${kind}: ${s.html}`);
      assert.ok(linksAsWritten(s.html), `${kind}: ${s.html}`);
      assert.equal(s.config, "rootmail-events", kind);
    }
  });

  it("blank or whitespace override behaves exactly like unset", async () => {
    for (const v of ["", "   "]) {
      env.SES_PLATFORM_CONFIGURATION_SET = v;
      try {
        const sys = await last(systemMail);
        assert.equal(sys.html, html); assert.equal(sys.config, "rootmail-events");
        const tx = await last(() => internalSend("transactional"));
        assert.ok(tracked(tx.html) && linksAsWritten(tx.html)); assert.equal(tx.config, "rootmail-events");
      } finally { env.SES_PLATFORM_CONFIGURATION_SET = undefined; }
    }
  });

  it("override set: platform mail gets ses:no-track on every link and the platform set", async () => {
    env.SES_PLATFORM_CONFIGURATION_SET = "rootmail-platform";
    try {
      const sys = await last(systemMail);
      assert.ok(allNoTrack(sys.html), sys.html); assert.equal(sys.config, "rootmail-platform");
      for (const kind of ["transactional", "sequence"] as const) {
        const s = await last(() => internalSend(kind));
        assert.ok(allNoTrack(s.html), `${kind}: ${s.html}`); assert.equal(s.config, "rootmail-platform", kind);
      }
      const c = await last(() => internalSend("campaign"));
      assert.ok(tracked(c.html) && linksAsWritten(c.html), "our own campaigns are not platform mail");
      assert.equal(c.config, "rootmail-events");
    } finally { env.SES_PLATFORM_CONFIGURATION_SET = undefined; }
  });

  it("customer mail is untouched with the override unset and set", async () => {
    for (const v of [undefined, "rootmail-platform"]) {
      env.SES_PLATFORM_CONFIGURATION_SET = v;
      try {
        const s = await last(customerSend);
        assert.ok(tracked(s.html) && linksAsWritten(s.html), s.html);
        assert.equal(s.config, "rootmail-events");
      } finally { env.SES_PLATFORM_CONFIGURATION_SET = undefined; }
    }
  });

  it("a customer's dedicated-IP config set is unchanged by the override", async () => {
    await db.update(organizations).set({ dedicatedIpStatus: "active", dedicatedIpConfigSet: "cust-dedicated" } as Partial<typeof organizations.$inferInsert>).where(eq(organizations.id, customer.organizationId));
    for (const v of [undefined, "rootmail-platform"]) {
      env.SES_PLATFORM_CONFIGURATION_SET = v;
      try {
        const s = await last(customerSend);
        assert.equal(s.config, "cust-dedicated");
        assert.ok(tracked(s.html) && linksAsWritten(s.html));
      } finally { env.SES_PLATFORM_CONFIGURATION_SET = undefined; }
    }
    await db.update(organizations).set({ dedicatedIpStatus: "none", dedicatedIpConfigSet: null } as Partial<typeof organizations.$inferInsert>).where(eq(organizations.id, customer.organizationId));
  });

  it("#25 holds in both states: internal transactional and system mail carry no List-Unsubscribe and no unsubscribe or 'Sent with rootmail' footer", async () => {
    for (const v of [undefined, "rootmail-platform"]) {
      env.SES_PLATFORM_CONFIGURATION_SET = v;
      try {
        assertTransactionalShape(await last(() => internalSend("transactional")), `internal transactional, override=${v}`);
        assertTransactionalShape(await last(systemMail), `system, override=${v}`);
      } finally { env.SES_PLATFORM_CONFIGURATION_SET = undefined; }
    }
  });
});
