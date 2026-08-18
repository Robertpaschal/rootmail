import { eq } from "drizzle-orm";
import { encryptSecret, isEncrypted } from "@rootmail/core";
import { closeDb, db } from "./client";
import { subTenants } from "./schema";

/**
 * One-shot backfill: encrypt every DKIM private key still stored in plaintext.
 *
 * Idempotent and safe to run repeatedly — rows already encrypted are skipped, and
 * the read path handles both forms, so this can run at any point after the deploy
 * rather than in lockstep with it. Run it as:
 *
 *   pnpm db:encrypt-dkim
 *
 * IMPORTANT: run it with the SAME `ENCRYPTION_KEY` the API and worker use. If they
 * disagree, the worker will fail to decrypt at send time — loudly, by design, but
 * still after the fact. There is no way back from that except re-provisioning
 * DKIM for every affected sub-tenant, so check the env before running.
 */
export async function encryptDkimKeys(): Promise<{ scanned: number; encrypted: number }> {
  const rows = await db
    .select({ id: subTenants.id, key: subTenants.dkimPrivateKey, domain: subTenants.sendingDomain })
    .from(subTenants);

  let encrypted = 0;
  for (const row of rows) {
    if (isEncrypted(row.key)) continue;
    await db
      .update(subTenants)
      .set({ dkimPrivateKey: encryptSecret(row.key) })
      .where(eq(subTenants.id, row.id));
    encrypted++;
    console.log(`  encrypted ${row.domain} (${row.id})`);
  }

  return { scanned: rows.length, encrypted };
}

// Direct execution (pnpm db:encrypt-dkim).
if (import.meta.url === `file://${process.argv[1]}`) {
  encryptDkimKeys()
    .then(async ({ scanned, encrypted }) => {
      console.log(
        `✓ DKIM keys: ${encrypted} encrypted, ${scanned - encrypted} already encrypted (${scanned} total).`,
      );
      await closeDb();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("✗ DKIM key encryption failed:", err);
      await closeDb();
      process.exit(1);
    });
}
