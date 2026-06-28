import Link from "next/link";
import { ArrowRight, KeyRound, Network, Terminal, Webhook } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const CURL = `curl https://api.rootmail.dev/v1/messages \\
  -H "Authorization: Bearer rm_live_…" \\
  -H "Content-Type: application/json" \\
  -d '{"to":"ada@example.com","subject":"Hi","html":"<p>Hello</p>"}'`;

const SDK = `import { Rootmail } from "@rootmail/node";

const rootmail = new Rootmail({ apiKey: process.env.ROOTMAIL_API_KEY });
await rootmail.messages.send({
  to: "ada@example.com",
  subject: "Hi",
  html: "<p>Hello</p>",
});`;

const CLI = `npx @rootmail/cli send \\
  --to ada@example.com --subject "Hi" --html "<p>Hello</p>"`;

const links = [
  { href: "/api-keys", icon: KeyRound, title: "API keys", desc: "Create and manage keys." },
  { href: "/webhooks", icon: Webhook, title: "Webhooks", desc: "Subscribe to lifecycle + inbound events." },
  { href: "/sub-tenants", icon: Network, title: "Sub-tenants", desc: "Send on behalf of your own customers." },
];

export default function DocsPage() {
  return (
    <>
      <PageHeader
        title="Developer docs"
        description="Send through the REST API, the @rootmail/node SDK, or the CLI. Everyday work needs none of this — it's here for when you want to integrate."
      />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quickstart</CardTitle>
            <CardDescription>
              Create a key under <Link href="/api-keys" className="text-primary hover:underline">API keys</Link>, set it
              as <code className="font-mono text-xs">ROOTMAIL_API_KEY</code>, then send. The API is snake_case, idempotent,
              and authenticated with a Bearer token.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Block label="REST (curl)" code={CURL} />
            <Block label="Node SDK" code={SDK} />
            <Block label="CLI" code={CLI} icon={Terminal} />
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-3">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="group block">
              <Card className="h-full transition-colors group-hover:border-primary/40">
                <CardContent className="flex items-start gap-3 p-5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-foreground">
                    <l.icon className="size-4" />
                  </span>
                  <div>
                    <p className="font-medium">{l.title}</p>
                    <p className="text-sm text-muted-foreground">{l.desc}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <p className="text-sm text-muted-foreground">
          Want the assistant to wire something up?{" "}
          <Link href="/assistant" className="inline-flex items-center gap-1 text-primary hover:underline">
            Ask it to build or debug a send <ArrowRight className="size-3.5" />
          </Link>
        </p>
      </div>
    </>
  );
}

function Block({ label, code, icon: Icon }: { label: string; code: string; icon?: typeof Terminal }) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {Icon ? <Icon className="size-3.5" /> : null}
        {label}
      </p>
      <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 text-xs">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}
