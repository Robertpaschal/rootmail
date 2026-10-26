import postgres from "postgres";
import { readFile } from "node:fs/promises";
import { createPostgresHookLedger, createSupabaseEmailHook } from "@rootmail/supabase";
import { createAuthHookServer } from "../lib/auth-hook-http";

// Separate process/env from the API: only a pilot key, hook secret/HMAC and the
// limited ledger DB role. Never inherit the API's full environment file.
async function main() {
  const raw = process.env.SUPABASE_HOOK_CONFIG_JSON;
  const databaseUrl = process.env.HOOK_DATABASE_URL;
  if (!raw || !databaseUrl) throw new Error();
  const url = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error();
  const ca = process.env.HOOK_DATABASE_CA_FILE ? await readFile(process.env.HOOK_DATABASE_CA_FILE, "utf8") : undefined;
  const database = postgres(databaseUrl, { max: 2, connect_timeout: 1, ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    connection: { statement_timeout: 1000 }, onnotice: () => {} });
  const ledger = createPostgresHookLedger((query, values) => database.unsafe(query, [...values]));
  const config = JSON.parse(raw);
  // This listener is specifically the controlled native Sprout pilot. Admission
  // remains independently guarded by Rootmail's exact-scope/recipient checks.
  if (config.deliveryMode !== "code_only" || !Array.isArray(config.allowedRecipients) || !config.allowedRecipients.length) throw new Error();
  const hook = createSupabaseEmailHook({ ...config, ledger, budgetMs: 4500 });
  await database`select 1 from rootmail_auth_hook.events limit 1`;
  const server = createAuthHookServer(hook);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(4011, "0.0.0.0", resolve);
  });
  const shutdown = () => {
    server.close(); server.closeIdleConnections();
    const timer = setTimeout(() => process.exit(0), 6000); timer.unref();
    void database.end({ timeout: 5 }).finally(() => process.exit(0));
  };
  process.once("SIGTERM", shutdown); process.once("SIGINT", shutdown);
}
void main().catch(() => {
  // JSON/DB/SDK errors may embed secrets. This is intentionally fixed text.
  console.error("Auth hook startup failed; check server configuration and ledger access");
  process.exit(1);
});
