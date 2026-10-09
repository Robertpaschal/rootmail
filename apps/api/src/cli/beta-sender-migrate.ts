/**
 * beta:migrate-senders — move beta sender addresses from the legacy apex form
 * (beta+<org>@<ROOTMAIL_DOMAIN>) to the reply subdomain (beta+<org>@<INBOUND_DOMAIN>).
 *
 *   pnpm --filter @rootmail/api beta:migrate-senders            # dry run (audit)
 *   pnpm --filter @rootmail/api beta:migrate-senders --apply    # do it
 *
 * The dry run changes nothing: it lists every apex beta address, what it would
 * become and how many draft/scheduled campaigns use it. --apply moves them in
 * place; it is idempotent. It touches only database rows — no SES, DNS or
 * schema change. See lib/beta-sender-migration.ts for what moves and what not.
 */
import { pathToFileURL } from "node:url";
import { closeQueues, closeRedis } from "@rootmail/core";
import { closeDb } from "@rootmail/db";
import { migrateBetaSenders } from "../lib/beta-sender-migration";

export interface CliIo { out: (line: string) => void; err: (line: string) => void }

export async function runBetaSenderMigrate(argv: string[], io: CliIo): Promise<number> {
  if (argv.includes("-h") || argv.includes("--help")) {
    io.out("usage: beta:migrate-senders [--apply]   (dry run without --apply)");
    return 0;
  }
  const unknown = argv.filter((a) => a !== "--apply");
  if (unknown.length) { io.err(`unknown option: ${unknown.join(" ")}`); return 2; }
  const apply = argv.includes("--apply");
  const r = await migrateBetaSenders({ apply });
  io.out(`${apply ? "APPLY" : "DRY RUN"}: ${r.legacy_domain} -> ${r.beta_domain}`);
  if (r.noop_reason) { io.out(`nothing to do: ${r.noop_reason}`); return 0; }
  if (r.rows.length === 0) io.out("no apex beta addresses found");
  for (const row of r.rows) {
    io.out([row.status, row.organization_id, row.from, "->", row.to, `default=${row.is_default}`, `campaigns=${row.campaigns}`, row.sender_id].join("\t"));
  }
  const n = (s: string) => r.rows.filter((x) => x.status === s).length;
  io.out(`total=${r.rows.length} would_migrate=${n("would_migrate")} migrated=${n("migrated")} skipped_conflict=${n("skipped_conflict")}`);
  return n("skipped_conflict") > 0 ? 3 : 0;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const io: CliIo = { out: (l) => process.stdout.write(`${l}\n`), err: (l) => process.stderr.write(`${l}\n`) };
  let code = 1;
  try {
    code = await runBetaSenderMigrate(process.argv.slice(2), io);
  } catch (err) {
    io.err(`beta:migrate-senders failed: ${(err as Error).message}`);
  } finally {
    await Promise.allSettled([closeQueues(), closeRedis(), closeDb()]);
  }
  process.exit(code);
}
