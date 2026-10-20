import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { closeQueues, closeRedis, env, newId, sealCredentials } from "@rootmail/core";
import { closeDb, db, marketingDailyUsage, organizations, orgSendingProviders, transactionalDailyUsage, users } from "@rootmail/db";
import { provisionAccount } from "../lib/auth";
import { txDailyLimitForOrg } from "../lib/wings";
import { checkSendCapacity } from "../../../worker/src/capacity";

// A sequence step re-checks capacity in the WORKER. It must apply the same
// beta daily cap the API applies at admission.
const stamp = Date.now();
const today = new Date().toISOString().slice(0, 10);
const CAP = env.BETA_DAILY_SEND_CAP;
let a: Awaited<ReturnType<typeof provisionAccount>>;
const prev = { enabled: env.BYO_PROVIDER_ENABLED, key: env.PROVIDER_CREDENTIALS_KEY };

const setOrg = (v: Partial<typeof organizations.$inferInsert>) => db.update(organizations).set(v).where(eq(organizations.id, a.organizationId));
async function usedToday(n: number) {
  for (const t of [transactionalDailyUsage, marketingDailyUsage]) {
    await db.delete(t).where(eq(t.organizationId, a.organizationId));
    await db.insert(t).values({ id: newId("usage"), organizationId: a.organizationId, day: today, sent: n });
  }
}

before(async () => {
  env.BYO_PROVIDER_ENABLED = undefined;
  env.PROVIDER_CREDENTIALS_KEY = "test-provider-credentials-key-0123456789";
  a = await provisionAccount({ email: `seqcap-${stamp}@example.test`, passwordHash: null, betaInviteId: "local-test-invite", name: "Seq Cap" });
});
after(async () => {
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

describe("non-beta orgs — unchanged (characterization)", () => {
  it("at the beta cap a non-beta Free org still sends (its tier limit is higher)", async () => {
    await setOrg({ isBeta: false, isInternal: false });
    const [org] = await db.select().from(organizations).where(eq(organizations.id, a.organizationId));
    assert.ok(txDailyLimitForOrg(org) > CAP, "precondition: the tier allows more than the beta cap");
    await usedToday(CAP);
    assert.deepEqual(await checkSendCapacity(a.organizationId, "transactional"), { ok: true });
    assert.deepEqual(await checkSendCapacity(a.organizationId, "marketing"), { ok: true });
  });

  it("internal org flagged beta is not capped (same as the API)", async () => {
    await setOrg({ isBeta: true, isInternal: true });
    await usedToday(CAP);
    assert.deepEqual(await checkSendCapacity(a.organizationId, "transactional"), { ok: true });
  });
});

describe("beta orgs — the API's daily cap now applies to sequence steps", () => {
  before(() => setOrg({ isBeta: true, isInternal: false }));

  it("under the cap: sends", async () => {
    await usedToday(CAP - 1);
    assert.deepEqual(await checkSendCapacity(a.organizationId, "transactional"), { ok: true });
    assert.deepEqual(await checkSendCapacity(a.organizationId, "marketing"), { ok: true });
  });

  it("at the cap: deferred to tomorrow (never dropped), both wings", async () => {
    await usedToday(CAP);
    const tx = await checkSendCapacity(a.organizationId, "transactional");
    assert.equal(tx.ok, false);
    assert.equal(tx.reason, `transactional daily cap reached (${CAP}/${CAP} today)`);
    assert.ok(tx.retryAt && tx.retryAt.getTime() > Date.now());
    const mk = await checkSendCapacity(a.organizationId, "marketing");
    assert.equal(mk.ok, false);
    assert.equal(mk.reason, `marketing daily cap reached (${CAP}/${CAP} today)`);
  });

  it("the worker's cap equals the API's for the same org", async () => {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, a.organizationId));
    assert.equal(txDailyLimitForOrg(org), CAP);
  });
});

describe("BYO (flag on) — matches the API's capOrg", () => {
  before(async () => {
    env.BYO_PROVIDER_ENABLED = "true";
    await setOrg({ isBeta: true, isInternal: false, byoProvider: true });
  });
  after(async () => {
    env.BYO_PROVIDER_ENABLED = undefined;
    await db.delete(orgSendingProviders).where(eq(orgSendingProviders.organizationId, a.organizationId));
  });
  const connect = async (provider: string, status = "active") => {
    await db.delete(orgSendingProviders).where(eq(orgSendingProviders.organizationId, a.organizationId));
    await db.insert(orgSendingProviders).values({ id: newId("sendingProvider"), organizationId: a.organizationId, provider, credentials: sealCredentials("{}"), status, sendingDomains: ["acme.example"] });
  };

  it("own provider active: beta cap lifted", async () => {
    await connect("mailgun");
    await usedToday(CAP);
    assert.deepEqual(await checkSendCapacity(a.organizationId, "transactional"), { ok: true });
  });

  it("own provider not active yet: beta cap still applies", async () => {
    await connect("ses", "awaiting_feedback");
    await usedToday(CAP);
    assert.equal((await checkSendCapacity(a.organizationId, "transactional")).ok, false);
  });

  it("SMTP: lifted only to the 500/day ceiling", async () => {
    await connect("smtp");
    await usedToday(CAP);
    assert.deepEqual(await checkSendCapacity(a.organizationId, "transactional"), { ok: true });
    await usedToday(500);
    assert.equal((await checkSendCapacity(a.organizationId, "transactional")).ok, false);
    assert.equal((await checkSendCapacity(a.organizationId, "marketing")).ok, false);
  });
});
