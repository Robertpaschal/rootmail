import { Check, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type LayerStatus = "available" | "planned";

interface Layer {
  n: number;
  title: string;
  status: LayerStatus;
  blurb: string;
  points: string[];
}

const layers: Layer[] = [
  {
    n: 1,
    title: "Identity & Sending",
    status: "available",
    blurb:
      "Workspaces send mail. Spawn sub-tenants — each with their own verified domain, DKIM keys, reputation, and contacts, all reporting up to the parent.",
    points: [
      "Transactional, marketing & sales sends",
      "Per-sub-tenant domains, DKIM & SPF",
      "Append-only audit trail",
      "Suppression, contacts & idempotency",
    ],
  },
  {
    n: 2,
    title: "Conversation",
    status: "available",
    blurb:
      "Every message is a thread. Inbound replies are parsed, attached, and routed back via webhook or a shared inbox.",
    points: [
      "Inbound parsing & threading",
      "Shared inbox & reply routing",
      "Sequence exit-on-reply",
      "message.received webhooks",
    ],
  },
  {
    n: 3,
    title: "Proof",
    status: "available",
    blurb:
      "Cryptographically signed, exportable proof bundles of a message's entire lifecycle — built for compliance and disputes.",
    points: [
      "Ed25519-signed proof bundles",
      "Full lifecycle attestation",
      "One-click export",
      "GDPR export & deletion",
    ],
  },
];

export function LayerModel() {
  return (
    <section id="layers" className="border-t border-border/60 bg-secondary/30 py-20 md:py-28">
      <div className="container">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <Badge className="mb-4">The platform</Badge>
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            Three layers. One data model.
          </h2>
          <p className="mt-4 text-balance text-lg text-muted-foreground">
            A solo dev only ever touches Layer 1. A platform builder turns on sub-tenants. A fintech
            turns on proof bundles. Same API the whole way up — nothing to migrate as you grow.
          </p>
        </div>

        <div className="mx-auto grid max-w-5xl gap-4">
          {layers.map((l) => {
            const live = l.status === "available";
            return (
              <div
                key={l.n}
                className={cn(
                  "relative flex flex-col gap-5 rounded-2xl border p-6 transition-colors md:flex-row md:items-start md:gap-8 md:p-8",
                  live ? "border-primary/30 bg-card shadow-sm" : "border-border bg-card/40",
                )}
              >
                <div className="flex items-center gap-4 md:w-64 md:shrink-0 md:flex-col md:items-start">
                  <div
                    className={cn(
                      "grid size-12 shrink-0 place-items-center rounded-xl text-lg font-bold",
                      live ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {l.n}
                  </div>
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Layer {l.n}
                    </div>
                    <h3 className="text-xl font-semibold">{l.title}</h3>
                    <div className="mt-2">
                      {live ? (
                        <Badge variant="success">
                          <Check /> Available now
                        </Badge>
                      ) : (
                        <Badge variant="muted">
                          <Clock /> On the roadmap
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex-1">
                  <p className="text-muted-foreground">{l.blurb}</p>
                  <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                    {l.points.map((p) => (
                      <li key={p} className="flex items-start gap-2 text-sm">
                        <Check
                          className={cn(
                            "mt-0.5 size-4 shrink-0",
                            live ? "text-primary" : "text-muted-foreground/50",
                          )}
                        />
                        <span className={live ? "" : "text-muted-foreground"}>{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
