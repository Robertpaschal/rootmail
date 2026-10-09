/**
 * staff:reset-link — one-off staff console recovery, run on the production host.
 *
 *   pnpm --filter @rootmail/api staff:reset-link --email admin@rootmail.io
 *
 * Mints a single-use, 30-minute password-reset link for an EXISTING staff
 * account and prints it to stdout. Open it, choose a new password, sign in.
 * Recovery therefore does not depend on email delivery at all.
 *
 * Options:
 *   --email <addr>     The staff account's email (required). Unknown or
 *                      deactivated accounts are refused; nothing is created.
 *   --send             Email the link to the address on file instead of
 *                      printing it (through the normal system-mail queue).
 *   --base-url <url>   Override the console origin in the link (default:
 *                      STAFF_CONSOLE_URL, else https://internal.<ROOTMAIL_DOMAIN>).
 *   -h, --help         Show this help.
 *
 * It never prints, accepts or sets a password. Using the link spends it, spends
 * every other outstanding link for the account and signs out every staff
 * session. Each run writes a `staff.password_reset.link_minted` audit entry
 * (host and OS user, never the token). Only the link goes to stdout; everything
 * else goes to stderr, so `… > /dev/null` shows nothing secret on screen.
 *
 * Treat the printed link like a password until it is used or expires: don't
 * paste it into chat, tickets or shell history you share.
 */
import { hostname, userInfo } from "node:os";
import { pathToFileURL } from "node:url";
import { eq } from "drizzle-orm";
import { closeQueues, closeRedis, sendSystemEmail } from "@rootmail/core";
import { closeDb, db, staffUsers } from "@rootmail/db";
import { writeStaffAudit } from "../lib/admin-auth";
import { staffPasswordResetEmail } from "../lib/emails";
import { mintStaffResetToken, staffResetUrl } from "../lib/staff-password-reset";

export interface CliIo {
  out: (line: string) => void;
  err: (line: string) => void;
}

const HELP = `Usage: pnpm --filter @rootmail/api staff:reset-link --email <addr> [--send] [--base-url <url>]

Mints a single-use staff password-reset link (expires in 30 minutes) for an
existing staff account and prints it to stdout. --send emails it to the
address on file instead. Never prints or sets a password.`;

interface Args {
  email?: string;
  send: boolean;
  baseUrl?: string;
  help: boolean;
}

function parseArgs(argv: string[]): Args | string {
  const args: Args = { send: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--") continue; // pnpm passes this through
    const [flag, inline] = a.includes("=") ? [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)] : [a, undefined];
    const value = () => inline ?? argv[++i];
    switch (flag) {
      case "--email": args.email = value(); break;
      case "--base-url": args.baseUrl = value(); break;
      case "--send": args.send = true; break;
      case "-h": case "--help": args.help = true; break;
      default: return `Unknown option: ${a}`;
    }
  }
  return args;
}

/** Returns the process exit code. Exported for tests; does not close connections. */
export async function runStaffResetLink(argv: string[], io: CliIo): Promise<number> {
  const args = parseArgs(argv);
  if (typeof args === "string") {
    io.err(`${args}\n\n${HELP}`);
    return 2;
  }
  if (args.help) {
    io.err(HELP);
    return 0;
  }
  const email = args.email?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    io.err(`--email <addr> is required.\n\n${HELP}`);
    return 2;
  }
  if (args.baseUrl && !/^https?:\/\/[^/\s]+/.test(args.baseUrl)) {
    io.err("--base-url must be an http(s) origin, e.g. https://internal.rootmail.io");
    return 2;
  }

  const [staff] = await db.select().from(staffUsers).where(eq(staffUsers.email, email)).limit(1);
  if (!staff) {
    io.err(`No staff account has the email ${email}. Nothing was created. Check the address (staff emails are stored lowercase).`);
    return 1;
  }
  if (staff.deactivatedAt) {
    io.err(`The staff account ${email} is deactivated. Reactivate it from another superadmin account first; no link was minted.`);
    return 1;
  }

  const { token, expiresAt } = await mintStaffResetToken(staff.id);
  const url = staffResetUrl(token, args.baseUrl);
  let osUser = "unknown";
  try {
    osUser = userInfo().username;
  } catch {
    /* no passwd entry in some containers */
  }
  await writeStaffAudit({
    staffUserId: staff.id,
    action: "staff.password_reset.link_minted",
    targetType: "staff_user",
    targetId: staff.id,
    metadata: { via: "cli", delivery: args.send ? "email" : "stdout", host: hostname(), os_user: osUser, expires_at: expiresAt.toISOString() },
  });

  if (args.send) {
    const mail = staffPasswordResetEmail(url, staff.name);
    await sendSystemEmail({ to: staff.email, subject: mail.subject, html: mail.html, text: mail.text, cls: "security" });
    io.err(`Reset link queued for ${staff.email} (expires ${expiresAt.toISOString()}). Delivery goes through the system-mail worker.`);
    return 0;
  }

  io.err(`Single-use reset link for ${staff.email}, expires ${expiresAt.toISOString()}. Treat it like a password:`);
  io.out(url);
  return 0;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const io: CliIo = { out: (l) => process.stdout.write(`${l}\n`), err: (l) => process.stderr.write(`${l}\n`) };
  let code = 1;
  try {
    code = await runStaffResetLink(process.argv.slice(2), io);
  } catch (err) {
    io.err(`staff:reset-link failed: ${(err as Error).message}`);
  } finally {
    await Promise.allSettled([closeQueues(), closeRedis(), closeDb()]);
  }
  process.exit(code);
}
