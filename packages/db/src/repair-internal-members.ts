import { and, eq, inArray, notLike } from "drizzle-orm";
import { closeDb, db } from "./client";
import { internalOrgId } from "./internal-org";
import { memberships, sessions, users, workspaces } from "./schema";

/**
 * Revoke customer accounts that were wrongly given membership of rootmail's own org.
 *
 * `POST /v1/admin/internal/open` first shipped keyed on `staff.email`: it looked
 * up the `users` row with that address and hung a `rootmail-hq` membership on
 * it. Staff are people who also hold their own rootmail accounts, so for the
 * first person through the door it adopted their CUSTOMER account — and that
 * membership outlived the handoff. Their ordinary sign-in then carried access to
 * our internal workspace, from the workspace switcher, with no `announce.send`
 * check and nothing in the staff audit log.
 *
 * The door now keys on the staff id at an unroutable `.invalid` address, so the
 * two identities can never be the same row again. This removes the leak that
 * already happened. Idempotent: safe to run repeatedly, does nothing once clean.
 *
 * Deliberately NOT run automatically at boot. Deleting access grants is not
 * something a bootstrap function should do behind your back — it is run once,
 * on purpose, with its output read.
 */
export async function repairInternalMembers(): Promise<{
  revoked: { email: string; userId: string }[];
  sessionsKilled: number;
}> {
  const orgId = await internalOrgId();
  if (!orgId) return { revoked: [], sessionsKilled: 0 };

  // Anything that is NOT a staff identity has no business being a member.
  // Staff identities are `<staff_id>@staff.rootmail.invalid` — see admin.ts.
  const wrong = await db
    .select({ mid: memberships.id, uid: users.id, email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.organizationId, orgId), notLike(users.email, "%@staff.rootmail.invalid")));

  if (wrong.length === 0) return { revoked: [], sessionsKilled: 0 };

  await db.delete(memberships).where(
    inArray(
      memberships.id,
      wrong.map((w) => w.mid),
    ),
  );

  // Revoking access has to end the sessions holding it, or the leak survives
  // until they happen to expire.
  const ourWorkspaces = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.organizationId, orgId));
  let sessionsKilled = 0;
  if (ourWorkspaces.length > 0) {
    const killed = await db
      .delete(sessions)
      .where(
        and(
          inArray(
            sessions.userId,
            wrong.map((w) => w.uid),
          ),
          inArray(
            sessions.activeWorkspaceId,
            ourWorkspaces.map((w) => w.id),
          ),
        ),
      )
      .returning({ id: sessions.id });
    sessionsKilled = killed.length;
  }

  return { revoked: wrong.map((w) => ({ email: w.email, userId: w.uid })), sessionsKilled };
}

if (process.argv[1]?.endsWith("repair-internal-members.ts")) {
  repairInternalMembers()
    .then((r) => {
      if (r.revoked.length === 0) {
        console.log("internal org: no customer accounts hold membership — nothing to repair.");
      } else {
        console.log(`revoked ${r.revoked.length} membership(s) of rootmail-hq:`);
        for (const x of r.revoked) console.log(`  ${x.email}  (${x.userId})`);
        console.log(`ended ${r.sessionsKilled} session(s) that were inside our workspace.`);
      }
    })
    .then(() => closeDb())
    .catch(async (err) => {
      console.error(err);
      await closeDb();
      process.exit(1);
    });
}
