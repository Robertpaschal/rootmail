import assert from "node:assert/strict";
import { after, before, describe, it, mock } from "node:test";
import { SESv2Client } from "@aws-sdk/client-sesv2";
import { and, eq, inArray } from "drizzle-orm";
import { closeQueues, closeRedis, newId } from "@rootmail/core";
import { closeDb, contacts, db, staffUsers } from "@rootmail/db";
import { createStaffSession } from "../lib/admin-auth";
import { betaWaitlistAudience } from "../lib/beta-waitlist";
import { buildServer } from "../server";
import { normalizeSiteUrl, SITE_URL_MAX } from "./beta-waitlist";

// /beta has an optional real Website field, posted as `site_url` (the hidden
// `website` field is the honeypot and must keep dropping bots). Every AWS call
// is intercepted; nothing leaves the process.
const stamp = Date.now();
const addr = (k: string) => `bwf-${k}-${stamp}@example.test`;
const used: string[] = [];
let app: Awaited<ReturnType<typeof buildServer>>;
let staffId = "";
let workspaceId = "";

async function join(payload: Record<string, unknown>) {
  if (typeof payload.email === "string") used.push(payload.email);
  return app.inject({ method: "POST", url: "/v1/beta/waitlist", payload });
}
async function contactFor(email: string) {
  const [c] = await db.select().from(contacts).where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.email, email))).limit(1);
  return c;
}

before(async () => {
  mock.method(SESv2Client.prototype, "send", async () => ({}));
  ({ workspaceId } = await betaWaitlistAudience());
  staffId = newId("staffUser");
  await db.insert(staffUsers).values({ id: staffId, email: `bwf-staff-${stamp}@example.test`, name: "BWF", passwordHash: "x-not-a-real-hash", role: "superadmin" });
  app = await buildServer(); await app.ready();
});

after(async () => {
  await app?.close();
  await db.delete(contacts).where(and(eq(contacts.workspaceId, workspaceId), inArray(contacts.email, used)));
  await db.delete(staffUsers).where(eq(staffUsers.id, staffId));
  mock.restoreAll();
  await closeQueues(); await closeRedis(); await closeDb();
});

describe("normalizeSiteUrl", () => {
  it("accepts real web addresses, with or without a scheme", () => {
    assert.equal(normalizeSiteUrl("acme.com"), "https://acme.com");
    assert.equal(normalizeSiteUrl(" www.Acme.co.uk/about "), "https://www.acme.co.uk/about");
    assert.equal(normalizeSiteUrl("http://shop.acme.io/?ref=x"), "http://shop.acme.io/?ref=x");
  });
  it("rejects what isn't one", () => {
    for (const bad of ["acme", "javascript:alert(1)", "ftp://acme.com", "https://user:pw@acme.com", "acme .com", "mailto:a@acme.com", `https://acme.com/${"a".repeat(SITE_URL_MAX)}`, "https://localhost", "https://10.0.0.1"]) {
      assert.equal(normalizeSiteUrl(bad), null, bad);
    }
  });
});

describe("POST /v1/beta/waitlist site_url", () => {
  it("stores a valid site_url in the waitlist contact's metadata", async () => {
    const res = await join({ email: addr("ok"), use_case: "Receipts", site_url: "acme.com" });
    assert.equal(res.statusCode, 202, res.body);
    const c = await contactFor(addr("ok"));
    assert.equal((c.metadata as Record<string, unknown>).beta_site_url, "https://acme.com");
    assert.equal((c.metadata as Record<string, unknown>).beta_use_case, "Receipts");
  });

  it("is optional", async () => {
    const res = await join({ email: addr("none") });
    assert.equal(res.statusCode, 202, res.body);
    const c = await contactFor(addr("none"));
    assert.equal("beta_site_url" in (c.metadata as Record<string, unknown>), false);
  });

  it("rejects an invalid one with a field error and adds nobody", async () => {
    const res = await join({ email: addr("bad"), site_url: "not a url" });
    assert.equal(res.statusCode, 422, res.body);
    assert.match(res.body, /site_url/);
    assert.equal(await contactFor(addr("bad")), undefined);
  });

  it("keeps the honeypot working: a filled `website` is dropped silently, whatever site_url says", async () => {
    for (const site_url of ["acme.com", "not a url", undefined]) {
      const email = addr(`bot-${String(site_url).replace(/\W/g, "")}`);
      const res = await join({ email, website: "http://spam.example", site_url });
      assert.equal(res.statusCode, 202, res.body);
      assert.deepEqual(res.json(), { ok: true, status: "waiting" });
      assert.equal(await contactFor(email), undefined, "nothing written");
    }
  });

  it("shows the website to staff in the waitlist listing", async () => {
    const { token } = await createStaffSession(staffId);
    const res = await app.inject({ method: "GET", url: "/v1/admin/beta/waitlist", headers: { authorization: `Bearer ${token}` } });
    assert.equal(res.statusCode, 200, res.body);
    const row = res.json().data.find((r: { email: string }) => r.email === addr("ok"));
    assert.equal(row?.site_url, "https://acme.com");
    assert.equal(res.json().data.find((r: { email: string }) => r.email === addr("none"))?.site_url, null);
  });
});
