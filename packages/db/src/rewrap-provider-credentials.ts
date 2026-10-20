import { eq } from "drizzle-orm";
import { isEnvelope, rewrapCredentials } from "@rootmail/core";
import { closeDb, db } from "./client";
import { orgSendingProviders } from "./schema";

/**
 * Key rotation for tenant provider credentials.
 *
 *   1. Set PROVIDER_CREDENTIALS_KEY_PREVIOUS = the old key, PROVIDER_CREDENTIALS_KEY = the new one,
 *      on the API and the worker, and deploy (both keys now open rows).
 *   2. pnpm db:rewrap-provider-creds            — re-wraps each row's data key under the new key.
 *   3. Remove PROVIDER_CREDENTIALS_KEY_PREVIOUS and deploy.
 *
 * Only the data key is re-encrypted; the credential itself is never decrypted
 * into anything but memory, and never printed. Idempotent.
 *
 * `--upgrade-legacy` also seals pre-BYO `enc:v1:` rows into envelopes. Off by
 * default so this script never touches a connection the flag does not cover.
 */
export async function rewrapProviderCredentials(opts: { upgradeLegacy?: boolean } = {}) {
  const rows = await db.select({ id: orgSendingProviders.id, c: orgSendingProviders.credentials }).from(orgSendingProviders);
  let rewrapped = 0;
  for (const row of rows) {
    if (!isEnvelope(row.c) && !opts.upgradeLegacy) continue;
    const next = rewrapCredentials(row.c);
    if (next === row.c) continue;
    await db.update(orgSendingProviders).set({ credentials: next }).where(eq(orgSendingProviders.id, row.id));
    rewrapped++;
  }
  return { scanned: rows.length, rewrapped };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  rewrapProviderCredentials({ upgradeLegacy: process.argv.includes("--upgrade-legacy") })
    .then((r) => console.log(`provider credentials: scanned ${r.scanned}, re-wrapped ${r.rewrapped}`))
    .catch((err) => {
      console.error("re-wrap failed:", err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
