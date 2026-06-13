"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CodeBlock } from "./code-block";
import { cn } from "@/lib/utils";

const tabs = [
  {
    id: "send",
    label: "Transactional",
    filename: "send.ts",
    code: `import { RootMail } from "@rootmail/node";

const mail = new RootMail({ apiKey: process.env.ROOTMAIL_API_KEY! });

// Idempotent transactional send — retries never double-send.
await mail.send({
  to: "user@example.com",
  template: "password-reset",
  variables: { reset_url, user_name },
  idempotencyKey: \`pwd-reset-\${user.id}\`,
});`,
  },
  {
    id: "subtenant",
    label: "Sub-tenancy",
    filename: "onboard.ts",
    code: `// Give a platform customer their own sending domain.
const tenant = await mail.subTenants.create({
  name: "Sunset Villas",
  sendingDomain: "sunsetvillas.com",
  externalId: "customer_8821",
});

// tenant.dns_records → drop straight into your onboarding UI.
await mail.subTenants.verify(tenant.id);

// Now send as that tenant, from bookings@sunsetvillas.com.
await mail.withSubTenant(tenant.id).send({
  to: "guest@gmail.com",
  subject: "Your booking is confirmed",
  html: "<h1>See you soon!</h1>",
});`,
  },
  {
    id: "audit",
    label: "Audit trail",
    filename: "audit.ts",
    code: `// The full, append-only lifecycle of any message.
const { trail } = await mail.messages.audit(message.id);

for (const event of trail) {
  console.log(event.timestamp, event.event);
}

// 2026-06-13T10:00:00Z  queued
// 2026-06-13T10:00:01Z  sending
// 2026-06-13T10:00:02Z  sent
// 2026-06-13T10:00:05Z  delivered
// 2026-06-13T10:01:30Z  opened`,
  },
];

const highlights = [
  "Fully typed @rootmail/node SDK",
  "Idempotency keys on every send",
  "Sub-tenant scoping with withSubTenant()",
  "Append-only, queryable audit trail",
];

export function CodeShowcase() {
  const [active, setActive] = useState(0);

  return (
    <section id="code" className="border-t border-border/60 bg-secondary/30 py-20 md:py-28">
      <div className="container grid items-center gap-12 lg:grid-cols-2">
        <div>
          <Badge className="mb-4">Developers</Badge>
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            An API you can hold in your head
          </h2>
          <p className="mt-4 text-balance text-lg text-muted-foreground">
            snake_case JSON over HTTPS, a typed Node SDK, idempotency on every send, and sub-tenant
            scoping with a single call. Read the trail back whenever you need to prove what happened.
          </p>
          <ul className="mt-6 space-y-3">
            {highlights.map((h) => (
              <li key={h} className="flex items-center gap-3 text-sm">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                  <Check className="size-3.5" />
                </span>
                {h}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            {tabs.map((t, i) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActive(i)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  i === active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <CodeBlock code={tabs[active].code} filename={tabs[active].filename} className="text-left" />
        </div>
      </div>
    </section>
  );
}
