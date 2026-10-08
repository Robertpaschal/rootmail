import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import { closeQueues, closeRedis, newId } from "@rootmail/core";
import {
  betaInviteAutomationStatus,
  closeDb,
  contacts,
  db,
  ensureBetaInviteAutomation,
  hasBetaInviteEnrollment,
  organizations,
  sequenceEnrollments,
  sequences,
  templates,
  users,
} from "@rootmail/db";
import { provisionAccount } from "../lib/auth";

// The invite automation is checked against a throwaway workspace, never the
// shared internal one, so these tests cannot race the waitlist sweep in
// beta-readiness.test.ts (test files run as parallel processes).
const stamp = Date.now();
let account: Awaited<ReturnType<typeof provisionAccount>>;
let workspaceId: string;

before(async () => {
  account = await provisionAccount({ email: `automation-${stamp}@example.test`, passwordHash: null, betaInviteId: "local-test-invite", name: "Automation fixture" });
  workspaceId = account.production.id;
});

after(async () => {
  if (account) {
    await db.delete(organizations).where(eq(organizations.id, account.organizationId));
    await db.delete(users).where(eq(users.id, account.user.id));
  }
  await closeQueues(); await closeRedis();
  await closeDb();
});

const inviteSequences = async () =>
  (await db.select().from(sequences).where(eq(sequences.workspaceId, workspaceId)))
    .filter((s) => (s.trigger as { tag?: string }).tag === "beta-waitlist");

describe("beta invite automation — exists without a hand-run seed, and says when it cannot send", () => {
  it("reports a database that never had it as not runnable", async () => {
    const status = await betaInviteAutomationStatus(workspaceId);
    assert.equal(status.ok, false);
    assert.deepEqual(status.problems.sort(), ["sequence_missing", "template_missing"]);
  });

  it("creates the template and sequence exactly once, even when ensured concurrently", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => ensureBetaInviteAutomation({ workspaceId })));
    assert.equal(results.filter((r) => r.created.includes("sequence")).length, 1);
    assert.ok(results.every((r) => r.ok), JSON.stringify(results.map((r) => r.problems)));
    assert.equal((await inviteSequences()).length, 1);
    assert.equal((await db.select().from(templates).where(and(eq(templates.workspaceId, workspaceId), eq(templates.slug, "beta-invite")))).length, 1);
    assert.deepEqual((await ensureBetaInviteAutomation({ workspaceId })).created, []);
  });

  it("leaves a staff pause or rename alone, and reports the pause", async () => {
    const [seq] = await inviteSequences();
    await db.update(sequences).set({ status: "paused", name: "Beta invite (renamed)" }).where(eq(sequences.id, seq.id));
    const ensured = await ensureBetaInviteAutomation({ workspaceId });
    assert.deepEqual(ensured.created, [], "a renamed sequence is still the invite sequence");
    assert.deepEqual(ensured.problems, ["sequence_paused"]);
    assert.equal((await inviteSequences()).length, 1);
    assert.equal((await db.select().from(sequences).where(eq(sequences.id, seq.id)))[0].status, "paused");
    await db.update(sequences).set({ status: "active", name: "Beta invite" }).where(eq(sequences.id, seq.id));
    assert.equal((await betaInviteAutomationStatus(workspaceId)).ok, true);
  });

  it("only the explicit reset re-activates the sequence", async () => {
    const [seq] = await inviteSequences();
    await db.update(sequences).set({ status: "paused" }).where(eq(sequences.id, seq.id));
    assert.equal((await ensureBetaInviteAutomation({ workspaceId, overwrite: true })).ok, true);
    assert.equal((await db.select().from(sequences).where(eq(sequences.id, seq.id)))[0].status, "active");
  });

  it("knows whether an address was ever enrolled in the invite, whatever the enrollment's status", async () => {
    const [seq] = await inviteSequences();
    const email = `enrolled-${stamp}@example.test`;
    assert.equal(await hasBetaInviteEnrollment(email, workspaceId), false);
    const contactId = newId("contact");
    await db.insert(contacts).values({ id: contactId, workspaceId, email });
    await db.insert(sequenceEnrollments).values({ id: newId("sequenceEnrollment"), sequenceId: seq.id, workspaceId, contactId, email, status: "completed" });
    assert.equal(await hasBetaInviteEnrollment(email.toUpperCase(), workspaceId), true);
  });
});
