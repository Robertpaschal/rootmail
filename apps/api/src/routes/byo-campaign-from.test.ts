import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { closeQueues, closeRedis, env, newId, sealCredentials } from "@rootmail/core";
import { campaigns, closeDb, db, organizations, orgSendingProviders, users } from "@rootmail/db";
import { createSession, provisionAccount } from "../lib/auth";
import { buildServer } from "../server";

// Campaign admission uses the same BYO From rule as single sends and the worker.
const stamp = Date.now();
let app: Awaited<ReturnType<typeof buildServer>>;
let a: Awaited<ReturnType<typeof provisionAccount>>;
let auth: { authorization: string };
const prev = { enabled: env.BYO_PROVIDER_ENABLED, key: env.PROVIDER_CREDENTIALS_KEY };

before(async () => {
  env.BYO_PROVIDER_ENABLED = undefined;
  env.PROVIDER_CREDENTIALS_KEY = "test-provider-credentials-key-0123456789";
  a = await provisionAccount({ email: `byo-camp-${stamp}@example.test`, passwordHash: null, betaInviteId: "local-test-invite", name: "BYO Camp" });
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, a.user.id));
  auth = { authorization: `Bearer ${(await createSession(a.user.id, a.production.id)).token}` };
  // An active own-provider connection, so only the flags decide which rule applies.
  await db.insert(orgSendingProviders).values({
    id: newId("sendingProvider"), organizationId: a.organizationId, provider: "mailgun",
    credentials: sealCredentials(JSON.stringify({ apiKey: "k", domain: "mg.acme.example" })),
    sendingDomain: "mg.acme.example", sendingDomains: ["mg.acme.example"], status: "active",
  });
  await db.update(organizations).set({ byoProvider: true }).where(eq(organizations.id, a.organizationId));
  app = await buildServer();
  await app.ready();
});

after(async () => {
  await app?.close();
  if (a) {
    await db.delete(organizations).where(eq(organizations.id, a.organizationId));
    await db.delete(users).where(eq(users.id, a.user.id));
  }
  env.BYO_PROVIDER_ENABLED = prev.enabled;
  env.PROVIDER_CREDENTIALS_KEY = prev.key;
  await closeQueues();
  await closeRedis();
  await closeDb();
});

const create = (from_email: string) =>
  app.inject({ method: "POST", url: "/v1/campaigns", headers: auth, payload: { name: `c ${from_email}`, subject: "s", from_email } });

describe("flag OFF — campaign From check unchanged (characterization)", () => {
  it("an address that isn't one of our verified senders is refused exactly as before", async () => {
    const res = await create("hello@mg.acme.example");
    assert.equal(res.statusCode, 422, res.body);
    assert.match(res.body, /isn't a verified sender for this organization/);
  });
});

describe("flag ON with an active own provider", () => {
  before(() => { env.BYO_PROVIDER_ENABLED = "true"; });
  after(() => { env.BYO_PROVIDER_ENABLED = undefined; });

  it("accepts a From the tenant's provider verified", async () => {
    const res = await create("hello@mg.acme.example");
    assert.ok(res.statusCode < 300, res.body);
  });

  it("refuses a From the provider hasn't verified, in the BYO wording", async () => {
    const res = await create("hello@elsewhere.example");
    assert.equal(res.statusCode, 400, res.body);
    assert.match(res.body, /isn't verified at your provider/);
  });

  it("refuses Rootmail's beta+ address", async () => {
    const res = await create(`beta+${a.organizationId}@rootmail.io`);
    assert.equal(res.statusCode, 400, res.body);
    assert.match(res.body, /beta\+ address belongs to Rootmail/);
  });

  it("PATCH uses the same rule; a refused update leaves the stored From unchanged", async () => {
    const created = await create("hello@mg.acme.example");
    const id = created.json().id as string;
    const patch = (from_email: string) =>
      app.inject({ method: "PATCH", url: `/v1/campaigns/${id}`, headers: auth, payload: { from_email } });
    assert.ok((await patch("news@mg.acme.example")).statusCode < 300);
    const bad = await patch("hello@elsewhere.example");
    assert.equal(bad.statusCode, 400, bad.body);
    assert.match(bad.body, /isn't verified at your provider/);
    const beta = await patch(`beta+${a.organizationId}@rootmail.io`);
    assert.equal(beta.statusCode, 400, beta.body);
    const [row] = await db.select({ fromEmail: campaigns.fromEmail }).from(campaigns).where(eq(campaigns.id, id));
    assert.equal(row.fromEmail, "news@mg.acme.example");
  });

  it("connection not active: falls back to our sender check, as before", async () => {
    await db.update(orgSendingProviders).set({ status: "pending" }).where(eq(orgSendingProviders.organizationId, a.organizationId));
    const res = await create("hello@mg.acme.example");
    assert.equal(res.statusCode, 422, res.body);
    assert.match(res.body, /isn't a verified sender/);
  });
});
