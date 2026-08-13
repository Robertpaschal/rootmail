import { and, eq, isNull } from "drizzle-orm";
import { newId } from "@rootmail/core";
import { contacts, db, listContacts, lists } from "@rootmail/db";

/**
 * The audience that makes a sandboxed beta actually testable.
 *
 * While our SES account is in the sandbox, a tester cannot email their own
 * customers — every send from their account runs through our account and
 * inherits the same restriction. A beta where the core action is refused is not
 * a beta; it is a demo with extra steps.
 *
 * These four addresses are reachable regardless, so a tester can build a real
 * campaign, launch it, and watch it move through the product:
 *
 *   their own address  — verified at admission, so it behaves like a real send
 *   success@…          — delivers cleanly
 *   bounce@…           — hard bounce, and they watch auto-suppression catch it
 *   complaint@…        — spam complaint, same
 *
 * That is the whole product exercised honestly — analytics, deliverability,
 * suppression, sequences — with no production access and no risk to anyone's
 * reputation, because the simulator is excluded from reputation by AWS.
 *
 * It also means every tester generates real SES traffic with clean outcomes,
 * which is exactly the sending history our production-access appeal lacked.
 */

const SIMULATOR = "simulator.amazonses.com";

export const BETA_TEST_AUDIENCE = "Beta test audience";

export interface TestKitResult {
  listId: string;
  added: number;
}

/**
 * Seed the test audience into a tester's own workspace.
 *
 * Idempotent — re-running adds nothing. Safe to call on every login if we ever
 * want to repair an account that predates this.
 */
export async function seedBetaTestKit(
  workspaceId: string,
  ownerEmail: string,
): Promise<TestKitResult> {
  const [existing] = await db
    .select({ id: lists.id })
    .from(lists)
    .where(
      and(
        eq(lists.workspaceId, workspaceId),
        isNull(lists.subTenantId),
        eq(lists.name, BETA_TEST_AUDIENCE),
      ),
    )
    .limit(1);

  const listId = existing?.id ?? newId("list");
  if (!existing) {
    await db.insert(lists).values({
      id: listId,
      workspaceId,
      subTenantId: null,
      name: BETA_TEST_AUDIENCE,
      description:
        "Four addresses you can safely send to while rootmail is in beta — yours, plus one each that always delivers, always bounces, and always reports spam. None of them affect your reputation.",
    });
  }

  const seeds: { email: string; name: string }[] = [
    { email: ownerEmail.trim().toLowerCase(), name: "You" },
    { email: `success@${SIMULATOR}`, name: "Always delivers" },
    { email: `bounce@${SIMULATOR}`, name: "Always bounces" },
    { email: `complaint@${SIMULATOR}`, name: "Always reports spam" },
  ];

  let added = 0;
  for (const seed of seeds) {
    const [known] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.workspaceId, workspaceId),
          isNull(contacts.subTenantId),
          eq(contacts.email, seed.email),
        ),
      )
      .limit(1);

    const contactId = known?.id ?? newId("contact");
    if (!known) {
      await db.insert(contacts).values({
        id: contactId,
        workspaceId,
        subTenantId: null,
        email: seed.email,
        name: seed.name,
        tags: ["beta-test-kit"],
        status: "active",
      });
      added += 1;
    }
    await db
      .insert(listContacts)
      .values({ id: newId("listContact"), listId, contactId })
      .onConflictDoNothing();
  }

  return { listId, added };
}
