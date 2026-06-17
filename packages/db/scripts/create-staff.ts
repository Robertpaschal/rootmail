/**
 * Bootstrap an internal-staff user for apps/admin WITHOUT seeding demo data.
 *
 *   pnpm create-staff --email=you@co.com [--password=… --name='…' --role=superadmin]
 *
 * Flags override env (STAFF_EMAIL / STAFF_PASSWORD / STAFF_NAME / STAFF_ROLE).
 * If no password is given, a strong one is generated and printed once. Re-running
 * for an existing email resets that staff member's password (and role) — handy for
 * recovery. Idempotent; safe in production. Migrations are the only other setup.
 */
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { hashPassword, newId, STAFF_ROLES, type StaffRole } from "@rootmail/core";
import { closeDb, db, staffUsers } from "../src/index";

function flag(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

async function main(): Promise<void> {
  const email = (flag("email") ?? process.env.STAFF_EMAIL ?? "").trim().toLowerCase();
  const name = flag("name") ?? process.env.STAFF_NAME ?? null;
  const role = (flag("role") ?? process.env.STAFF_ROLE ?? "superadmin") as StaffRole;
  let password = flag("password") ?? process.env.STAFF_PASSWORD ?? "";

  if (!email || !email.includes("@")) {
    console.error(
      "Usage: pnpm create-staff --email=you@co.com " +
        "[--password=… --name='Your Name' --role=superadmin|support|readonly]",
    );
    console.error("       (or set STAFF_EMAIL / STAFF_PASSWORD / STAFF_NAME / STAFF_ROLE)");
    process.exit(1);
  }
  if (!STAFF_ROLES.includes(role)) {
    console.error(`Invalid role "${role}". One of: ${STAFF_ROLES.join(", ")}`);
    process.exit(1);
  }

  let generated = false;
  if (!password) {
    password = randomBytes(18).toString("base64url");
    generated = true;
  }
  if (password.length < 10) {
    console.error("Password must be at least 10 characters.");
    process.exit(1);
  }

  const passwordHash = hashPassword(password);
  // Don't clobber an existing name on a password-reset re-run unless one was given.
  const updateSet: Record<string, unknown> = { passwordHash, role, updatedAt: new Date() };
  if (name !== null) updateSet.name = name;

  const [existing] = await db
    .select({ id: staffUsers.id })
    .from(staffUsers)
    .where(eq(staffUsers.email, email))
    .limit(1);

  await db
    .insert(staffUsers)
    .values({ id: newId("staffUser"), email, name, passwordHash, role })
    .onConflictDoUpdate({ target: staffUsers.email, set: updateSet });

  const line = "─".repeat(60);
  console.log(`\n${line}`);
  console.log(`  Staff user ${existing ? "updated" : "created"} for apps/admin`);
  console.log(line);
  console.log(`  Email : ${email}`);
  console.log(`  Role  : ${role}`);
  if (generated) {
    console.log("  Password (copy now — shown once):\n");
    console.log(`      ${password}`);
  } else {
    console.log("  Password : (as provided)");
  }
  console.log(`${line}\n`);

  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => {});
  process.exit(1);
});
