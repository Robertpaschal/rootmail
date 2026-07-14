import { a, b, c, callout, code, DocPage, endpoint, h, list, p, params } from "../types";

export const webhooks: DocPage = {
  slug: "webhooks",
  title: "Webhooks",
  summary: "Signed, idempotent events for the full email lifecycle and inbound replies.",
  blocks: [
    p("Register an endpoint and rootmail POSTs a signed JSON event whenever something happens to your mail. Deliveries are retried with backoff and each endpoint has a delivery log you can inspect and replay."),
    h("Manage endpoints"),
    endpoint("GET", "/v1/webhook-endpoints", "List your endpoints."),
    endpoint("POST", "/v1/webhook-endpoints", "Register an endpoint (URL + events). Returns a signing secret."),
    endpoint("GET", "/v1/webhook-endpoints/:id", "Fetch one endpoint."),
    endpoint("PATCH", "/v1/webhook-endpoints/:id", "Change the URL or subscribed events."),
    endpoint("GET", "/v1/webhook-endpoints/:id/deliveries", "The delivery log — inspect and replay."),
    endpoint("DELETE", "/v1/webhook-endpoints/:id", "Remove an endpoint."),
    h("Events"),
    params([
      { name: "message.sent", type: "event", desc: ["Accepted and handed to the provider."] },
      { name: "message.delivered", type: "event", desc: ["Confirmed delivered to the recipient's server."] },
      { name: "message.opened", type: "event", desc: ["The recipient opened it."] },
      { name: "message.clicked", type: "event", desc: ["The recipient clicked a tracked link."] },
      { name: "message.bounced", type: "event", desc: ["Hard or soft bounce — the reason is included."] },
      { name: "message.complained", type: "event", desc: ["Marked as spam by the recipient."] },
      { name: "message.failed", type: "event", desc: ["Could not be sent."] },
      { name: "message.suppressed", type: "event", desc: ["Skipped because the address was on the suppression list."] },
      { name: "message.received", type: "event", desc: ["An inbound reply arrived (threaded)."] },
    ]),
    h("Verify the signature"),
    p(
      "Every delivery carries a ",
      c("Rootmail-Signature"),
      " header: a timestamp and an HMAC-SHA256 of ",
      c("`${timestamp}.${rawBody}`"),
      " keyed with your endpoint's signing secret. Verify it before trusting a payload, and reject stale timestamps to stop replays.",
    ),
    code(
      "ts",
      `import crypto from "node:crypto";

// header: "Rootmail-Signature: t=1718531200,v1=<hex>"
export function verify(raw: string, header: string, secret: string): boolean {
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=")));
  const expected = crypto
    .createHmac("sha256", secret)
    .update(\`\${parts.t}.\${raw}\`)
    .digest("hex");
  const ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1 ?? ""));
  const fresh = Math.abs(Date.now() / 1000 - Number(parts.t)) < 300; // 5 min
  return ok && fresh;
}`,
      "verify-webhook.ts",
    ),
    callout("warn", "Verify against the RAW request body, before any JSON parsing or middleware reformats it — re-serialized JSON won't match the signature."),
    callout("note", "An endpoint that fails 10 deliveries in a row is auto-disabled; re-enable it from the dashboard once your receiver is healthy."),
  ],
};

export const clientDomains: DocPage = {
  slug: "client-domains",
  title: "Client domains (sub-tenancy)",
  summary: "Send on behalf of your own customers, each from their verified domain.",
  blocks: [
    p(
      "If you're an agency or a platform, client domains let each of your customers send from their own address with their own reputation — isolated from one another and from you. Provision a client, hand back the DNS records, verify them, then send scoped to that client.",
    ),
    endpoint("GET", "/v1/sub-tenants", "List client domains."),
    endpoint("POST", "/v1/sub-tenants", "Provision a client — returns the DNS records to publish."),
    endpoint("GET", "/v1/sub-tenants/:id", "Fetch a client and its verification state."),
    endpoint("POST", "/v1/sub-tenants/:id/verify", "Check DNS live and mark the client verified."),
    h("Send as a client"),
    p(
      "Scope any request to a client with ",
      c("mail.withSubTenant(id)"),
      " (SDK) or the ",
      c("X-Rootmail-Subtenant"),
      " header (HTTP). The client's contacts, suppression list, audit trail, and reputation all stay their own.",
    ),
    code(
      "ts",
      `const client = await mail.subTenants.create({
  name: "Sunset Villas",
  sendingDomain: "sunsetvillas.com",
});
// hand client.dns_records to your customer, then:
await mail.subTenants.verify(client.id);

await mail.withSubTenant(client.id).messages.create({
  to: "guest@example.com",
  subject: "Your booking is confirmed",
  html: "<h1>See you soon!</h1>",
});`,
      "client-domain.ts",
    ),
    list([
      ["One client's bounce or complaint never touches another's deliverability."],
      ["Everything rolls up to you for billing and oversight."],
      ["Client domains are sold per-domain — buy them with a plan or on their own."],
    ]),
  ],
};

export const insights: DocPage = {
  slug: "insights",
  title: "Deliverability & analytics",
  summary: "A reputation score with fixes, and the full engagement funnel.",
  blocks: [
    h("Deliverability"),
    p("A 0–100 reputation score computed from your real sending outcomes, with specific fixes and the exact DNS records to publish."),
    endpoint("GET", "/v1/deliverability", "Your score, grade, rates, and recommendations."),
    code("ts", `const rep = await mail.deliverability.get();
console.log(rep.score, rep.grade); // 96 "A"`, "deliverability.ts"),
    h("Analytics"),
    p("The engagement funnel — sent → delivered → opened → clicked — platform-wide, or per campaign and per sequence."),
    endpoint("GET", "/v1/analytics", "The funnel and rates over a window."),
    code("ts", `const stats = await mail.analytics.get({ windowDays: 30 });
console.log(stats.rates.open, stats.rates.click);`, "analytics.ts"),
  ],
};

export const compliance: DocPage = {
  slug: "compliance",
  title: "Proof & compliance",
  summary: "Signed, verifiable records of what you sent — and data-retention controls.",
  blocks: [
    p("For disputes, audits, and regulators: export a cryptographically signed record of exactly what was sent and when. Anyone can verify it without trusting you."),
    endpoint("GET", "/v1/messages/:id/proof", "A signed proof bundle for one message."),
    endpoint("GET", "/v1/exports/compliance", "A signed export over a date range (Enterprise)."),
    endpoint("POST", "/v1/proof/verify", "Verify a bundle + signature — offline-checkable."),
    endpoint("GET", "/v1/retention", "Your data-retention policy."),
    endpoint("PUT", "/v1/retention", "Set redact/delete retention rules."),
    code(
      "ts",
      `const proof = await mail.messages.proof(msg.id);   // { bundle, signature }
const valid = await mail.compliance.verify(proof);  // true — tamper-evident`,
      "proof.ts",
    ),
    callout("note", "Proof bundles are Ed25519-signed; any edit to the recorded events breaks the signature."),
  ],
};

export const assistant: DocPage = {
  slug: "assistant",
  title: "AI assistant",
  summary: "An agent that builds, operates, and diagnoses your email — over the API.",
  blocks: [
    p(
      "The same assistant you use in the dashboard is available programmatically. Ask in plain language — “set up a 3-step onboarding sequence”, “why did my last campaign bounce?” — and it plans and executes within your plan, role, and AI-credit limits, then reports what it did.",
    ),
    endpoint("POST", "/v1/assistant/chats", "Start a chat / send a message to the agent."),
    endpoint("GET", "/v1/assistant/chats", "List your chats."),
    endpoint("GET", "/v1/assistant/chats/:id", "Fetch a chat's history."),
    endpoint("PATCH", "/v1/assistant/chats/:id", "Rename a chat."),
    endpoint("DELETE", "/v1/assistant/chats/:id", "Delete a chat."),
    code("ts", `const res = await mail.assistant.ask("why did my last campaign bounce?");
console.log(res.reply);`, "assistant.ts"),
    callout("note", "A failed model call bills 0 credits. The agent only ever acts within the permissions of the key or user making the request."),
  ],
};
