import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { closeQueues, closeRedis, hashApiKey } from "@rootmail/core";
import { apiKeys, closeDb, db, messages, organizations, workspaces } from "@rootmail/db";
import { buildServer } from "../server";

/**
 * Idempotency on POST /v1/messages, over the HTTP contract we publish.
 *
 * The docs advertised an `Idempotency-Key` REQUEST HEADER in two places and the
 * SDK has always sent it — and nothing in `apps/api` ever read it. The SDK was
 * safe by accident, because `Messages.create` also puts the key in the body, so
 * the one path anybody tested worked for the wrong reason. Anyone following the
 * documented HTTP contract and sending only the header got no idempotency at
 * all: a duplicate email on every retry, silently, which is the precise failure
 * this endpoint exists to prevent.
 *
 * It is tested through the real server via `app.inject()` rather than by unit-
 * testing a helper, because the defect was never in a helper — it was that the
 * route read one input and the docs promised two. Only the HTTP surface shows
 * that.
 *
 * Nothing is sent. The API enqueues; no worker runs in tests. The fixture
 * workspace is `environment: "test"` so the send is sandboxed regardless, and
 * `from` is omitted so it falls back to the platform no-reply and needs no
 * verified sender.
 */

const SUFFIX = `idem${Date.now()}`;
const ORG = `org_${SUFFIX}`;
const WS = `ws_${SUFFIX}`;
const KEY = `rm_test_${SUFFIX}`;

type App = Awaited<ReturnType<typeof buildServer>>;
let app: App;

const auth = { authorization: `Bearer ${KEY}` };

/** A minimal, valid send. `from` omitted on purpose — see the note above. */
const send = (headers: Record<string, string>, body: Record<string, unknown>) =>
  app.inject({
    method: "POST",
    url: "/v1/messages",
    headers: { ...auth, ...headers },
    payload: { to: "someone@example.test", subject: "hello", html: "<p>hi</p>", ...body },
  });

async function seed() {
  await db.insert(organizations).values({
    id: ORG,
    name: "Idempotency Fixture",
    slug: SUFFIX,
    plan: "enterprise",
  });
  await db.insert(workspaces).values({
    id: WS,
    organizationId: ORG,
    name: "Fixture",
    slug: SUFFIX,
    environment: "test",
  });
  await db.insert(apiKeys).values({
    id: `key_${SUFFIX}`,
    workspaceId: WS,
    name: "fixture",
    prefix: "rm_test",
    keyHash: hashApiKey(KEY),
    last4: KEY.slice(-4),
    mode: "test",
  });
}

async function teardown() {
  await db.delete(messages).where(eq(messages.workspaceId, WS));
  await db.delete(apiKeys).where(eq(apiKeys.workspaceId, WS));
  await db.delete(workspaces).where(eq(workspaces.id, WS));
  await db.delete(organizations).where(inArray(organizations.id, [ORG]));
}

before(async () => {
  await teardown().catch(() => {});
  await seed();
  app = await buildServer();
  await app.ready();
});

after(async () => {
  await teardown().catch(() => {});
  await app?.close();
  // This suite ENQUEUES, which the other API suites do not — a BullMQ queue
  // holds its own Redis connection and the run hangs with no output without it.
  await closeQueues();
  // `getRedis()` is a process singleton (enqueue, idempotency cache, rate
  // limits). Nothing closed it, so the run hung with no output.
  await closeRedis();
  await closeDb();
});

describe("idempotency — the header the docs promise is honoured", () => {
  it("replays the same message for a repeated Idempotency-Key HEADER", async () => {
    const key = `hdr-${SUFFIX}`;
    const first = await send({ "idempotency-key": key }, {});
    assert.equal(first.statusCode, 202, first.body);
    const firstId = first.json().id as string;

    const second = await send({ "idempotency-key": key }, {});
    assert.equal(second.statusCode, 200, second.body);
    assert.equal(
      second.json().id,
      firstId,
      "a retry with the same header must return the SAME message, not send a second one",
    );
    assert.equal(second.headers["idempotent-replayed"], "true");

    const rows = await db.select().from(messages).where(eq(messages.idempotencyKey, key));
    assert.equal(rows.length, 1, "exactly one message may exist for one key");
  });

  it("still honours the body field, which is what the SDK relied on", async () => {
    const key = `body-${SUFFIX}`;
    const first = await send({}, { idempotency_key: key });
    assert.equal(first.statusCode, 202, first.body);

    const second = await send({}, { idempotency_key: key });
    assert.equal(second.statusCode, 200);
    assert.equal(second.json().id, first.json().id);
    assert.equal(second.headers["idempotent-replayed"], "true");
  });

  it("lets the body field win when both are sent, so no existing caller changes", async () => {
    const bodyKey = `both-body-${SUFFIX}`;
    const first = await send({}, { idempotency_key: bodyKey });
    assert.equal(first.statusCode, 202, first.body);

    // Same body key, a DIFFERENT header key: the body still decides, so this is
    // a replay rather than a new send.
    const second = await send({ "idempotency-key": `both-header-${SUFFIX}` }, { idempotency_key: bodyKey });
    assert.equal(second.statusCode, 200);
    assert.equal(second.json().id, first.json().id);

    const stray = await db
      .select()
      .from(messages)
      .where(eq(messages.idempotencyKey, `both-header-${SUFFIX}`));
    assert.equal(stray.length, 0, "the header must not create a second record when a body key is present");
  });

  it("treats different keys as different sends", async () => {
    const a = await send({ "idempotency-key": `a-${SUFFIX}` }, {});
    const b = await send({ "idempotency-key": `b-${SUFFIX}` }, {});
    assert.equal(a.statusCode, 202);
    assert.equal(b.statusCode, 202);
    assert.notEqual(a.json().id, b.json().id);
  });

  it("does not treat a blank header as a key", async () => {
    // An empty or whitespace header is absent, not a key everything collides on
    // — otherwise two unrelated sends from a client that always sets the header
    // would silently become one.
    const first = await send({ "idempotency-key": "   " }, {});
    const second = await send({ "idempotency-key": "   " }, {});
    assert.equal(first.statusCode, 202);
    assert.equal(second.statusCode, 202, "a blank key must not replay");
    assert.notEqual(second.json().id, first.json().id);
  });
});
