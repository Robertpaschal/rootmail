import { and, eq, like } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { TEST_RECIPIENT_DOMAIN, TEST_RECIPIENTS, testRecipientAddress } from "@rootmail/core";
import { db, suppressions } from "@rootmail/db";
import { requirePermission } from "../lib/permissions";

/**
 * Test recipients — the real send path, to a destination that can't be harmed.
 *
 * The sandbox proves your integration; it can't prove delivery, because it never
 * reaches the provider. These addresses do: mail to them makes the real SES call
 * with real DKIM signing and returns real delivery/bounce/complaint webhooks,
 * but lands on Amazon's mailbox simulator instead of a person (and is excluded
 * from your sender reputation, so a deliberate hard bounce costs you nothing).
 */
export async function testRecipientRoutes(app: FastifyInstance): Promise<void> {
  // The catalog: what you can prove, and the address that proves it.
  app.get("/v1/test-recipients", async () => ({
    object: "list",
    domain: TEST_RECIPIENT_DOMAIN,
    data: TEST_RECIPIENTS.map((t) => ({
      object: "test_recipient" as const,
      slug: t.slug,
      email: testRecipientAddress(t.slug),
      label: t.label,
      description: t.description,
      outcome: t.outcome,
    })),
  }));

  // Testing a bounce SUPPRESSES the address — that's the feature working, but it
  // would also make the test one-shot. This clears suppressions for the test
  // domain only, so the scenario is repeatable. Real recipients are untouched.
  app.post("/v1/test-recipients/reset", async (req) => {
    await requirePermission(req, "content.manage");
    const deleted = await db
      .delete(suppressions)
      .where(
        and(
          eq(suppressions.workspaceId, req.auth.workspace.id),
          like(suppressions.email, `%@${TEST_RECIPIENT_DOMAIN}`),
        ),
      )
      .returning({ email: suppressions.email });
    return { object: "test_recipients_reset", cleared: deleted.length, emails: deleted.map((d) => d.email) };
  });
}
