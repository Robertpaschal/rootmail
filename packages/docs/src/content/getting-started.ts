import { a, b, c, callout, code, DocPage, endpoint, h, list, p, params } from "../types";

export const quickstart: DocPage = {
  slug: "quickstart",
  title: "Quickstart",
  summary: "From zero to your first send in three steps — SDK, CLI, or raw HTTP.",
  blocks: [
    p(
      "rootmail is one email platform with four front doors: the ",
      a("web dashboard", "https://dashboard.gateml.io"),
      ", the typed Node SDK, the CLI, and the REST API. Everything the dashboard does is available in code, and everything you build in code stays editable in the dashboard. This guide sends your first email in three steps.",
    ),
    h("1. Get an API key"),
    p(
      "Create a key in the dashboard under ",
      b("Developers → API keys"),
      ". Keys are scoped to a single workspace and environment — ",
      c("rm_live_…"),
      " keys send real mail, ",
      c("rm_test_…"),
      " keys run in the sandbox (never delivered, never billed). A key's secret is shown once, so store it somewhere safe.",
    ),
    callout("tip", "Keep keys server-side. Never ship a live key in a browser bundle or mobile app."),
    h("2. Install the SDK"),
    p("The official Node SDK is the fastest path. Any HTTP client works too — see the REST tab below."),
    code("bash", "pnpm add @rootmail/node", "terminal"),
    h("3. Send your first email"),
    code(
      "ts",
      `import { RootMail } from "@rootmail/node";

const mail = new RootMail({ apiKey: process.env.ROOTMAIL_API_KEY! });

await mail.messages.create({
  to: "ada@example.com",
  subject: "Welcome aboard",
  html: "<h1>You're in 🎉</h1><p>Thanks for signing up.</p>",
});`,
      "send.ts",
    ),
    p("The same call over raw HTTP:"),
    code(
      "bash",
      `curl https://service.gateml.io/v1/messages \\
  -H "Authorization: Bearer $ROOTMAIL_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "ada@example.com",
    "subject": "Welcome aboard",
    "html": "<h1>You'\\''re in 🎉</h1>"
  }'`,
      "terminal",
    ),
    p("Or from the terminal with the CLI:"),
    code(
      "bash",
      `npm i -g @rootmail/cli
export ROOTMAIL_API_KEY=rm_live_…
rootmail send --to ada@example.com --subject "Welcome aboard" --html "<h1>You're in</h1>"`,
      "terminal",
    ),
    h("What next"),
    list([
      [a("Authentication", "authentication"), " — keys, environments, and scoping."],
      [a("Send a template", "messages"), " — author reusable templates, send by slug with variables."],
      [a("Webhooks", "webhooks"), " — get delivery, open, click, bounce, and inbound-reply events."],
      [a("Idempotency", "idempotency"), " — make retries safe so you never double-send."],
    ]),
  ],
};

export const authentication: DocPage = {
  slug: "authentication",
  title: "Authentication",
  summary: "Bearer API keys, live vs. test environments, and how requests are scoped.",
  blocks: [
    p(
      "Every request authenticates with an API key in the ",
      c("Authorization"),
      " header as a Bearer token:",
    ),
    code("bash", `Authorization: Bearer rm_live_8f2a…`, "header"),
    p(
      "The dashboard also accepts your logged-in session for its own server-side calls, but for the API and SDK you always use a key. Only the SHA-256 hash of a key is stored — if you lose it, roll a new one; it can't be recovered.",
    ),
    h("Live vs. test"),
    params([
      { name: "rm_live_…", type: "key", desc: ["Sends real email. Counts against your plan."] },
      {
        name: "rm_test_…",
        type: "key",
        desc: ["Runs in the sandbox: accepted, fully processed, but ", b("never delivered and never billed"), ". Perfect for CI."],
      },
    ]),
    p(
      "A key belongs to one workspace, so the environment (live/test) is the workspace it was created in — you don't pass an environment flag.",
    ),
    h("Managing keys"),
    endpoint("GET", "/v1/api-keys", "List your keys (prefix + metadata; never the secret)."),
    endpoint("POST", "/v1/api-keys", "Mint a new key — the secret is returned once."),
    endpoint("DELETE", "/v1/api-keys/:id", "Revoke a key immediately."),
    callout(
      "note",
      "Signing up mints no key automatically — the dashboard runs on your session. Create keys on demand under Developers → API keys when you're ready to integrate.",
    ),
    h("Scoping to a client (sub-tenant)"),
    p(
      "If you send on behalf of your own customers, add the ",
      c("X-Rootmail-Subtenant"),
      " header (or ",
      c("mail.withSubTenant(id)"),
      " in the SDK) to scope a request to one client's domain, contacts, and reputation. See ",
      a("Client domains", "client-domains"),
      ".",
    ),
  ],
};

export const baseUrl: DocPage = {
  slug: "base-url",
  title: "Base URL & conventions",
  summary: "Where the API lives, and the conventions every endpoint shares.",
  blocks: [
    p("All API requests go to a single versioned base URL:"),
    code("bash", "https://service.gateml.io/v1", "base URL"),
    h("Conventions"),
    list([
      ["JSON in, JSON out. Request and response bodies are ", b("snake_case"), "."],
      ["Every resource has a prefixed id — ", c("msg_…"), ", ", c("tmpl_…"), ", ", c("cmp_…"), " — so an id is self-describing."],
      ["Responses wrap single objects as ", c("{ object: \"message\", … }"), " and collections as ", c("{ object: \"list\", data: [...], next_cursor }"), "."],
      ["Timestamps are ISO 8601 UTC strings."],
      ["Writes validate strictly and fail closed with a ", a("structured error", "errors"), "."],
    ]),
    h("The SDK maps casing for you"),
    p(
      "The Node SDK speaks camelCase to your code and translates to the API's snake_case on the wire, so you never think about it:",
    ),
    code(
      "ts",
      `const msg = await mail.messages.create({ to, subject, html });
console.log(msg.id, msg.createdAt); // camelCase in JS`,
      "casing.ts",
    ),
  ],
};
