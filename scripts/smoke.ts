/**
 * End-to-end smoke test — drives the @rootmail/node SDK against a running
 * API + worker. Exercises: sub-tenant provisioning + DNS verification, sending
 * (template + inline), the audit trail, idempotency, sub-tenant sending,
 * suppression, and lifecycle-event ingestion.
 *
 *   ROOTMAIL_API_KEY=rm_live_... pnpm exec tsx scripts/smoke.ts
 */
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { RootMail, RootMailError } from "../packages/sdk/src/index";

const apiKey = process.env.ROOTMAIL_API_KEY ?? "";
const baseUrl = process.env.ROOTMAIL_BASE_URL ?? "http://localhost:4000";
if (!apiKey) {
  console.error("Set ROOTMAIL_API_KEY (see `pnpm db:seed` output).");
  process.exit(1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}${extra ? ` — ${extra}` : ""}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

async function main() {
  const mail = new RootMail({ apiKey, baseUrl });

  console.log("\n[1] Health");
  const health = (await fetch(`${baseUrl}/health`).then((r) => r.json())) as {
    status: string;
    checks: Record<string, string>;
  };
  check("GET /health ok", health.status === "ok", JSON.stringify(health.checks));

  console.log("\n[2] Sub-tenant provisioning (the wedge)");
  const domain = `sunsetvillas-${Date.now()}.com`;
  const tenant = await mail.subTenants.create({
    name: "Sunset Villas",
    sendingDomain: domain,
    externalId: "customer_8821",
  });
  check("sub-tenant created", tenant.status === "pending_verification", tenant.id);
  check("DNS records returned", (tenant.dns_records?.length ?? 0) >= 2);
  for (const r of tenant.dns_records ?? []) {
    const v = r.value.length > 50 ? `${r.value.slice(0, 50)}…` : r.value;
    console.log(`      ${r.type}  ${r.host}\n           -> ${v}`);
  }

  console.log("\n[3] Domain verification (DNS_VERIFY_MODE=mock)");
  const verified = await mail.subTenants.verify(tenant.id);
  check("sub-tenant verified", verified.verified && verified.status === "verified");

  console.log("\n[4] Send transactional (workspace-level, via template)");
  const msg = await mail.send({
    to: "ada@example.com",
    template: "welcome",
    variables: { name: "Ada", product: "rootmail", action_url: "https://rootmail.io" },
    metadata: { user_id: "usr_1" },
  });
  check("message queued", msg.status === "queued", `${msg.id} (${msg.subject})`);

  await sleep(1200);
  const got = await mail.messages.get(msg.id);
  check("worker delivered message", got.status === "delivered", got.status);
  const audit = await mail.messages.audit(msg.id);
  const events = audit.trail.map((t) => t.event);
  check(
    "audit trail complete",
    ["queued", "sending", "sent", "delivered"].every((e) => events.includes(e)),
    events.join(" → "),
  );

  console.log("\n[5] Idempotency");
  const key = `demo-${Date.now()}`;
  const a = await mail.send({ to: "dup@example.com", subject: "Hi", html: "<p>Hi</p>", idempotencyKey: key });
  const b = await mail.send({ to: "dup@example.com", subject: "Hi", html: "<p>Hi</p>", idempotencyKey: key });
  check("same key → same message", a.id === b.id, a.id);

  console.log("\n[6] Send via sub-tenant (from their verified domain)");
  const tenantMail = mail.withSubTenant(tenant.id);
  const tMsg = await tenantMail.send({
    to: "guest@gmail.com",
    subject: "Your booking is confirmed",
    html: "<h1>See you soon!</h1><p>Your stay at Sunset Villas is booked.</p>",
  });
  const fromEmail = typeof tMsg.from === "object" ? tMsg.from.email : tMsg.from;
  check("from = sub-tenant domain", fromEmail === `no-reply@${domain}`, String(fromEmail));
  await sleep(900);
  check("sub-tenant message delivered", (await tenantMail.messages.get(tMsg.id)).status === "delivered");

  console.log("\n[7] Suppression");
  await mail.contacts.unsubscribe("optout@example.com");
  const sup = await mail.send({ to: "optout@example.com", subject: "Hello", html: "<p>Hi</p>" });
  check("send to unsubscribed → suppressed", sup.status === "suppressed", sup.status);
  check("isSuppressed() true", await mail.contacts.isSuppressed("optout@example.com"));

  console.log("\n[8] Lifecycle events (open + click)");
  await mail.messages.recordEvent(msg.id, { event: "opened", ip: "102.89.1.1" });
  await mail.messages.recordEvent(msg.id, { event: "clicked", url: "https://rootmail.io" });
  const ev2 = (await mail.messages.audit(msg.id)).trail.map((t) => t.event);
  check("audit shows opened + clicked", ev2.includes("opened") && ev2.includes("clicked"));

  console.log("\n[9] Mock provider output (.maildir)");
  try {
    const files = (await readdir(resolve(process.cwd(), ".maildir"))).filter((f) => f.endsWith(".eml"));
    check(".eml files written", files.length >= 3, `${files.length} files`);
  } catch (err) {
    check(".maildir present", false, String(err));
  }

  console.log("\n[10] Content & automation resources (SDK parity)");
  // Templates
  const tplList = await mail.templates.list();
  check("templates.list returns the seed template", tplList.data.some((t) => t.slug === "welcome"));
  const slug = `smoke-${Date.now()}`;
  const tpl = await mail.templates.create({
    name: "Smoke",
    slug,
    type: "transactional",
    subject: "Hi {{name}}",
    html: "<p>Hi {{name}}</p>",
  });
  check("templates.create", tpl.slug === slug, tpl.id);
  check("templates.update", (await mail.templates.update(tpl.id, { subject: "Hello {{name}}" })).subject === "Hello {{name}}");
  check("templates.delete", (await mail.templates.delete(tpl.id)).deleted);

  // Lists + contacts
  const list = await mail.lists.create({ name: `Smoke list ${Date.now()}` });
  check("lists.create", Boolean(list.id), list.id);
  await mail.lists.addContact(list.id, "listmember@example.com");
  check("lists.addContact + contacts", (await mail.lists.contacts(list.id)).data.some((c) => c.email === "listmember@example.com"));
  check("lists.delete", (await mail.lists.delete(list.id)).deleted);

  // Sequences (Scale feature; the seed org is Scale)
  const seq = await mail.sequences.create({ name: `Smoke seq ${Date.now()}`, trigger: { type: "manual" } });
  check("sequences.create", Boolean(seq.id), seq.id);
  await mail.sequences.enroll(seq.id, "enrollee@example.com");
  check("sequences.enroll + enrollments", (await mail.sequences.enrollments(seq.id)).data.length >= 1);
  check("sequences.delete", (await mail.sequences.delete(seq.id)).deleted);

  // Campaigns (create/get/update/delete only — no blast)
  const camp = await mail.campaigns.create({ name: `Smoke campaign ${Date.now()}` });
  check("campaigns.create", Boolean(camp.id), camp.id);
  check("campaigns.get", (await mail.campaigns.get(camp.id)).id === camp.id);
  check("campaigns.update", (await mail.campaigns.update(camp.id, { name: "Renamed" })).name === "Renamed");
  check("campaigns.delete", (await mail.campaigns.delete(camp.id)).deleted);

  // Threads (Layer 2 — opened by earlier sends)
  check("threads.list", Array.isArray((await mail.threads.list()).data));

  // Webhooks (endpoint management + signing secret + delivery log)
  const hook = await mail.webhooks.create({
    url: "https://example.com/rootmail-hook",
    events: ["message.delivered"],
    description: "smoke",
  });
  check("webhooks.create returns signing secret", hook.secret?.startsWith("whsec_"), hook.id);
  check("webhooks.list", (await mail.webhooks.list()).data.some((w) => w.id === hook.id));
  check(
    "webhooks.update",
    (await mail.webhooks.update(hook.id, { status: "disabled" })).status === "disabled",
  );
  check("webhooks.deliveries", Array.isArray((await mail.webhooks.deliveries(hook.id)).data));
  check("webhooks.delete", (await mail.webhooks.delete(hook.id)).deleted);

  console.log(`\n${"=".repeat(52)}`);
  console.log(`  RESULT: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(52));
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  if (err instanceof RootMailError) {
    console.error(`RootMailError ${err.status} ${err.code}: ${err.message}`, err.details ?? "");
  } else {
    console.error(err);
  }
  process.exit(1);
});
