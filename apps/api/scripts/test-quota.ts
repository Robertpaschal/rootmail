/**
 * Quota-integrity regression test (run: `pnpm --filter @rootmail/api test:quota`).
 *
 * Proves the monthly send cap can't be overshot by a burst of concurrent sends.
 * Seeds a Free org to 5 below its cap, fires 50 concurrent quota reserves, and
 * asserts exactly 5 succeed and usage lands exactly at the cap (never above).
 * Exits non-zero on failure so CI can gate on it.
 */
import { and, eq } from "drizzle-orm";
import { newId, PLANS } from "@rootmail/core";
import { closeDb, db, organizations, usageRecords } from "@rootmail/db";
import { currentPeriod, tryConsumeQuota } from "../src/lib/billing";

const CONCURRENCY = 50;
const SLOTS_LEFT = 5;

async function main(): Promise<void> {
  const quota = PLANS.free.monthlyQuota;
  const orgId = newId("organization");
  const period = currentPeriod();

  await db
    .insert(organizations)
    .values({ id: orgId, name: "quota-test", slug: `quota-test-${orgId.slice(-6)}`, plan: "free" });
  await db
    .insert(usageRecords)
    .values({ id: newId("usage"), organizationId: orgId, period, emailsSent: quota - SLOTS_LEFT });

  // Fire many concurrent reserves against the last few slots.
  const results = await Promise.all(
    Array.from({ length: CONCURRENCY }, () => tryConsumeQuota({ id: orgId, plan: "free" })),
  );
  const granted = results.filter(Boolean).length;

  const [row] = await db
    .select({ used: usageRecords.emailsSent })
    .from(usageRecords)
    .where(and(eq(usageRecords.organizationId, orgId), eq(usageRecords.period, period)));
  const used = row?.used ?? -1;

  // A fully-consumed org must reject the next reserve.
  const overflow = await tryConsumeQuota({ id: orgId, plan: "free" });

  await db.delete(organizations).where(eq(organizations.id, orgId)); // cascades usage row

  const pass = granted === SLOTS_LEFT && used === quota && overflow === false;
  console.log(
    `granted=${granted} (expect ${SLOTS_LEFT})  used=${used} (expect ${quota})  ` +
      `overflow=${overflow} (expect false)`,
  );
  console.log(pass ? "PASS — hard cap held atomically under concurrency" : "FAIL — cap overshot");

  await closeDb();
  process.exit(pass ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => {});
  process.exit(1);
});
