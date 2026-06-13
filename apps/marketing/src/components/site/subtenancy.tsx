import { CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const steps = [
  "Create the sub-tenant with one API call.",
  "Hand back the returned TXT records — ownership, DKIM & SPF.",
  "Verify: rootmail checks DNS live and flips the tenant to verified.",
  "Send from their domain, with audit & suppression isolated per tenant.",
];

const records = [
  {
    purpose: "ownership",
    host: "_rootmail.sunsetvillas.com",
    value: "rootmail-verify=8f2a91c4…c1",
  },
  {
    purpose: "dkim",
    host: "rootmail._domainkey.sunsetvillas.com",
    value: "v=DKIM1; k=rsa; p=MIIBIjANBg…",
  },
  {
    purpose: "spf",
    host: "sunsetvillas.com",
    value: "v=spf1 include:rootmail.io ~all",
  },
];

export function SubTenancy() {
  return (
    <section className="py-20 md:py-28">
      <div className="container grid items-center gap-12 lg:grid-cols-2">
        <div>
          <Badge className="mb-4">The sub-tenancy wedge</Badge>
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            Give every customer their own sending domain
          </h2>
          <p className="mt-4 text-balance text-lg text-muted-foreground">
            Provision a tenant, hand back the exact DNS records to publish, verify them live, and
            start sending from their domain — DKIM, SPF, and reputation isolated per tenant. In local
            mock mode it auto-verifies, so you can demo the whole flow without a real domain.
          </p>
          <ol className="mt-6 space-y-4">
            {steps.map((s, i) => (
              <li key={s} className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {i + 1}
                </span>
                <span className="text-sm text-muted-foreground">{s}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between border-b pb-3">
            <span className="text-sm font-medium">DNS records</span>
            <span className="font-mono text-xs text-muted-foreground">sunsetvillas.com</span>
          </div>
          <div className="divide-y">
            {records.map((r) => (
              <div key={r.purpose} className="flex flex-col gap-1.5 py-3.5">
                <div className="flex items-center gap-2">
                  <Badge variant="muted" className="uppercase">
                    {r.purpose}
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">TXT</span>
                </div>
                <code className="truncate font-mono text-[13px] text-foreground">{r.host}</code>
                <code className="truncate font-mono text-xs text-muted-foreground">{r.value}</code>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">
            <CheckCircle2 className="size-4" />
            All records found — domain verified
          </div>
        </div>
      </div>
    </section>
  );
}
