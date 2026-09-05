import { and, eq, isNull, inArray } from "drizzle-orm";
import { newId, testRecipientAddress } from "@rootmail/core";
import { contacts, db, listContacts, lists, verifiedRecipients, workspaces } from "@rootmail/db";

/**
 * The audience that makes a sandboxed beta actually testable.
 *
 * Platform SES requires confirmation of real recipients. Provisioning registers
 * the tester as pending and adds recognised simulator aliases to an isolated
 * starter audience. Connecting an own provider uses that provider's rules.
 *
 * Simulator outcomes test event handling, not inbox placement or organic usage.
 */

const SIMULATOR = "simulator.amazonses.com";

export const BETA_TEST_AUDIENCE = "Beta test audience";
const AUDIENCE_DESCRIPTION = "Your inbox (confirm it in Testing first), plus delivery, bounce and complaint scenarios. Simulator results test event handling; they do not measure inbox placement.";
const LEGACY_DESCRIPTION = "Four addresses you can safely send to while rootmail is in beta — yours, plus one each that always delivers, always bounces, and always reports spam. None of them affect your reputation.";

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
  // Serialize repair with signup/another tab: the list's nullable scope has no
  // unique constraint. No provider call or email is triggered by provisioning.
  return db.transaction(async (db) => {
    await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, workspaceId)).for("update");
    await db.insert(verifiedRecipients).values({
      id: newId("verifiedRecipient"), workspaceId, email: ownerEmail.trim().toLowerCase(),
      label: "Your inbox", status: "pending",
    }).onConflictDoNothing();
    const [existing] = await db
      .select({ id: lists.id, description: lists.description })
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
        description: AUDIENCE_DESCRIPTION,
      });
    } else if (existing.description === LEGACY_DESCRIPTION) {
      // Correct our old generated claim without overwriting a user's own copy.
      await db.update(lists).set({ description: AUDIENCE_DESCRIPTION }).where(eq(lists.id, listId));
    }

    const seeds: { email: string; name: string }[] = [
      { email: ownerEmail.trim().toLowerCase(), name: "You" },
      { email: testRecipientAddress("delivered"), name: "Delivery scenario" },
      { email: testRecipientAddress("bounced"), name: "Bounce scenario" },
      { email: testRecipientAddress("complained"), name: "Complaint scenario" },
    ];

    // Repair only membership in this generated audience; retain the old contact
    // records and their history for anyone who already used them.
    const legacy = await db.select({ id: contacts.id }).from(contacts).where(and(
      eq(contacts.workspaceId, workspaceId), isNull(contacts.subTenantId),
      inArray(contacts.email, [`success@${SIMULATOR}`, `bounce@${SIMULATOR}`, `complaint@${SIMULATOR}`]),
    ));
    if (legacy.length) await db.delete(listContacts).where(and(
      eq(listContacts.listId, listId), inArray(listContacts.contactId, legacy.map(c => c.id)),
    ));

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
  });
}
