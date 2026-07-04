/**
 * SCIM provisioning smoke — exercises the real lib against the DB:
 *   provision → serialize → deactivate (kills access) → reactivate.
 * Requires DATABASE_URL (a throwaway org row is created + cleaned up).
 * Run: pnpm --filter @rootmail/api exec tsx scripts/scim-smoke.ts
 */
import { eq } from "drizzle-orm";
import { newId } from "@rootmail/core";
import { db, memberships, organizations, users, workspaces } from "@rootmail/db";
import {
  findScimMember,
  findScimMemberByEmail,
  provisionScimMember,
  scimUser,
  setMemberActive,
} from "../src/lib/scim";
import { userWorkspaces } from "../src/lib/auth";

async function main() {
  let failures = 0;
  const ok = (name: string, cond: boolean, extra = "") => {
    console.log(`${cond ? "  ✓" : "  ✗"} ${name}${extra ? ` — ${extra}` : ""}`);
    if (!cond) failures++;
  };

  const orgId = newId("organization");
  const email = `scim-smoke-${Date.now()}@example.test`;
  const ctx = { organizationId: orgId, defaultRole: "member" as const };

  await db.insert(organizations).values({ id: orgId, name: "SCIM Smoke", slug: `scim-smoke-${orgId.slice(-6)}` });
  const wsId = newId("workspace");
  await db.insert(workspaces).values({
    id: wsId,
    organizationId: orgId,
    name: "Production",
    slug: "production",
    environment: "live",
  });

  try {
    // Provision
    const member = await provisionScimMember(ctx, { email, name: "Grace Hopper", externalId: "idp-123", active: true });
    ok("provisioned member", member.user.email === email);
    const res = scimUser(member);
    ok("SCIM resource has id + userName", res.id === member.membershipId && res.userName === email);
    ok("active member has workspace access", (await userWorkspaces(member.user.id)).length === 1);

    // Lookup by email (Okta existence probe)
    const byEmail = await findScimMemberByEmail(orgId, email);
    ok("found by email", byEmail?.membershipId === member.membershipId);
    ok("externalId round-trips", byEmail?.externalId === "idp-123");

    // Deactivate → access revoked
    await setMemberActive(member, false);
    const off = await findScimMember(orgId, member.membershipId);
    ok("membership marked inactive", off?.active === false);
    ok("inactive member has NO workspace access", (await userWorkspaces(member.user.id)).length === 0);

    // Reactivate → access restored
    await setMemberActive(member, true);
    ok("reactivated member regains access", (await userWorkspaces(member.user.id)).length === 1);

    // Clean up (cascade drops memberships + workspaces; then the user)
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await db.delete(users).where(eq(users.id, member.user.id));
  } catch (err) {
    ok("run without error", false, (err as Error).message);
    await db.delete(organizations).where(eq(organizations.id, orgId)).catch(() => {});
    await db.delete(users).where(eq(users.email, email)).catch(() => {});
  }

  console.log(failures === 0 ? "\nSCIM smoke: ALL PASS" : `\nSCIM smoke: ${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
