import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { inArray } from "drizzle-orm";
import { hashApiKey } from "@rootmail/core";
import { apiKeys, closeDb, db, orgAddons, organizations, subTenants, suppressions, workspaces } from "@rootmail/db";
import { buildServer } from "../server";

/**
 * GET /v1/suppressions — the read-only list behind the Deliverability counts.
 * Real DB, real HTTP stack. Proves: workspace isolation, sub-tenant scoping that
 * matches the counts, newest-first ordering, pagination, search, 401/403, and
 * that GET /v1/deliverability's suppression counts are unchanged.
 */
const S = `sl${Date.now()}`;
const ORG = `org_${S}`;
const ORG2 = `org2_${S}`;
const WS = `ws_${S}`;
const WS2 = `ws2_${S}`;
const A = `tnt_a_${S}`;
const B = `tnt_b_${S}`;
const KEY = `rm_test_${S}`;
const PINNED = `rm_test_pin_${S}`;
const KEY2 = `rm_test_other_${S}`;

let app: Awaited<ReturnType<typeof buildServer>>;
const as = (key: string, st?: string) => ({ authorization: `Bearer ${key}`, ...(st ? { "x-rootmail-subtenant": st } : {}) });
const get = (url: string, headers: Record<string, string>) => app.inject({ method: "GET", url, headers });
const t0 = Date.parse("2026-10-01T00:00:00Z");
const at = (min: number) => new Date(t0 + min * 60_000);

before(async () => {
  await db.insert(organizations).values([
    { id: ORG, name: "List Fixture", slug: S, plan: "enterprise" },
    { id: ORG2, name: "Other Fixture", slug: `${S}-o`, plan: "enterprise" },
  ]);
  await db.insert(orgAddons).values({ id: `adn_${S}`, organizationId: ORG, addonId: "subtenant_pack", quantity: 5 });
  await db.insert(workspaces).values([
    { id: WS, organizationId: ORG, name: "Fx", slug: S, environment: "test" },
    { id: WS2, organizationId: ORG2, name: "Other", slug: `${S}-o`, environment: "test" },
  ]);
  for (const id of [A, B]) {
    await db.insert(subTenants).values({
      id, workspaceId: WS, name: id, sendingDomain: `${id}.example.test`, status: "verified",
      verificationToken: "fx", dkimSelector: "rm1", dkimPublicKey: "fx", dkimPrivateKey: "fx",
    });
  }
  await db.insert(apiKeys).values([
    { id: `key_${S}`, workspaceId: WS, name: "ws", prefix: "rm_test", last4: KEY.slice(-4), keyHash: hashApiKey(KEY), mode: "test" },
    { id: `keyp_${S}`, workspaceId: WS, subTenantId: A, name: "pinned A", prefix: "rm_test", last4: PINNED.slice(-4), keyHash: hashApiKey(PINNED), mode: "test" },
    { id: `key2_${S}`, workspaceId: WS2, name: "other", prefix: "rm_test", last4: KEY2.slice(-4), keyHash: hashApiKey(KEY2), mode: "test" },
  ]);
  // 60 workspace-level rows (minute i), 3 for A, 2 for B, 4 in another workspace.
  const rows: (typeof suppressions.$inferInsert)[] = [];
  for (let i = 0; i < 60; i++) {
    rows.push({ id: `sup_w${String(i).padStart(2, "0")}_${S}`, workspaceId: WS, subTenantId: null, email: `w${i}@ws.test`,
      reason: i % 3 === 0 ? "complaint" : "bounce", source: "ses", createdAt: at(i) });
  }
  rows.push(
    { id: `sup_a1_${S}`, workspaceId: WS, subTenantId: A, email: "a1@a.test", reason: "bounce", source: "ses", createdAt: at(100) },
    { id: `sup_a2_${S}`, workspaceId: WS, subTenantId: A, email: "a2@a.test", reason: "unsubscribe", source: "unsubscribe_link", createdAt: at(101) },
    { id: `sup_a3_${S}`, workspaceId: WS, subTenantId: A, email: "a_3%@a.test", reason: "manual", source: "import", createdAt: at(102) },
    { id: `sup_b1_${S}`, workspaceId: WS, subTenantId: B, email: "b1@b.test", reason: "complaint", source: "ses", createdAt: at(103) },
    { id: `sup_b2_${S}`, workspaceId: WS, subTenantId: B, email: "b2@b.test", reason: "bounce", source: "ses", createdAt: at(104) },
  );
  for (let i = 0; i < 4; i++) {
    rows.push({ id: `sup_x${i}_${S}`, workspaceId: WS2, subTenantId: null, email: `secret${i}@other.test`, reason: "bounce", source: "ses", createdAt: at(200 + i) });
  }
  await db.insert(suppressions).values(rows);
  app = await buildServer();
  await app.ready();
});

after(async () => {
  await app?.close();
  await db.delete(workspaces).where(inArray(workspaces.id, [WS, WS2]));
  await db.delete(organizations).where(inArray(organizations.id, [ORG, ORG2]));
  await closeDb();
  // BullMQ/redis handles may linger from buildServer; don't hang the runner.
  setTimeout(() => process.exit(process.exitCode ?? 0), 200).unref();
});

type ListBody = { object: string; data: { id: string; email: string; reason: string; source: string | null; sub_tenant_id: string | null; created_at: string }[]; total: number; page: number; limit: number; has_more: boolean; scope: { sub_tenant_id: string | null } };

describe("GET /v1/suppressions", () => {
  it("401 without credentials and with a bad key", async () => {
    assert.equal((await get("/v1/suppressions", {})).statusCode, 401);
    assert.equal((await get("/v1/suppressions", as("rm_test_nope"))).statusCode, 401);
  });

  it("403 when a client-pinned key asks to act as a sibling", async () => {
    assert.equal((await get("/v1/suppressions", as(PINNED, B))).statusCode, 403);
  });

  it("400 when ?sub_tenant_id conflicts with the auth scope (same rule as /v1/deliverability)", async () => {
    assert.equal((await get(`/v1/suppressions?sub_tenant_id=${B}`, as(PINNED))).statusCode, 400);
  });

  it("workspace isolation: never returns another workspace's rows, either direction", async () => {
    const mine = (await get("/v1/suppressions?limit=100", as(KEY))).json() as ListBody;
    assert.equal(mine.total, 65);
    assert.ok(mine.data.every((r) => !r.email.endsWith("@other.test")));
    const theirs = (await get("/v1/suppressions?limit=100", as(KEY2))).json() as ListBody;
    assert.equal(theirs.total, 4);
    assert.ok(theirs.data.every((r) => r.email.endsWith("@other.test")));
    // Another workspace's sub-tenant id can't be borrowed by header or param.
    assert.equal((await get("/v1/suppressions", as(KEY2, A))).statusCode, 404);
    const viaParam = (await get(`/v1/suppressions?sub_tenant_id=${A}`, as(KEY2))).json() as ListBody;
    assert.equal(viaParam.total, 0);
  });

  it("sub-tenant scoping: header, pinned key and param each narrow to that client only", async () => {
    for (const res of [await get("/v1/suppressions", as(KEY, A)), await get("/v1/suppressions", as(PINNED)), await get(`/v1/suppressions?sub_tenant_id=${A}`, as(KEY))]) {
      assert.equal(res.statusCode, 200);
      const body = res.json() as ListBody;
      assert.equal(body.total, 3);
      assert.deepEqual(body.data.map((r) => r.sub_tenant_id), [A, A, A]);
      assert.equal(body.scope.sub_tenant_id, A);
    }
    const b = (await get("/v1/suppressions", as(KEY, B))).json() as ListBody;
    assert.deepEqual(b.data.map((r) => r.email), ["b2@b.test", "b1@b.test"]);
  });

  it("newest first, 50 per page by default, with total and has_more", async () => {
    const p1 = (await get("/v1/suppressions", as(KEY))).json() as ListBody;
    assert.equal(p1.limit, 50);
    assert.equal(p1.data.length, 50);
    assert.equal(p1.has_more, true);
    assert.equal(p1.data[0].email, "b2@b.test");
    const times = p1.data.map((r) => Date.parse(r.created_at));
    assert.deepEqual(times, [...times].sort((x, y) => y - x));
    const p2 = (await get("/v1/suppressions?page=2", as(KEY))).json() as ListBody;
    assert.equal(p2.data.length, 15);
    assert.equal(p2.has_more, false);
    assert.equal(p2.data.at(-1)!.email, "w0@ws.test");
    const ids = new Set([...p1.data, ...p2.data].map((r) => r.id));
    assert.equal(ids.size, 65, "pages don't overlap or skip");
    assert.equal(((await get("/v1/suppressions?page=9", as(KEY))).json() as ListBody).data.length, 0);
    assert.equal((await get("/v1/suppressions?limit=101", as(KEY))).statusCode, 422);
    assert.equal((await get("/v1/suppressions?page=0", as(KEY))).statusCode, 422);
  });

  it("returns email, reason, source and date; search is literal and case-insensitive", async () => {
    const r = (await get("/v1/suppressions?q=A2@", as(KEY))).json() as ListBody;
    assert.equal(r.total, 1);
    assert.deepEqual({ ...r.data[0], created_at: undefined, id: undefined }, {
      object: "suppression", email: "a2@a.test", reason: "unsubscribe", source: "unsubscribe_link", sub_tenant_id: A, created_at: undefined, id: undefined,
    } as never);
    // `%` and `_` are matched literally, not as wildcards.
    assert.equal(((await get(`/v1/suppressions?q=${encodeURIComponent("_3%")}`, as(KEY))).json() as ListBody).total, 1);
    assert.equal(((await get(`/v1/suppressions?q=${encodeURIComponent("%")}`, as(KEY))).json() as ListBody).total, 1);
    assert.equal(((await get("/v1/suppressions?reason=complaint", as(KEY))).json() as ListBody).total, 21);
  });

  it("is read-only: no write verbs on the collection", async () => {
    for (const method of ["POST", "DELETE", "PATCH", "PUT"] as const) {
      const res = await app.inject({ method, url: "/v1/suppressions", headers: as(KEY) });
      assert.equal(res.statusCode, 404, `${method} /v1/suppressions`);
    }
  });
});

describe("characterization: GET /v1/deliverability suppression counts are unchanged", () => {
  it("workspace, client-scoped and pinned counts match the list totals", async () => {
    const ws = (await get("/v1/deliverability", as(KEY))).json() as { suppressions: { total: number; by_reason: Record<string, number> } };
    assert.equal(ws.suppressions.total, 65);
    assert.equal(ws.suppressions.by_reason.bounce, 40 + 1 + 1);
    assert.equal(ws.suppressions.by_reason.complaint, 20 + 1);
    const a = (await get("/v1/deliverability", as(KEY, A))).json() as typeof ws;
    assert.equal(a.suppressions.total, 3);
    const pinned = (await get("/v1/deliverability", as(PINNED))).json() as typeof ws;
    assert.equal(pinned.suppressions.total, 3);
    assert.equal((await get(`/v1/deliverability?sub_tenant_id=${B}`, as(PINNED))).statusCode, 400);
    const list = (await get("/v1/suppressions", as(KEY))).json() as ListBody;
    assert.equal(list.total, ws.suppressions.total);
  });
});
