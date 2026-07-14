import { a, b, c, callout, code, DocPage, h, list, p, params } from "../types";

export const sdk: DocPage = {
  slug: "sdk",
  title: "Node SDK",
  summary: "@rootmail/node — the whole API, fully typed, one import.",
  blocks: [
    p("The official Node client wraps every endpoint with end-to-end TypeScript types, maps snake_case JSON to camelCase, normalizes errors into one ", c("RootMailError"), ", and adds sub-tenant scoping."),
    code("bash", "pnpm add @rootmail/node", "terminal"),
    code(
      "ts",
      `import { RootMail } from "@rootmail/node";

const mail = new RootMail({
  apiKey: process.env.ROOTMAIL_API_KEY!,
  // baseUrl defaults to https://service.gateml.io
});`,
      "init.ts",
    ),
    h("Resources"),
    p("Each API area is a resource on the client:"),
    params([
      { name: "mail.messages", type: "resource", desc: ["create, get, list, audit, proof, recordEvent"] },
      { name: "mail.templates", type: "resource", desc: ["create, get, list, update, remove"] },
      { name: "mail.contacts", type: "resource", desc: ["create, get, unsubscribe"] },
      { name: "mail.lists", type: "resource", desc: ["audiences + membership"] },
      { name: "mail.campaigns", type: "resource", desc: ["create, send, analytics"] },
      { name: "mail.sequences", type: "resource", desc: ["create, enroll, enrollments, analytics"] },
      { name: "mail.threads", type: "resource", desc: ["list, get, reply"] },
      { name: "mail.subTenants", type: "resource", desc: ["client domains + verify"] },
      { name: "mail.webhooks", type: "resource", desc: ["endpoints + deliveries"] },
      { name: "mail.deliverability / mail.analytics", type: "resource", desc: ["reputation + the funnel"] },
      { name: "mail.suppressions / mail.imports", type: "resource", desc: ["do-not-send list + migration"] },
      { name: "mail.compliance / mail.retention", type: "resource", desc: ["proof + retention"] },
      { name: "mail.assistant", type: "resource", desc: ["the AI agent"] },
    ]),
    h("Sub-tenant scoping"),
    code("ts", `const scoped = mail.withSubTenant("tnt_123");
await scoped.messages.create({ to, subject, html }); // sends as that client`, "scoped.ts"),
    callout("tip", "Set ", c("idempotencyKey"), " on any create call to make it safe to retry."),
  ],
};

export const cli: DocPage = {
  slug: "cli",
  title: "CLI",
  summary: "@rootmail/cli — drive the same API from your shell or CI.",
  blocks: [
    code("bash", "npm i -g @rootmail/cli\nexport ROOTMAIL_API_KEY=rm_live_…", "terminal"),
    p("Common commands:"),
    code(
      "bash",
      `rootmail send --to ada@example.com --template welcome
rootmail deliverability                       # reputation score + rates
rootmail import:suppressions sendgrid-export.csv
rootmail assistant "set up a 3-step onboarding sequence"`,
      "terminal",
    ),
    list([
      ["Everything is a subcommand of the same API — scriptable in CI."],
      ["Use a ", c("rm_test_…"), " key to dry-run in the sandbox."],
    ]),
  ],
};

export const migration: DocPage = {
  slug: "migration",
  title: "Migrating in",
  summary: "Move from SendGrid, Postmark, or Mailgun in minutes.",
  blocks: [
    p("Switching providers usually means losing your reputation and re-emailing people who opted out. rootmail imports both your contacts and your suppression list, so neither happens."),
    h("Steps"),
    list([
      ["Export your ", b("suppression/unsubscribe list"), " from your current provider and ", a("import it first", "imports"), "."],
      ["Export your ", b("contacts"), " and import them — anyone previously suppressed stays suppressed."],
      ["Add and verify your ", a("sender domain", "senders"), " (publish a few DNS records; the dashboard checks them)."],
      ["Swap your send calls to ", a("mail.messages.create", "messages"), " — the shape is familiar."],
      ["Point a ", a("webhook", "webhooks"), " at your app for delivery + engagement events."],
    ], true),
    callout("tip", "Run in the sandbox with a test key while you cut over — sandbox sends are free and exercise your full integration."),
  ],
};
