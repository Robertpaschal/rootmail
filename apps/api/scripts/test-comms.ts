/**
 * Lifecycle comms — content builders + the owner-lookup used to address billing
 * emails. Deterministic (DB only; no API/worker needed).
 *   pnpm --filter @rootmail/api test:comms
 * The full dogfood path (enqueue → worker → provider → .eml) is exercised by
 * running `pnpm api` + `pnpm worker` and triggering an invite / verification.
 */
import { eq } from "drizzle-orm";
import { newId } from "@rootmail/core";
import { closeDb, db, memberships, organizations, users } from "@rootmail/db";
import {
  announcementEmail,
  invitationEmail,
  paymentFailedEmail,
  trialEndingEmail,
  welcomeEmail,
} from "../src/lib/emails";
import { ownerContactForCustomer } from "../src/lib/stripe";

let pass = true;
function check(cond: boolean, label: string): void {
  console.log(`${cond ? "PASS" : "FAIL"} — ${label}`);
  if (!cond) pass = false;
}

async function main(): Promise<void> {
  // --- Content builders ---
  const w = welcomeEmail("Ada");
  check(w.subject.includes("Welcome") && w.html.includes("Ada"), "welcome email built");

  const inv = invitationEmail({
    orgName: "<script>Acme",
    inviterName: "Bob",
    acceptUrl: "https://app.example/accept-invite?token=tok123",
    role: "admin",
  });
  check(inv.subject.includes("invited to join"), "invite subject");
  check(inv.html.includes("accept-invite?token=tok123"), "invite html has the accept link");
  check(inv.html.includes("&lt;script&gt;Acme") && !inv.html.includes("<script>Acme"), "invite escapes the org name (no stored XSS)");
  check(inv.text.includes("Bob invited you"), "invite text names the inviter");

  const pf = paymentFailedEmail("Ada");
  check(pf.subject.toLowerCase().includes("payment") && pf.html.includes("/billing"), "payment-failed email built");

  const te = trialEndingEmail("Ada", new Date("2026-07-01T00:00:00Z"));
  check(te.subject.toLowerCase().includes("trial") && te.text.includes("2026"), "trial-ending email built");

  const anon = welcomeEmail(null);
  check(anon.html.includes("Hi,") && !anon.html.includes("Hi null"), "handles a missing name");

  const ann = announcementEmail({ subject: "Big news", body: "Line one.\n\nLine two.", recipientName: "Ada" });
  check(ann.subject === "Big news", "announcement keeps the staff subject");
  check(ann.html.includes("Line one.") && ann.html.includes("Line two."), "announcement renders the body paragraphs");
  check(ann.text.includes("account") && ann.html.includes("account"), "announcement has a why-you-got-this footer");

  // --- ownerContactForCustomer ---
  const orgId = newId("organization");
  const uid = newId("user");
  const cust = `cus_commstest_${Date.now()}`;
  const ownerEmail = `owner-${Date.now()}@example.com`;

  try {
    await db
      .insert(organizations)
      .values({ id: orgId, name: "Comms Co", slug: `comms-${Date.now()}`, plan: "pro", stripeCustomerId: cust });
    await db.insert(users).values({ id: uid, email: ownerEmail, name: "Owner" });
    await db.insert(memberships).values({ id: newId("membership"), userId: uid, organizationId: orgId, role: "owner" });

    const owner = await ownerContactForCustomer(cust);
    check(owner?.email === ownerEmail && owner?.name === "Owner", "ownerContactForCustomer returns the org owner");
    const none = await ownerContactForCustomer("cus_nope_does_not_exist");
    check(none === null, "ownerContactForCustomer is null for an unknown customer");
  } finally {
    await db.delete(organizations).where(eq(organizations.id, orgId)); // cascades membership
    await db.delete(users).where(eq(users.id, uid));
  }

  console.log(pass ? "\nAll comms checks passed." : "\nSome checks FAILED.");
  await closeDb();
  process.exit(pass ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => {});
  process.exit(1);
});
