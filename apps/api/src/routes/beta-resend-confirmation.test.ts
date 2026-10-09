import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it, mock } from "node:test";
import { SESv2Client } from "@aws-sdk/client-sesv2";
import { eq, inArray } from "drizzle-orm";
import { closeQueues, closeRedis, env, getRedis, newId } from "@rootmail/core";
import { closeDb, contacts, db, ensureInternalAccount, senderIdentities, staffUsers } from "@rootmail/db";
import { createStaffSession } from "../lib/admin-auth";
import {
  CONFIRMATION_REQUESTED_AT,
  RESEND_LIMITS,
  resendAddressKey,
  resendIpKey,
  resendTesterConfirmation,
  settleResends,
} from "../lib/beta-resend";
import { BETA_INVITED_TAG, BETA_WAITLIST_TAG, betaWaitlistAudience } from "../lib/beta-waitlist";
import { TESTER_LINK_TTL_MS } from "../lib/ses-provisioning";
import { buildServer } from "../server";
import { RESEND_NEUTRAL } from "./beta-waitlist";

// Every AWS call is intercepted. No verification email can be sent and no
// identity anywhere is created or deleted; `writes` records what WOULD have been.
type Identity = { type: "EMAIL_ADDRESS" | "DOMAIN"; status: "PENDING" | "FAILED" | "SUCCESS" };
const identities = new Map<string, Identity>();
let writes: Array<{ op: "create" | "delete"; email: string }> = [];

const stamp = Date.now();
const addr = (name: string) => `resend-${name}-${stamp}@example.test`;
const emails = {
  failed: addr("failed"),
  lapsed: addr("lapsed"),
  fresh: addr("fresh"),
  verified: addr("verified"),
  invited: addr("invited"),
  missing: addr("missing"),
  sender: addr("sender"),
  domainType: addr("domaintype"),
  stranger: addr("stranger"),
  route: addr("route"),
  limited: addr("limited"),
  admitNew: addr("admit-new"),
  admitExisting: addr("admit-existing"),
};
const own = () => `resend-${stamp}@${env.ROOTMAIL_DOMAIN}`;
const allEmails = () => [...Object.values(emails), own()];

let app: Awaited<ReturnType<typeof buildServer>>;
let senderId: string | undefined;
const previous = { provider: env.MAIL_PROVIDER, sandbox: env.SES_SANDBOX_MODE, secret: env.INTERNAL_API_SECRET };

async function onWaitlist(email: string, opts: { tags?: string[]; createdAt?: Date; requestedAt?: Date } = {}) {
  const { workspaceId } = await betaWaitlistAudience();
  await db.insert(contacts).values({
    id: newId("contact"),
    workspaceId,
    email,
    tags: opts.tags ?? [BETA_WAITLIST_TAG],
    metadata: opts.requestedAt ? { [CONFIRMATION_REQUESTED_AT]: opts.requestedAt.toISOString() } : {},
    ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
  });
}

async function metadataOf(email: string): Promise<Record<string, unknown>> {
  const { workspaceId } = await betaWaitlistAudience();
  const rows = await db.select({ metadata: contacts.metadata, ws: contacts.workspaceId }).from(contacts).where(eq(contacts.email, email));
  return (rows.find((r) => r.ws === workspaceId)?.metadata ?? {}) as Record<string, unknown>;
}

const forwardedIps = ["203.0.113.7", "203.0.113.8", "203.0.113.9"];
async function clearLimits() {
  const redis = getRedis();
  await redis.del(resendIpKey("127.0.0.1"), ...forwardedIps.map(resendIpKey), ...allEmails().map(resendAddressKey));
}

const longAgo = () => new Date(Date.now() - TESTER_LINK_TTL_MS - 60_000);

before(async () => {
  env.MAIL_PROVIDER = "ses";
  env.SES_SANDBOX_MODE = "true";
  mock.method(SESv2Client.prototype, "send", async (command: { constructor: { name: string }; input: { EmailIdentity: string } }) => {
    const email = command.input.EmailIdentity;
    switch (command.constructor.name) {
      case "GetEmailIdentityCommand": {
        const id = identities.get(email);
        if (!id) throw Object.assign(new Error("Not found"), { name: "NotFoundException" });
        return { IdentityType: id.type, VerificationStatus: id.status, VerifiedForSendingStatus: id.status === "SUCCESS" };
      }
      case "CreateEmailIdentityCommand":
        if (identities.has(email)) throw Object.assign(new Error("exists"), { name: "AlreadyExistsException" });
        writes.push({ op: "create", email });
        identities.set(email, { type: "EMAIL_ADDRESS", status: "PENDING" });
        return {};
      case "DeleteEmailIdentityCommand":
        writes.push({ op: "delete", email });
        identities.delete(email);
        return {};
      default:
        throw new Error(`Unexpected AWS operation: ${command.constructor.name}`);
    }
  });

  await onWaitlist(emails.failed);
  identities.set(emails.failed, { type: "EMAIL_ADDRESS", status: "FAILED" });
  await onWaitlist(emails.lapsed, { createdAt: longAgo() });
  identities.set(emails.lapsed, { type: "EMAIL_ADDRESS", status: "PENDING" });
  await onWaitlist(emails.fresh);
  identities.set(emails.fresh, { type: "EMAIL_ADDRESS", status: "PENDING" });
  await onWaitlist(emails.verified);
  identities.set(emails.verified, { type: "EMAIL_ADDRESS", status: "SUCCESS" });
  await onWaitlist(emails.invited, { tags: [BETA_WAITLIST_TAG, BETA_INVITED_TAG] });
  identities.set(emails.invited, { type: "EMAIL_ADDRESS", status: "FAILED" });
  await onWaitlist(emails.missing, { createdAt: longAgo() });
  await onWaitlist(emails.sender, { createdAt: longAgo() });
  identities.set(emails.sender, { type: "EMAIL_ADDRESS", status: "FAILED" });
  await onWaitlist(emails.domainType, { createdAt: longAgo() });
  identities.set(emails.domainType, { type: "DOMAIN", status: "FAILED" });
  await onWaitlist(own(), { createdAt: longAgo() });
  identities.set(own(), { type: "EMAIL_ADDRESS", status: "FAILED" });
  await onWaitlist(emails.route, { createdAt: longAgo() });
  identities.set(emails.route, { type: "EMAIL_ADDRESS", status: "FAILED" });

  const internal = await ensureInternalAccount();
  senderId = newId("senderIdentity");
  await db.insert(senderIdentities).values({ id: senderId, organizationId: internal.organizationId, email: emails.sender, status: "pending" });

  await clearLimits();
  app = await buildServer();
  await app.ready();
});

beforeEach(() => {
  writes = [];
});

after(async () => {
  await settleResends();
  await clearLimits();
  await app?.close();
  await db.delete(contacts).where(inArray(contacts.email, allEmails()));
  if (senderId) await db.delete(senderIdentities).where(eq(senderIdentities.id, senderId));
  mock.restoreAll();
  env.MAIL_PROVIDER = previous.provider;
  env.SES_SANDBOX_MODE = previous.sandbox;
  env.INTERNAL_API_SECRET = previous.secret;
  await closeQueues();
  await closeRedis();
  await closeDb();
});

describe("resend Amazon confirmation — only for a dead link on the waitlist", () => {
  it("re-creates a FAILED identity so Amazon sends a fresh link, and records when", async () => {
    const before = Date.now();
    assert.equal(await resendTesterConfirmation(emails.failed), "sent");
    assert.deepEqual(writes, [
      { op: "delete", email: emails.failed },
      { op: "create", email: emails.failed },
    ]);
    const at = Date.parse(String((await metadataOf(emails.failed))[CONFIRMATION_REQUESTED_AT]));
    assert.ok(at >= before - 1000, "requested-at is stamped");
  });

  it("then holds off for 24 hours: the new link is pending and still alive", async () => {
    assert.equal(await resendTesterConfirmation(emails.failed), "already_pending");
    assert.deepEqual(writes, []);
  });

  it("re-creates a PENDING identity whose link is older than 24 hours", async () => {
    assert.equal(await resendTesterConfirmation(emails.lapsed), "sent");
    assert.deepEqual(writes.map((w) => w.op), ["delete", "create"]);
  });

  it("treats the requested-at stamp, not signup time, as the clock", async () => {
    // Joined long ago, but the stamp says we asked an hour ago.
    const email = addr("stamped");
    await onWaitlist(email, { createdAt: longAgo(), requestedAt: new Date(Date.now() - 3_600_000) });
    identities.set(email, { type: "EMAIL_ADDRESS", status: "PENDING" });
    try {
      assert.equal(await resendTesterConfirmation(email), "already_pending");
      assert.equal(await resendTesterConfirmation(email, new Date(Date.now() + TESTER_LINK_TTL_MS)), "sent");
    } finally {
      await db.delete(contacts).where(eq(contacts.email, email));
    }
  });

  it("leaves a fresh pending link alone", async () => {
    assert.equal(await resendTesterConfirmation(emails.fresh), "already_pending");
    assert.deepEqual(writes, []);
  });

  it("does nothing for a verified or already-invited tester", async () => {
    assert.equal(await resendTesterConfirmation(emails.verified), "already_confirmed");
    assert.equal(await resendTesterConfirmation(emails.invited), "already_confirmed");
    assert.deepEqual(writes, []);
  });

  it("asks for a first link when the signup-time request never landed", async () => {
    assert.equal(await resendTesterConfirmation(emails.missing), "sent");
    assert.deepEqual(writes, [{ op: "create", email: emails.missing }]);
  });

  it("never acts on an address that is not on the waitlist", async () => {
    identities.set(emails.stranger, { type: "EMAIL_ADDRESS", status: "FAILED" });
    try {
      assert.equal(await resendTesterConfirmation(emails.stranger), "not_on_waitlist");
      assert.deepEqual(writes, []);
    } finally {
      identities.delete(emails.stranger);
    }
  });

  it("never touches our own domain, a customer's sender, or a non-email identity", async () => {
    assert.equal(await resendTesterConfirmation(own()), "protected");
    assert.equal(await resendTesterConfirmation(emails.sender), "protected");
    assert.equal(await resendTesterConfirmation(emails.domainType), "protected");
    assert.deepEqual(writes, []);
    assert.equal(identities.get(own())?.status, "FAILED");
  });

  it("does nothing once we are out of the sandbox", async () => {
    env.SES_SANDBOX_MODE = "false";
    try {
      assert.equal(await resendTesterConfirmation(emails.lapsed), "not_needed");
      assert.deepEqual(writes, []);
    } finally {
      env.SES_SANDBOX_MODE = "true";
    }
  });
});

describe("POST /v1/beta/waitlist/resend-confirmation", () => {
  const post = (email: string, extra: Record<string, unknown> = {}) =>
    app.inject({ method: "POST", url: "/v1/beta/waitlist/resend-confirmation", payload: { email, ...extra } });

  it("answers a waitlisted address and a stranger identically, then does the work", async () => {
    await clearLimits();
    const known = await post(emails.route.toUpperCase());
    const stranger = await post(emails.stranger);
    assert.equal(known.statusCode, 202);
    assert.equal(stranger.statusCode, 202);
    assert.equal(known.body, stranger.body);
    assert.deepEqual(known.json(), RESEND_NEUTRAL);
    await settleResends();
    assert.deepEqual(writes, [
      { op: "delete", email: emails.route },
      { op: "create", email: emails.route },
    ]);
  });

  it("drops a honeypot submission without doing anything", async () => {
    await clearLimits();
    const res = await post(emails.lapsed, { website: "http://spam.example" });
    assert.equal(res.statusCode, 202);
    assert.deepEqual(res.json(), RESEND_NEUTRAL);
    await settleResends();
    assert.deepEqual(writes, []);
  });

  it("rate-limits per address, for listed and unknown addresses alike", async () => {
    await clearLimits();
    for (let i = 0; i < RESEND_LIMITS.perAddress; i++) assert.equal((await post(emails.limited)).statusCode, 202);
    const limited = await post(emails.limited);
    assert.equal(limited.statusCode, 429);
    assert.equal(limited.json().error.details.scope, "address", "says which limit, so the page blames the right thing");
    assert.equal((await post(emails.stranger)).statusCode, 202, "another address is unaffected");
    await settleResends();
  });

  it("rate-limits per IP", async () => {
    await clearLimits();
    let last = { statusCode: 0, json: () => ({}) as { error?: { details?: { scope?: string } } } };
    for (let i = 0; i <= RESEND_LIMITS.perIp; i++) {
      last = await post(`resend-ip-${i}-${stamp}@example.test`);
    }
    assert.equal(last.statusCode, 429);
    assert.equal(last.json().error?.details?.scope, "ip");
    await settleResends();
    assert.deepEqual(writes, [], "unknown addresses never reach AWS writes");
  });

  it("counts the visitor IP the marketing server forwards — but only with the internal secret", async () => {
    await clearLimits();
    env.INTERNAL_API_SECRET = `test-secret-${stamp}`;
    try {
      const as = (ip: string, secret: string | undefined, i: number) =>
        app.inject({
          method: "POST",
          url: "/v1/beta/waitlist/resend-confirmation",
          headers: { "x-rootmail-client-ip": ip, ...(secret ? { "x-rootmail-internal": secret } : {}) },
          payload: { email: `resend-fwd-${i}-${ip}-${stamp}@example.test` },
        });
      // One visitor uses up their own bucket…
      let last = 0;
      for (let i = 0; i <= RESEND_LIMITS.perIp; i++) last = (await as(forwardedIps[0]!, env.INTERNAL_API_SECRET, i)).statusCode;
      assert.equal(last, 429);
      // …and the next visitor through the same marketing server is unaffected.
      assert.equal((await as(forwardedIps[1]!, env.INTERNAL_API_SECRET, 0)).statusCode, 202);

      // A forged header (wrong or missing secret) is ignored: counted against the caller's own address.
      const redis = getRedis();
      const before = Number((await redis.get(resendIpKey("127.0.0.1"))) ?? 0);
      assert.equal((await as(forwardedIps[2]!, "wrong-secret", 0)).statusCode, 202);
      assert.equal((await as(forwardedIps[2]!, undefined, 1)).statusCode, 202);
      assert.equal(await redis.get(resendIpKey(forwardedIps[2]!)), null);
      assert.equal(Number(await redis.get(resendIpKey("127.0.0.1"))), before + 2);
    } finally {
      env.INTERNAL_API_SECRET = previous.secret;
      await settleResends();
    }
  });
});

describe("staff admit starts the 24-hour clock when it is what sent the link", () => {
  const staffId = newId("staffUser");
  let staff: { authorization: string };
  const admit = (contactId: string) =>
    app.inject({ method: "POST", url: `/v1/admin/beta/waitlist/${contactId}/admit`, headers: staff, payload: {} });
  const contactId = async (email: string) => {
    const { workspaceId } = await betaWaitlistAudience();
    const rows = await db.select({ id: contacts.id, ws: contacts.workspaceId }).from(contacts).where(eq(contacts.email, email));
    return rows.find((r) => r.ws === workspaceId)!.id;
  };

  before(async () => {
    await db.insert(staffUsers).values({ id: staffId, email: `staff-resend-${stamp}@example.test`, passwordHash: "unused", role: "superadmin" });
    staff = { authorization: `Bearer ${(await createStaffSession(staffId)).token}` };
  });
  after(async () => {
    await db.delete(staffUsers).where(eq(staffUsers.id, staffId));
  });

  it("stamps the request when admit creates the identity, so a resend can't replace it early", async () => {
    // Added long ago (e.g. by hand), never asked Amazon for a link.
    await onWaitlist(emails.admitNew, { createdAt: longAgo() });
    const res = await admit(await contactId(emails.admitNew));
    assert.equal(res.statusCode, 202, res.body);
    assert.equal(res.json().status, "pending_verification");
    assert.deepEqual(writes, [{ op: "create", email: emails.admitNew }]);
    const at = Date.parse(String((await metadataOf(emails.admitNew))[CONFIRMATION_REQUESTED_AT]));
    assert.ok(Date.now() - at < 60_000, "stamped at admit time");

    // Without the stamp, the old createdAt would make this link look lapsed.
    writes = [];
    assert.equal(await resendTesterConfirmation(emails.admitNew), "already_pending");
    assert.deepEqual(writes, []);
  });

  it("does not stamp when the link was already pending — admit sent nothing", async () => {
    await onWaitlist(emails.admitExisting, { createdAt: longAgo() });
    identities.set(emails.admitExisting, { type: "EMAIL_ADDRESS", status: "PENDING" });
    const res = await admit(await contactId(emails.admitExisting));
    assert.equal(res.statusCode, 202, res.body);
    assert.deepEqual(writes, []);
    assert.equal((await metadataOf(emails.admitExisting))[CONFIRMATION_REQUESTED_AT], undefined);
    // So the lapsed link can still be replaced.
    assert.equal(await resendTesterConfirmation(emails.admitExisting), "sent");
  });
});
