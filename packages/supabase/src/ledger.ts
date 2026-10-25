import type { HookLedger } from "./hook";

/** Parameterized query supplied by the server's existing PostgreSQL pool. No payload enters SQL. */
export type LedgerQuery = (sql: string, parameters: readonly string[]) => Promise<readonly Record<string, unknown>[]>;

/** Install examples/ledger.sql separately, with a restricted server-only database role. */
export function createPostgresHookLedger(query: LedgerQuery): HookLedger {
  return {
    async claim(input) {
      // Conflict locks the existing row but never replaces its commitment or deadline.
      // One statement avoids the snapshot race of INSERT DO NOTHING + SELECT in a CTE.
      const rows = await query(`INSERT INTO rootmail_auth_hook.events (event_key, fingerprint, expires_at)
        VALUES ($1, $2, $3::timestamptz)
        ON CONFLICT (event_key) DO UPDATE SET event_key = EXCLUDED.event_key
        RETURNING fingerprint, expires_at`, [input.eventKey, input.fingerprint, input.expiresAt]);
      const row = rows[0];
      const expiresAt = row?.expires_at;
      if (rows.length !== 1 || typeof row?.fingerprint !== "string" || !(typeof expiresAt === "string" || expiresAt instanceof Date)) {
        throw new Error("hook_ledger_unavailable");
      }
      return { fingerprint: row.fingerprint, expiresAt: new Date(expiresAt).toISOString() };
    },
  };
}
