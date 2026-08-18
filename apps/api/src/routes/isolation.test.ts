import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { hashApiKey } from "@rootmail/core";
import {
  apiKeys,
  audienceMembers,
  auditEntries,
  closeDb,
  contacts,
  db,
  listContacts,
  lists,
  messages,
  orgAddons,
  organizations,
  subTenants,
  workspaces,
} from "@rootmail/db";
import { buildServer } from "../server";

/**
 * Tenant read isolation (brief P1.3), guarding the leak closed in P1.4.
 *
 * `getScopedMessage()` filtered on workspace alone, so a caller acting as client A
 * could fetch client B's message, audit trail and SIGNED PROOF BUNDLE by id. It is
 * the single worst failure a proof-and-compliance product can have, it produced no
 * error when it was wrong, and nothing would have caught it coming back. Hence
 * these run against a real database through the real HTTP stack — a unit test of
 * the helper would not have noticed that three of the four routes shared it.
 *
 * Fixtures are created and torn down here; nothing depends on seed data.
 */

const SUFFIX = `iso${Date.now()}`;
const ORG = `org_${SUFFIX}`;
const WS = `ws_${SUFFIX}`;
const TENANT_A = `tnt_a_${SUFFIX}`;
const TENANT_B = `tnt_b_${SUFFIX}`;
const MSG_A = `msg_a_${SUFFIX}`;
const MSG_B = `msg_b_${SUFFIX}`;
const KEY = `rm_test_${SUFFIX}`;
const PINNED_KEY = `rm_test_pinned_${SUFFIX}`;
const LIST_STATIC = `lst_static_${SUFFIX}`;
const LIST_RULE = `lst_rule_${SUFFIX}`;

type App = Awaited<ReturnType<typeof buildServer>>;
let app: App;

/** Act as a given client (or as the whole workspace when null). */
const asClient = (subTenantId: string | null) => ({
  authorization: `Bearer ${KEY}`,
  ...(subTenantId ? { "x-rootmail-subtenant": subTenantId } : {}),
});

async function seed() {
  await db.insert(organizations).values({
    id: ORG,
    name: "Isolation Fixture",
    slug: SUFFIX,
    // Sub-tenancy comes with the plan…
    plan: "enterprise",
  });
  // …no: both of the things this suite exercises are separately purchased
  // add-ons, even on enterprise. Without them the gated routes answer 402 and the
  // isolation assertions below would pass for entirely the wrong reason — a 402
  // is not proof that a tenant boundary held.
  await db.insert(orgAddons).values([
    { id: `adn_proof_${SUFFIX}`, organizationId: ORG, addonId: "proof_exports", quantity: 1 },
    { id: `adn_sub_${SUFFIX}`, organizationId: ORG, addonId: "subtenant_pack", quantity: 5 },
  ]);
  await db.insert(workspaces).values({
    id: WS,
    organizationId: ORG,
    name: "Fixture",
    slug: SUFFIX,
    environment: "test",
  });

  for (const [id, name] of [
    [TENANT_A, "Client A"],
    [TENANT_B, "Client B"],
  ] as const) {
    await db.insert(subTenants).values({
      id,
      workspaceId: WS,
      name,
      sendingDomain: `${id}.example.test`,
      status: "verified",
      verificationToken: "fixture",
      dkimSelector: "rm1",
      dkimPublicKey: "fixture",
      dkimPrivateKey: "fixture",
    });
  }

  for (const [id, tenant] of [
    [MSG_A, TENANT_A],
    [MSG_B, TENANT_B],
  ] as const) {
    await db.insert(messages).values({
      id,
      workspaceId: WS,
      subTenantId: tenant,
      toEmail: `someone@${tenant}.example.test`,
      fromEmail: `no-reply@${tenant}.example.test`,
      subject: `private to ${tenant}`,
      status: "delivered",
    });
    await db.insert(auditEntries).values({
      id: `aud_${id}`,
      workspaceId: WS,
      subTenantId: tenant,
      messageId: id,
      event: "delivered",
      actor: "system",
    });
  }

  await db.insert(apiKeys).values([
    {
      id: `key_${SUFFIX}`,
      workspaceId: WS,
      name: "workspace fixture",
      prefix: "rm_test",
      last4: KEY.slice(-4),
      keyHash: hashApiKey(KEY),
      mode: "test",
    },
    // A key handed to client A: pinned, so the header cannot move it.
    {
      id: `key_pinned_${SUFFIX}`,
      workspaceId: WS,
      subTenantId: TENANT_A,
      name: "client A key",
      prefix: "rm_test",
      last4: PINNED_KEY.slice(-4),
      keyHash: hashApiKey(PINNED_KEY),
      mode: "test",
    },
  ]);

  // Audience fixtures: one static membership list, one self-describing rule.
  await db.insert(lists).values([
    { id: LIST_STATIC, workspaceId: WS, name: "Static", subTenantId: null },
    {
      id: LIST_RULE,
      workspaceId: WS,
      name: "Rule",
      subTenantId: null,
      filter: { match: "all", conditions: [{ field: "email", op: "contains", value: "keep" }] },
    },
  ]);
  await db.insert(contacts).values([
    { id: `c_keep_${SUFFIX}`, workspaceId: WS, subTenantId: null, email: `keep@${SUFFIX}.test` },
    { id: `c_drop_${SUFFIX}`, workspaceId: WS, subTenantId: null, email: `drop@${SUFFIX}.test` },
    {
      id: `c_gone_${SUFFIX}`,
      workspaceId: WS,
      subTenantId: null,
      email: `keep-gone@${SUFFIX}.test`,
      status: "unsubscribed",
    },
  ]);
  await db.insert(listContacts).values({
    id: `lc_${SUFFIX}`,
    listId: LIST_STATIC,
    contactId: `c_keep_${SUFFIX}`,
  });
}

async function teardown() {
  // The workspace cascade takes messages, audit, keys, tenants, lists, contacts.
  await db.delete(workspaces).where(eq(workspaces.id, WS));
  await db.delete(organizations).where(eq(organizations.id, ORG));
}

before(async () => {
  await teardown().catch(() => {});
  await seed();
  app = await buildServer();
  await app.ready();
});

after(async () => {
  await app?.close();
  await teardown();
  await closeDb();
});

describe("tenant read isolation — one client may never read another's", () => {
  const routes: { label: string; method: "GET" | "POST"; path: (id: string) => string }[] = [
    { label: "the message itself", method: "GET", path: (id) => `/v1/messages/${id}` },
    { label: "the audit trail", method: "GET", path: (id) => `/v1/messages/${id}/audit` },
    { label: "the signed proof bundle", method: "GET", path: (id) => `/v1/messages/${id}/proof` },
  ];

  for (const r of routes) {
    it(`404s when client A asks for client B's ${r.label}`, async () => {
      const res = await app.inject({
        method: r.method,
        url: r.path(MSG_B),
        headers: asClient(TENANT_A),
      });
      assert.equal(res.statusCode, 404, `expected 404, got ${res.statusCode}: ${res.body}`);
      // And nothing of B's leaked into the error body.
      assert.ok(!res.body.includes(TENANT_B), "the response must not mention the other tenant");
    });

    it(`still serves client A their OWN ${r.label}`, async () => {
      const res = await app.inject({
        method: r.method,
        url: r.path(MSG_A),
        headers: asClient(TENANT_A),
      });
      assert.equal(res.statusCode, 200, `expected 200, got ${res.statusCode}: ${res.body}`);
    });
  }

  it("404s when client A tries to RECORD an event on client B's message", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/v1/messages/${MSG_B}/events`,
      headers: { ...asClient(TENANT_A), "content-type": "application/json" },
      payload: { event: "opened" },
    });
    assert.equal(res.statusCode, 404, `expected 404, got ${res.statusCode}: ${res.body}`);
  });

  it("lets the PARENT (no client header) read either client", async () => {
    // Scoping narrows; it must not lock the workspace owner out of its own data.
    for (const id of [MSG_A, MSG_B]) {
      const res = await app.inject({ method: "GET", url: `/v1/messages/${id}`, headers: asClient(null) });
      assert.equal(res.statusCode, 200, `parent should read ${id}, got ${res.statusCode}`);
    }
  });

  it("omits the other client's mail from the list", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/messages", headers: asClient(TENANT_A) });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body) as { data: { id: string }[] };
    const ids = body.data.map((m) => m.id);
    assert.ok(ids.includes(MSG_A), "A should see their own message");
    assert.ok(!ids.includes(MSG_B), "A must not see B's message");
  });
});

describe("signed compliance export — scope is pinned by the caller's identity", () => {
  const range = `from=${new Date(Date.now() - 86_400_000).toISOString()}`;

  it("never includes a sibling's mail, even with no sub_tenant_id given", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/exports/compliance?${range}`,
      headers: asClient(TENANT_A),
    });
    assert.equal(res.statusCode, 200, res.body);
    const body = JSON.parse(res.body) as { bundle: { sub_tenant_id: string; messages: { id: string }[] } };
    const ids = body.bundle.messages.map((m) => m.id);
    assert.ok(!ids.includes(MSG_B), "a signed bundle must never carry a sibling's mail");
    // The bundle must describe what it actually contains, not what was asked for.
    assert.equal(body.bundle.sub_tenant_id, TENANT_A);
  });

  it("refuses an explicit request for a different client", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/exports/compliance?${range}&sub_tenant_id=${TENANT_B}`,
      headers: asClient(TENANT_A),
    });
    assert.equal(res.statusCode, 400, `expected 400, got ${res.statusCode}: ${res.body}`);
  });
});

describe("client-scoped API keys — the scope lives in the credential", () => {
  /** A key pinned to client A. The header is the attack surface being closed. */
  const pinned = (header?: string) => ({
    authorization: `Bearer ${PINNED_KEY}`,
    ...(header ? { "x-rootmail-subtenant": header } : {}),
  });

  it("reads its own client's data with NO header at all", async () => {
    // The pin, not the header, is what supplies scope.
    const res = await app.inject({ method: "GET", url: `/v1/messages/${MSG_A}`, headers: pinned() });
    assert.equal(res.statusCode, 200, res.body);
  });

  it("cannot reach a sibling's message even though the key is workspace-valid", async () => {
    const res = await app.inject({ method: "GET", url: `/v1/messages/${MSG_B}`, headers: pinned() });
    assert.equal(res.statusCode, 404, `expected 404, got ${res.statusCode}: ${res.body}`);
  });

  it("REFUSES a header naming another client rather than ignoring it", async () => {
    // Silently ignoring would be safe but dishonest: a caller who believes they
    // are reading B must be told they are not, never handed A's data as B's.
    const res = await app.inject({
      method: "GET",
      url: `/v1/messages/${MSG_A}`,
      headers: pinned(TENANT_B),
    });
    assert.equal(res.statusCode, 403, `expected 403, got ${res.statusCode}: ${res.body}`);
  });

  it("accepts a header that agrees with the pin", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/messages/${MSG_A}`,
      headers: pinned(TENANT_A),
    });
    assert.equal(res.statusCode, 200, res.body);
  });

  it("lists only its own client's mail", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/messages", headers: pinned() });
    const body = JSON.parse(res.body) as { data: { id: string }[] };
    const ids = body.data.map((m) => m.id);
    assert.ok(ids.includes(MSG_A));
    assert.ok(!ids.includes(MSG_B));
  });

  it("cannot see the platform's own API keys", async () => {
    // Handing a client a scoped key must not hand them an inventory of the
    // platform's credentials.
    const res = await app.inject({ method: "GET", url: "/v1/api-keys", headers: pinned() });
    assert.equal(res.statusCode, 200, res.body);
    const body = JSON.parse(res.body) as { data: { id: string; sub_tenant_id: string | null }[] };
    assert.ok(body.data.length > 0, "it should still see its own key");
    assert.ok(
      body.data.every((k) => k.sub_tenant_id === TENANT_A),
      "a client-scoped key must only list keys for its own client",
    );
  });

  it("cannot revoke the platform's workspace key", async () => {
    // Otherwise one of the customer's customers can deny service to the customer.
    const res = await app.inject({
      method: "DELETE",
      url: `/v1/api-keys/key_${SUFFIX}`,
      headers: pinned(),
    });
    assert.equal(res.statusCode, 404, `expected 404, got ${res.statusCode}: ${res.body}`);
    const [still] = await db.select().from(apiKeys).where(eq(apiKeys.id, `key_${SUFFIX}`));
    assert.equal(still?.revokedAt, null, "the workspace key must still be live");
  });

  it("cannot mint a wider key than itself", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/api-keys",
      headers: { ...pinned(), "content-type": "application/json" },
      payload: { name: "escalation attempt" },
    });
    assert.equal(res.statusCode, 403, `expected 403, got ${res.statusCode}: ${res.body}`);
  });

  it("a workspace key CAN still act as any client — the pin is opt-in", async () => {
    for (const tenant of [TENANT_A, TENANT_B]) {
      const res = await app.inject({
        method: "GET",
        url: "/v1/messages",
        headers: asClient(tenant),
      });
      assert.equal(res.statusCode, 200, `workspace key should act as ${tenant}`);
    }
  });

  it("refuses to mint a key pinned to another workspace's client", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/api-keys",
      headers: { ...asClient(null), "content-type": "application/json" },
      payload: { name: "cross-workspace", sub_tenant_id: "tnt_does_not_exist" },
    });
    assert.equal(res.statusCode, 404, `expected 404, got ${res.statusCode}: ${res.body}`);
  });
});

describe("audience resolution — membership and rule audiences agree on 'who'", () => {
  it("resolves a static list from its membership rows", async () => {
    const members = await audienceMembers({
      id: LIST_STATIC,
      workspaceId: WS,
      subTenantId: null,
      filter: null,
    });
    assert.deepEqual(
      members.map((m) => m.email),
      [`keep@${SUFFIX}.test`],
    );
  });

  it("resolves a rule audience from the rule, not from membership rows", async () => {
    // The silent-zero failure this guards: a self-describing audience holds NO
    // membership rows, so anything resolving by joining list_contacts returns
    // nobody and reports success.
    const members = await audienceMembers({
      id: LIST_RULE,
      workspaceId: WS,
      subTenantId: null,
      filter: { match: "all", conditions: [{ field: "email", op: "contains", value: "keep" }] },
    });
    const emails = members.map((m) => m.email).sort();
    assert.ok(emails.length > 0, "a rule audience must not silently resolve to nobody");
    assert.ok(emails.includes(`keep@${SUFFIX}.test`));
    assert.ok(!emails.includes(`drop@${SUFFIX}.test`), "non-matching contacts are excluded");
  });

  it("a rule can never opt out of excluding people who left", async () => {
    const members = await audienceMembers({
      id: LIST_RULE,
      workspaceId: WS,
      subTenantId: null,
      filter: { match: "all", conditions: [{ field: "email", op: "contains", value: "keep" }] },
    });
    assert.ok(
      !members.map((m) => m.email).includes(`keep-gone@${SUFFIX}.test`),
      "an unsubscribed contact matched the rule but must still be excluded",
    );
  });

  it("scopes a rule audience to its own workspace", async () => {
    const members = await audienceMembers({
      id: LIST_RULE,
      workspaceId: WS,
      subTenantId: null,
      filter: { match: "all", conditions: [{ field: "email", op: "contains", value: "@" }] },
    });
    assert.ok(
      members.every((m) => m.email.endsWith(`${SUFFIX}.test`)),
      "a rule must never reach outside its workspace",
    );
  });
});
