import { a, b, c, callout, code, DocPage, endpoint, h, list, p, params } from "../types";

export const messages: DocPage = {
  slug: "messages",
  title: "Messages",
  summary: "Send email — inline or templated — and read its full lifecycle back.",
  blocks: [
    p("A message is a single email to a single recipient. Send inline HTML, or reference a template by slug or id and pass variables."),
    h("Send a message"),
    endpoint("POST", "/v1/messages", "Send (or schedule) one email."),
    params([
      { name: "to", type: "string", required: true, desc: ["Recipient address, or ", c("{ email, name }"), "."] },
      { name: "subject", type: "string", desc: ["Required unless the template supplies one."] },
      { name: "html / text", type: "string", desc: ["Inline body. Omit when using a template."] },
      { name: "template", type: "string", desc: ["A template slug. Use ", c("template_id"), " for the id."] },
      { name: "variables", type: "object", desc: ["Values merged into the template (Handlebars). A saved contact's details merge in automatically first — see ", a("Personalization", "messages"), " below."] },
      { name: "from / reply_to", type: "string", desc: ["Override the sender / reply-to (must be a verified sender)."] },
      { name: "type", type: "enum", desc: ["`transactional` (default) or `marketing` — meters against the right wing."] },
      { name: "send_at", type: "string", desc: ["ISO 8601 — schedule for later instead of sending now."] },
      { name: "idempotency_key", type: "string", desc: ["Exactly-once — see ", a("Idempotency", "idempotency"), "."] },
      { name: "tags / metadata", type: "array / object", desc: ["Your own labels; echoed back on events."] },
    ]),
    code(
      "ts",
      `const msg = await mail.messages.create({
  to: { email: "ada@example.com", name: "Ada" },
  template: "welcome",
  variables: { name: "Ada", action_url: "https://acme.com/start" },
  tags: ["onboarding"],
  idempotencyKey: \`welcome-\${user.id}\`,
});
// → { id: "msg_…", status: "queued", … }`,
      "send-template.ts",
    ),
    h("Raw request & response"),
    p("Under the SDK it's a plain JSON POST. The body is snake_case; the response is the full message object (also returned by ", c("GET /v1/messages/:id"), ")."),
    code(
      "json",
      `{
  "to": { "email": "ada@example.com", "name": "Ada" },
  "type": "transactional",
  "template": "welcome",
  "variables": { "name": "Ada", "action_url": "https://acme.com/start" },
  "tags": ["onboarding"],
  "idempotency_key": "welcome-42"
}`,
      "POST /v1/messages — request body",
    ),
    code(
      "json",
      `{
  "id": "msg_1a2b3c4d5e",
  "object": "message",
  "type": "transactional",
  "status": "queued",
  "to": "ada@example.com",
  "from": { "email": "hello@acme.com", "name": "Acme" },
  "reply_to": null,
  "subject": "Welcome to Acme",
  "sub_tenant_id": null,
  "template_id": "tpl_welcome",
  "template_version": 3,
  "priority": "normal",
  "tags": ["onboarding"],
  "metadata": {},
  "attachments": [],
  "opened_at": null,
  "clicked_at": null,
  "idempotency_key": "welcome-42",
  "provider": null,
  "provider_message_id": null,
  "content_hash": "b1946ac9…",
  "sandbox": false,
  "error": null,
  "scheduled_at": null,
  "created_at": "2026-07-22T10:00:00Z",
  "updated_at": "2026-07-22T10:00:00Z"
}`,
      "201 Created — the message",
    ),
    callout("note", "Pass idempotency either as the ", c("idempotency_key"), " field or an ", c("Idempotency-Key"), " request header — a retried key returns the SAME message instead of sending twice."),
    h("Personalization"),
    p(
      "When the recipient is a saved contact, their details fill the template's ",
      c("{{placeholders}}"),
      " automatically — you don't have to look anything up or pass it per send. The same happens for every campaign recipient and sequence enrollee.",
    ),
    list([
      [c("{{email}}"), ", ", c("{{name}}"), ", ", c("{{first_name}}"), ", ", c("{{last_name}}"), ", ", c("{{phone}}"), " — from the contact record (first/last are split from the name)."],
      ["Every custom field on the contact's ", c("metadata"), " is available by its own name — import once, personalize everywhere."],
      ["Precedence: your explicit ", c("variables"), " override contact fields, which override the derived built-ins. ", c("{{unsubscribe_url}}"), " is always rootmail's signed link."],
    ]),
    code(
      "ts",
      `// Contact ada@example.com has { name: "Ada Lovelace", metadata: { plan: "Growth" } }
await mail.messages.create({
  to: "ada@example.com",
  template: "renewal", // "Hi {{first_name}}, your {{plan}} plan renews soon."
  // → "Hi Ada, your Growth plan renews soon." — no variables needed.
});`,
      "personalization.ts",
    ),
    h("Retrieve, audit & prove"),
    endpoint("GET", "/v1/messages", "List messages (paginated, filterable)."),
    endpoint("GET", "/v1/messages/:id", "Fetch one message and its current status."),
    endpoint("GET", "/v1/messages/:id/audit", "The append-only lifecycle trail of every event."),
    endpoint("GET", "/v1/messages/:id/proof", "A signed, verifiable proof bundle for the message."),
    code(
      "ts",
      `const { trail } = await mail.messages.audit(msg.id);
// queued → sending → sent → delivered → opened …
const proof = await mail.messages.proof(msg.id); // { bundle, signature }`,
      "audit.ts",
    ),
    code(
      "json",
      `{
  "message_id": "msg_1a2b3c4d5e",
  "status": "delivered",
  "trail": [
    { "event": "queued",    "actor": "api",    "timestamp": "2026-07-22T10:00:00Z", "metadata": {} },
    { "event": "sending",   "actor": "system", "timestamp": "2026-07-22T10:00:01Z", "metadata": {} },
    { "event": "sent",      "actor": "system", "provider": "ses", "provider_message_id": "0100018f…", "timestamp": "2026-07-22T10:00:02Z", "metadata": {} },
    { "event": "delivered", "actor": "system", "timestamp": "2026-07-22T10:00:05Z", "metadata": {} },
    { "event": "opened",    "actor": "system", "ip": "9x.x.x.x", "user_agent": "Mozilla/5.0…", "timestamp": "2026-07-22T10:14:00Z", "metadata": {} }
  ]
}`,
      "GET /v1/messages/:id/audit — response",
    ),
    callout("note", "Suppressed, bounced, and unsubscribed recipients are checked automatically before every send — you can't accidentally email someone who opted out."),
  ],
};

export const templates: DocPage = {
  slug: "templates",
  title: "Templates",
  summary: "Reusable, versioned email designs you send by slug.",
  blocks: [
    p(
      "Author templates in the dashboard's visual studio (no code) or via the API. Reference one by ",
      c("slug"),
      " when sending and pass ",
      c("variables"),
      " — they're merged with Handlebars. Saved-contact details (name, first_name, custom fields) fill in automatically for every recipient; explicit variables override them.",
    ),
    endpoint("GET", "/v1/templates", "List templates."),
    endpoint("POST", "/v1/templates", "Create a template."),
    endpoint("GET", "/v1/templates/:id", "Fetch one template."),
    endpoint("PATCH", "/v1/templates/:id", "Update subject, body, or blocks."),
    endpoint("DELETE", "/v1/templates/:id", "Delete a template."),
    code(
      "ts",
      `await mail.templates.create({
  slug: "welcome",
  subject: "Welcome to {{product}}, {{name}}!",
  html: "<h1>Hi {{name}}</h1><p>Get started at {{action_url}}.</p>",
});`,
      "template.ts",
    ),
  ],
};

export const senders: DocPage = {
  slug: "senders",
  title: "Sender identities",
  summary: "Send from your own verified addresses and domains.",
  blocks: [
    p("Register the addresses you send from and verify ownership so your mail is authenticated and lands in the inbox."),
    endpoint("GET", "/v1/senders", "List sender identities and their verification state."),
    endpoint("POST", "/v1/senders", "Add a sender address or domain."),
    endpoint("POST", "/v1/senders/:id/check", "Re-check DNS and flip to verified when records are found."),
    endpoint("DELETE", "/v1/senders/:id", "Remove a sender."),
    callout("tip", "Domain-level verification lets you send from any address at that domain. The dashboard shows the exact records to publish and checks them for you."),
  ],
};

export const suppressions: DocPage = {
  slug: "suppressions",
  title: "Suppressions",
  summary: "The do-not-send list — respected automatically, queryable on demand.",
  blocks: [
    p(
      "rootmail maintains a suppression list per workspace (and per client domain): every bounce, complaint, and unsubscribe is added and honored before each send. You can check or import it directly.",
    ),
    endpoint("GET", "/v1/suppressions/check", "Is an address suppressed, and why?"),
    endpoint("POST", "/v1/imports/suppressions", "Bulk-import a suppression list (e.g. from another provider)."),
    endpoint("POST", "/v1/contacts/unsubscribe", "Unsubscribe a contact."),
    code("ts", `const { suppressed, reason } = await mail.suppressions.check("ada@example.com");`, "check.ts"),
    list([
      ["Statuses: ", c("active"), ", ", c("unsubscribed"), ", ", c("bounced"), ", ", c("complained"), "."],
      ["One-click unsubscribe headers are added to marketing mail automatically."],
    ]),
  ],
};
