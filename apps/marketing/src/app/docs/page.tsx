import type { Metadata } from "next";
import { CodeBlock } from "@/components/site/code-block";
import { DocPage } from "@/components/site/doc-page";

export const metadata: Metadata = {
  title: "Quickstart",
  description: "Send your first email with the rootmail Node SDK or CLI in minutes.",
};

const install = `pnpm add @rootmail/node`;

const send = `import { RootMail } from "@rootmail/node";

const mail = new RootMail({ apiKey: process.env.ROOTMAIL_API_KEY! });

await mail.send({
  to: "ada@example.com",
  subject: "Welcome aboard",
  html: "<h1>You're in 🎉</h1><p>Thanks for signing up.</p>",
});`;

const template = `await mail.send({
  to: "ada@example.com",
  template: "welcome",
  variables: { name: "Ada", action_url: "https://acme.com/start" },
});`;

const subtenant = `// Send from a customer's own verified domain — isolated reputation
const customer = mail.withSubTenant("tnt_123");

await customer.send({
  to: "guest@example.com",
  subject: "Your booking is confirmed",
  html: "<h1>See you soon!</h1>",
});`;

const cli = `npm i -g @rootmail/cli
export ROOTMAIL_API_KEY=rm_live_…

rootmail send --to ada@example.com --template welcome
rootmail deliverability                 # reputation score + rates
rootmail import:suppressions export.csv # migrate from another provider
rootmail assistant "why did my last email bounce?"`;

export default function DocsPage() {
  return (
    <DocPage title="Quickstart" subtitle="From zero to your first send in three steps.">
      <h2>1. Install the SDK</h2>
      <p>
        The Node SDK wraps the REST API with full TypeScript types — covering sending, sub-tenancy,
        sequences, deliverability, analytics, compliance exports, and the AI assistant. (Any HTTP
        client works too.)
      </p>
      <CodeBlock code={install} filename="terminal" />

      <h2>2. Get an API key</h2>
      <p>
        Create a key in your dashboard under <strong>API keys</strong>. Keys are scoped to a workspace
        (live or test) and are shown once — keep them server-side.
      </p>

      <h2>3. Send your first email</h2>
      <CodeBlock code={send} filename="send.ts" />

      <h2>Send with a template</h2>
      <p>Author reusable templates in the dashboard, then send by slug with variables.</p>
      <CodeBlock code={template} filename="template.ts" />

      <h2>Send on behalf of your customers</h2>
      <p>
        Sub-tenancy lets you send from each customer&apos;s own verified domain, with reputation isolated
        per tenant — the same API, scoped by one call.
      </p>
      <CodeBlock code={subtenant} filename="subtenant.ts" />

      <h2>Prefer the terminal?</h2>
      <p>
        The <strong>@rootmail/cli</strong> drives the same API from your shell or CI — send, inspect
        deliverability, migrate a suppression list, or ask the assistant.
      </p>
      <CodeBlock code={cli} filename="terminal" />

      <h2>Next steps</h2>
      <ul>
        <li>Subscribe to delivery events (delivered, bounced, opened…) with webhooks.</li>
        <li>Automate drips with sequences and bulk sends with campaigns.</li>
        <li>
          Track a <strong>deliverability score</strong> and an open/click <strong>analytics</strong> funnel —
          via <code>mail.deliverability.get()</code> and <code>mail.analytics.get()</code>.
        </li>
        <li>Migrate in minutes — import suppressions &amp; contacts with <code>mail.imports</code>.</li>
        <li>
          Export Ed25519-signed <strong>proof bundles</strong> and set data-retention policies for
          compliance.
        </li>
        <li>See the full plan comparison on the <a href="/pricing">pricing page</a>.</li>
      </ul>
    </DocPage>
  );
}
