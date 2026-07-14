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
      { name: "variables", type: "object", desc: ["Values merged into the template (Handlebars)."] },
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
      " — they're merged with Handlebars.",
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
