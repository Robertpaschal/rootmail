import assert from "node:assert/strict";
import { after, before, describe, it, mock } from "node:test";
import { SESv2Client } from "@aws-sdk/client-sesv2";
import { eq } from "drizzle-orm";
import { closeQueues, closeRedis, env, isEnvelope, newId, openCredentials } from "@rootmail/core";
import { awsAssume } from "@rootmail/core/aws-assume";
import { closeDb, db, messages, organizations, orgSendingProviders, users } from "@rootmail/db";
import { createSession, provisionAccount } from "../lib/auth";
import { buildServer } from "../server";
import { processSend } from "../../../worker/src/pipeline";
import { forgetOrgProvider } from "../../../worker/src/providers/for-org";

// BYO assume-role. STS and SES are stubbed; the chain itself is unit-tested in
// packages/core/src/aws-assume.test.ts.
const stamp = Date.now();
const ASSUMER = "arn:aws:iam::130299713609:role/rootmail-byo-assumer";
const ROLE = "arn:aws:iam::111122223333:role/rootmail-sender";
let app: Awaited<ReturnType<typeof buildServer>>;
let a: Awaited<ReturnType<typeof provisionAccount>>;
let authA: { authorization: string };
const prev = { enabled: env.BYO_PROVIDER_ENABLED, key: env.PROVIDER_CREDENTIALS_KEY, assumer: env.BYO_ASSUMER_ROLE_ARN };
const assumes: { orgId: string; roleArn: string; externalId: string }[] = [];
let assumeFails = false;
const sesCalls: { name: string; creds: unknown }[] = [];

const roleBody = (over: Record<string, unknown> = {}) => ({
  provider: "ses_role", role_arn: ROLE, region: "us-east-1", sns_topic_arn: "arn:aws:sns:us-east-1:111122223333:feedback", ...over,
});

before(async () => {
  env.BYO_PROVIDER_ENABLED = undefined;
  env.BYO_ASSUMER_ROLE_ARN = undefined;
  env.PROVIDER_CREDENTIALS_KEY = "test-provider-credentials-key-0123456789";
  a = await provisionAccount({ email: `role-a-${stamp}@example.test`, passwordHash: null, betaInviteId: "local-test-invite", name: "Role A" });
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, a.user.id));
  authA = { authorization: `Bearer ${(await createSession(a.user.id, a.production.id)).token}` };
  app = await buildServer();
  await app.ready();
  mock.method(awsAssume, "assumeTenantRole", async (input: { orgId: string; roleArn: string; externalId: string }) => {
    assumes.push(input);
    if (assumeFails) throw new Error("AWS refused to let Rootmail assume that role. Check its trust policy names Rootmail's role and the external ID exactly");
    return { accessKeyId: `ASIA${assumes.length}`, secretAccessKey: "s", sessionToken: "t", expiration: new Date(Date.now() + 900_000) };
  });
  mock.method(SESv2Client.prototype, "send", async function (this: SESv2Client, command: { constructor: { name: string } }) {
    const creds = await (this.config.credentials as () => Promise<unknown>)();
    sesCalls.push({ name: command.constructor.name, creds });
    if (command.constructor.name === "GetAccountCommand") return { ProductionAccessEnabled: true };
    if (command.constructor.name === "ListEmailIdentitiesCommand") {
      return { EmailIdentities: [{ IdentityName: "acme.example", SendingEnabled: true, VerificationStatus: "SUCCESS" }] };
    }
    if (command.constructor.name === "SendEmailCommand") return { MessageId: `ses-${sesCalls.length}` };
    throw new Error(`unexpected SES ${command.constructor.name}`);
  });
});

after(async () => {
  await app?.close();
  if (a) {
    await db.delete(organizations).where(eq(organizations.id, a.organizationId));
    await db.delete(users).where(eq(users.id, a.user.id));
  }
  mock.restoreAll();
  env.BYO_PROVIDER_ENABLED = prev.enabled;
  env.PROVIDER_CREDENTIALS_KEY = prev.key;
  env.BYO_ASSUMER_ROLE_ARN = prev.assumer;
  await closeQueues();
  await closeRedis();
  await closeDb();
});

const req = (method: "GET" | "POST", url: string, payload?: Record<string, unknown>) =>
  app.inject({ method, url, headers: authA, payload });
const flagOrg = (on: boolean) => db.update(organizations).set({ byoProvider: on }).where(eq(organizations.id, a.organizationId));
const queue = async (to: string) => {
  const id = newId("message");
  await db.insert(messages).values({ id, workspaceId: a.production.id, toEmail: to, fromEmail: "hi@acme.example", subject: "s", status: "queued", renderedHtml: "<p>x</p>", renderedText: "x" });
  return id;
};

describe("flag OFF — assume-role does not exist (characterization)", () => {
  it("GET is the exact pre-BYO body; POST ses_role fails like any unknown provider; nothing assumed", async () => {
    await flagOrg(true);
    env.BYO_ASSUMER_ROLE_ARN = ASSUMER; // even with the assumer configured
    const get = (await req("GET", "/v1/sending-provider")).json();
    assert.deepEqual(Object.keys(get).sort(), ["connected", "note", "object"]);
    const res = await req("POST", "/v1/sending-provider", roleBody());
    const unknown = await req("POST", "/v1/sending-provider", roleBody({ provider: "carrier-pigeon" }));
    assert.equal(res.statusCode, unknown.statusCode);
    assert.equal(assumes.length, 0);
  });
});

describe("flag ON", () => {
  before(async () => {
    env.BYO_PROVIDER_ENABLED = "true";
    await flagOrg(true);
  });
  after(() => {
    env.BYO_PROVIDER_ENABLED = undefined;
    env.BYO_ASSUMER_ROLE_ARN = undefined;
  });

  it("assumer unset: option hidden (assume_role null) and refused", async () => {
    env.BYO_ASSUMER_ROLE_ARN = undefined;
    assert.equal((await req("GET", "/v1/sending-provider")).json().assume_role, null);
    const res = await req("POST", "/v1/sending-provider", roleBody());
    assert.equal(res.statusCode, 400);
    assert.match(res.body, /IAM role isn't available/);
    assert.equal(assumes.length, 0);
  });

  it("assumer set: GET shows our assumer, the org's external ID and both policies", async () => {
    env.BYO_ASSUMER_ROLE_ARN = ASSUMER;
    const setup = (await req("GET", "/v1/sending-provider")).json().assume_role;
    assert.equal(setup.assumer_role_arn, ASSUMER);
    assert.match(setup.external_id, /^rm-/);
    assert.deepEqual(setup.trust_policy.Statement[0].Condition, { StringEquals: { "sts:ExternalId": setup.external_id } });
    assert.equal(setup.trust_policy.Statement[0].Principal.AWS, ASSUMER);
  });

  it("needs the SNS topic, like keys", async () => {
    const res = await req("POST", "/v1/sending-provider", roleBody({ sns_topic_arn: undefined }));
    assert.equal(res.statusCode, 400);
    assert.match(res.body, /SNS topic/);
  });

  it("a role AWS won't let us assume is refused with the reason", async () => {
    assumeFails = true;
    const res = await req("POST", "/v1/sending-provider", roleBody());
    assumeFails = false;
    assert.equal(res.statusCode, 400);
    assert.match(res.body, /trust policy/);
  });

  it("connects: assumed with OUR external ID, checked by READ only, stored as SES awaiting SNS confirmation", async () => {
    const before = sesCalls.length;
    const res = await req("POST", "/v1/sending-provider", roleBody());
    assert.equal(res.statusCode, 200, res.body);
    const body = res.json();
    const setup = (await req("GET", "/v1/sending-provider")).json().assume_role;
    assert.equal(assumes.at(-1)!.externalId, setup.external_id);
    assert.equal(assumes.at(-1)!.roleArn, ROLE);
    assert.deepEqual(sesCalls.slice(before).map((c) => c.name), ["GetAccountCommand", "ListEmailIdentitiesCommand"]);
    assert.equal(body.provider, "ses");
    assert.equal(body.status, "awaiting_feedback");
    assert.deepEqual(body.sending_domains, ["acme.example"]);
    assert.match(body.webhook_url, /\/ses$/);
    assert.match(body.credential_hint, /^role arn:aws:iam::111122223333:role\/rootmail-sender · external ID rm-/);
    const [row] = await db.select().from(orgSendingProviders).where(eq(orgSendingProviders.organizationId, a.organizationId));
    assert.equal(isEnvelope(row.credentials), true);
    assert.deepEqual(JSON.parse(openCredentials(row.credentials)), { roleArn: ROLE, externalId: setup.external_id, region: "us-east-1" });
  });

  it("sends with the role's short-lived credentials, reuses them, and re-assumes after a provider change", async () => {
    await db.update(orgSendingProviders).set({ status: "active" }).where(eq(orgSendingProviders.organizationId, a.organizationId));
    forgetOrgProvider(a.organizationId);
    const n0 = assumes.length;
    for (const to of [`r1-${stamp}@example.test`, `r2-${stamp}@example.test`]) {
      const id = await queue(to);
      await processSend({ messageId: id } as Parameters<typeof processSend>[0]);
      const [m] = await db.select().from(messages).where(eq(messages.id, id));
      assert.equal(m.status, "sent", m.error ?? "");
      assert.match(m.providerMessageId ?? "", /^ses-/);
    }
    assert.equal(assumes.length - n0, 1, "cached between sends");
    assert.match(String((sesCalls.at(-1)!.creds as { accessKeyId: string }).accessKeyId), /^ASIA/);
    forgetOrgProvider(a.organizationId);
    await processSend({ messageId: await queue(`r3-${stamp}@example.test`) } as Parameters<typeof processSend>[0]);
    assert.equal(assumes.length - n0, 2, "provider change clears the cache");
  });

  it("assume failing at send time fails the message loudly — never our SES", async () => {
    forgetOrgProvider(a.organizationId);
    assumeFails = true;
    const id = await queue(`r4-${stamp}@example.test`);
    await assert.rejects(processSend({ messageId: id } as Parameters<typeof processSend>[0]));
    assumeFails = false;
    const [m] = await db.select().from(messages).where(eq(messages.id, id));
    assert.equal(m.status, "failed");
    assert.match(m.error ?? "", /^Not sent: your Amazon SES account didn't accept this message \(AWS refused/);
    assert.equal(m.providerMessageId, null);
  });

  it("assumer removed after connecting: fails loudly, no fallback", async () => {
    env.BYO_ASSUMER_ROLE_ARN = undefined;
    forgetOrgProvider(a.organizationId);
    const id = await queue(`r5-${stamp}@example.test`);
    await processSend({ messageId: id } as Parameters<typeof processSend>[0]);
    const [m] = await db.select().from(messages).where(eq(messages.id, id));
    assert.equal(m.status, "failed");
    assert.match(m.error ?? "", /^Not sent: your Amazon SES account didn't accept this message \(sending through an IAM role isn't available/);
    env.BYO_ASSUMER_ROLE_ARN = ASSUMER;
  });

  for (const which of ["global switch", "org flag"] as const) {
    it(`turning the ${which} off fails role mail loudly — never our SES, no assume`, async () => {
      if (which === "global switch") env.BYO_PROVIDER_ENABLED = undefined;
      else await flagOrg(false);
      forgetOrgProvider(a.organizationId);
      const n0 = assumes.length;
      const s0 = sesCalls.length;
      const id = await queue(`off-${which.length}-${stamp}@example.test`);
      await processSend({ messageId: id } as Parameters<typeof processSend>[0]);
      const [m] = await db.select().from(messages).where(eq(messages.id, id));
      assert.equal(m.status, "failed");
      assert.match(m.error ?? "", /switched off/);
      assert.equal(assumes.length, n0);
      assert.equal(sesCalls.length, s0);
      env.BYO_PROVIDER_ENABLED = "true";
      await flagOrg(true);
    });
  }
});
