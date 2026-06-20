/**
 * Sales-CRM lead flow — needs the API running (`pnpm api`). No Stripe, no seed.
 *   pnpm --filter @rootmail/api test:leads
 *
 * Drives the public contact endpoint and the admin CRM end-to-end:
 *   - POST /v1/leads (public): happy path → 202 + row stored
 *   - honeypot filled → 202 but NOT stored
 *   - invalid email → 422
 *   - staff: list (+ pipeline counts + status filter) → detail → patch status
 *     (auto system note) → claim → add note → invalid status rejected → unauth
 *     blocked
 * Creates a throwaway superadmin and cleans up everything it makes.
 */
import { eq, like } from "drizzle-orm";
import { hashPassword, newId } from "@rootmail/core";
import { closeDb, db, leads, staffUsers } from "@rootmail/db";

const API = "http://localhost:4000";
const TAG = `crmtest+${Date.now()}`;
const LEAD_EMAIL = `${TAG}@example.com`;
const STAFF_EMAIL = `${TAG}.staff@example.com`;
const STAFF_PW = "crm-test-pw-123";

let pass = true;
function check(cond: boolean, label: string): void {
  console.log(`${cond ? "PASS" : "FAIL"} — ${label}`);
  if (!cond) pass = false;
}

const json = (r: Response) => r.json() as Promise<Record<string, unknown>>;

async function main(): Promise<void> {
  let up = false;
  try {
    up = (await fetch(`${API}/health`)).ok;
  } catch {
    up = false;
  }
  if (!up) {
    console.error(`API not reachable at ${API} — start it with \`pnpm api\`.`);
    process.exit(1);
  }

  // Throwaway superadmin (so the test doesn't depend on a seed).
  const staffId = newId("staffUser");
  await db.insert(staffUsers).values({
    id: staffId,
    email: STAFF_EMAIL,
    name: "CRM Test",
    passwordHash: hashPassword(STAFF_PW),
    role: "superadmin",
  });

  try {
    // 1. Public happy path.
    const r1 = await fetch(`${API}/v1/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Ada Lovelace",
        email: LEAD_EMAIL,
        company: "Analytical Engines",
        company_size: "11–50",
        expected_volume: "1M–10M / month",
        message: "Need SSO + EU residency.",
      }),
    });
    check(r1.status === 202, `public POST /v1/leads → 202 (got ${r1.status})`);

    // 2. Honeypot tripped → accepted but dropped.
    const hpEmail = `${TAG}.hp@example.com`;
    const r2 = await fetch(`${API}/v1/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Bot", email: hpEmail, company_fax: "i am a bot" }),
    });
    check(r2.status === 202, `honeypot POST → 202 (got ${r2.status})`);
    const [hpRow] = await db.select().from(leads).where(eq(leads.email, hpEmail)).limit(1);
    check(!hpRow, "honeypot submission NOT stored");

    // 3. Invalid email → 422.
    const r3 = await fetch(`${API}/v1/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "X", email: "not-an-email" }),
    });
    check(r3.status === 422, `invalid email → 422 (got ${r3.status})`);

    // Stored correctly?
    const [stored] = await db.select().from(leads).where(eq(leads.email, LEAD_EMAIL)).limit(1);
    check(!!stored, "happy-path lead stored");
    check(stored?.status === "new", "new lead defaults to status=new");
    check(stored?.source === "contact_form", "lead source defaults to contact_form");
    if (!stored) throw new Error("no lead to drive the admin flow");
    const leadId = stored.id;

    // Staff login.
    const login = await json(
      await fetch(`${API}/v1/admin/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: STAFF_EMAIL, password: STAFF_PW }),
      }),
    );
    const token = login.session_token as string | undefined;
    check(!!token, "staff login returns a session token");
    const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    // List + pipeline counts.
    const list = await json(await fetch(`${API}/v1/admin/leads`, { headers: H }));
    const listData = list.data as { id: string; status: string }[];
    check(listData.some((l) => l.id === leadId), "GET /v1/admin/leads includes our lead");
    const counts = list.counts as Record<string, number> | undefined;
    check(!!counts && typeof counts.new === "number", "list returns pipeline counts");

    // Status filter.
    const listNew = await json(await fetch(`${API}/v1/admin/leads?status=new`, { headers: H }));
    check(
      (listNew.data as { status: string }[]).every((l) => l.status === "new"),
      "?status=new filters to new only",
    );

    // Detail.
    const detail = await json(await fetch(`${API}/v1/admin/leads/${leadId}`, { headers: H }));
    check(
      detail.email === LEAD_EMAIL && detail.company === "Analytical Engines",
      "detail returns the lead's fields",
    );
    check(Array.isArray(detail.notes), "detail returns a notes array");

    // Patch status → qualified (auto system note).
    const patch = await fetch(`${API}/v1/admin/leads/${leadId}`, {
      method: "PATCH",
      headers: H,
      body: JSON.stringify({ status: "qualified" }),
    });
    check(patch.status === 200, `PATCH status → 200 (got ${patch.status})`);
    const afterPatch = await json(await fetch(`${API}/v1/admin/leads/${leadId}`, { headers: H }));
    check(afterPatch.status === "qualified", "status updated to qualified");
    const notes1 = afterPatch.notes as { kind: string; body: string }[];
    check(
      notes1.some((n) => n.kind === "system" && n.body.includes("qualified")),
      "status change auto-logged as a system note",
    );

    // Claim (owner = self).
    const claim = await fetch(`${API}/v1/admin/leads/${leadId}`, {
      method: "PATCH",
      headers: H,
      body: JSON.stringify({ owner_staff_id: staffId }),
    });
    check(claim.status === 200, `claim PATCH → 200 (got ${claim.status})`);
    const afterClaim = await json(await fetch(`${API}/v1/admin/leads/${leadId}`, { headers: H }));
    check(
      afterClaim.owner_staff_id === staffId && afterClaim.owner_email === STAFF_EMAIL,
      "lead now owned by the claimer",
    );

    // Add a hand-written note.
    const note = await fetch(`${API}/v1/admin/leads/${leadId}/notes`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ body: "Called — sending a proposal." }),
    });
    check(note.status === 200, `POST note → 200 (got ${note.status})`);
    const afterNote = await json(await fetch(`${API}/v1/admin/leads/${leadId}`, { headers: H }));
    check(
      (afterNote.notes as { kind: string; body: string }[]).some(
        (n) => n.kind === "note" && n.body.includes("proposal"),
      ),
      "hand-written note appears in the timeline",
    );

    // Invalid status rejected.
    const bad = await fetch(`${API}/v1/admin/leads/${leadId}`, {
      method: "PATCH",
      headers: H,
      body: JSON.stringify({ status: "bogus" }),
    });
    check(bad.status === 422, `invalid status → 422 (got ${bad.status})`);

    // Unauthenticated admin access blocked.
    const noAuth = await fetch(`${API}/v1/admin/leads`);
    check(noAuth.status === 401, `admin list without a token → 401 (got ${noAuth.status})`);
  } finally {
    await db.delete(leads).where(like(leads.email, `${TAG}%`));
    await db.delete(staffUsers).where(eq(staffUsers.id, staffId));
  }

  console.log(pass ? "\nAll lead-flow checks passed." : "\nSome checks FAILED.");
  await closeDb();
  process.exit(pass ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => {});
  process.exit(1);
});
