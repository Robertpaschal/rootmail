import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { betaSenderAddress, closeQueues, closeRedis, env, newId } from "@rootmail/core";
import { closeDb, db, organizations, senderIdentities, users } from "@rootmail/db";
import { provisionAccount } from "../lib/auth";
import { assertSenderAllowed } from "../lib/senders";

// Least privilege for beta addresses: an org with an activated beta address
// may send as it in exactly the two issued forms (apex legacy, and
// INBOUND_DOMAIN = reply.rootmail.io in prod), never on another subdomain.
const stamp = Date.now();
const apex = () => env.ROOTMAIL_DOMAIN.toLowerCase();
let account: Awaited<ReturnType<typeof provisionAccount>>;
let other: Awaited<ReturnType<typeof provisionAccount>>;
let savedInbound: string | undefined;

before(async () => {
  savedInbound = env.INBOUND_DOMAIN;
  env.INBOUND_DOMAIN = `reply.${apex()}`;
  account = await provisionAccount({ email: `bas-${stamp}@example.test`, passwordHash: null, betaInviteId: "local-test-invite", name: "BAS" });
  other = await provisionAccount({ email: `bas-other-${stamp}@example.test`, passwordHash: null, betaInviteId: "local-test-invite", name: "BAS other" });
  await db.insert(senderIdentities).values({
    id: newId("senderIdentity"), organizationId: account.organizationId,
    email: betaSenderAddress(account.organizationId, `reply.${apex()}`), status: "verified", isDefault: true,
  } as typeof senderIdentities.$inferInsert);
});

after(async () => {
  for (const a of [account, other]) {
    await db.delete(organizations).where(eq(organizations.id, a.organizationId));
    await db.delete(users).where(eq(users.id, a.user.id));
  }
  env.INBOUND_DOMAIN = savedInbound;
  await closeQueues(); await closeRedis(); await closeDb();
});

describe("sending as a beta address", () => {
  it("its org may send as both issued forms", async () => {
    for (const d of [apex(), `reply.${apex()}`]) {
      await assertSenderAllowed({ fromEmail: betaSenderAddress(account.organizationId, d), organizationId: account.organizationId });
    }
  });
  it("never as the same address on any other subdomain", async () => {
    for (const d of [`foo.${apex()}`, `evil.${apex()}`, `x.reply.${apex()}`]) {
      await assert.rejects(assertSenderAllowed({ fromEmail: betaSenderAddress(account.organizationId, d), organizationId: account.organizationId }), /isn't a verified sender/, d);
    }
  });
  it("another org can't send as it in either form (unchanged)", async () => {
    for (const d of [apex(), `reply.${apex()}`]) {
      await assert.rejects(assertSenderAllowed({ fromEmail: betaSenderAddress(account.organizationId, d), organizationId: other.organizationId }), /isn't a verified sender/);
    }
  });
});
