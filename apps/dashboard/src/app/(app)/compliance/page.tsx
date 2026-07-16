import { Clock, Globe2, ShieldCheck } from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { FeatureLocked, type FeatureLockedInfo, asFeatureLocked } from "@/components/app/feature-locked";
import { PageHeader } from "@/components/app/page-header";
import { Reveal } from "@/components/app/motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Organization, RetentionPolicy } from "@/lib/types";
import { ExportForm } from "./export-form";
import { RetentionForm } from "./retention-form";

// Human labels for the regions rootmail can pin an org's data to.
const REGION_LABELS: Record<string, string> = {
  "us-east-1": "United States — US East (N. Virginia)",
};

// Signed exports + retention unlock via the Proof exports add-on. Probe the
// gated endpoint and let the API's 402 payload drive the lock screen — it
// carries the real add-on name, price, and purchase deep-link, so this page
// can never drift from the live catalog.
export default async function CompliancePage() {
  let retention: RetentionPolicy | null = null;
  let org: Organization | null = null;
  let locked: FeatureLockedInfo | null = null;
  try {
    retention = await api.getRetention();
    org = await api.getOrganization().catch(() => null);
  } catch (err) {
    if (err instanceof ApiError && err.code === "feature_locked") locked = asFeatureLocked(err.details);
    else {
      return (
        <>
          <PageHeader title="Compliance" description="Signed, tamper-evident records of everything you sent." />
          <ConnectionErrorCard
            message={
              err instanceof ConnectionError || err instanceof ApiError ? err.message : "An unexpected error occurred."
            }
            showReconnect={err instanceof ApiError}
          />
        </>
      );
    }
  }

  return (
    <>
      <PageHeader
        title="Compliance"
        description="Export a signed, tamper-evident record of everything you sent — prove exactly what went out, and when."
      />

      {locked ? (
        <Reveal>
          <FeatureLocked
            info={locked}
            blurb="Signed, audit-grade compliance exports — the same Layer-3 proof as a single message, batched across any date range — plus automated data-retention policies."
          />
        </Reveal>
      ) : (
        <div className="space-y-6">
          <Reveal className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Signed compliance export</CardTitle>
                <CardDescription>
                  A JSON bundle of every message in the range with its content hash and full delivery audit
                  trail, signed with rootmail&apos;s Ed25519 key.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ExportForm />
              </CardContent>
            </Card>

            <Card className="h-fit lg:col-span-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="size-4 text-muted-foreground" />
                  Tamper-evident
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Anyone can verify a bundle hasn&apos;t been altered by posting its <code>bundle</code> and{" "}
                  <code>signature</code> to <code className="font-mono text-xs">/v1/proof/verify</code> — no
                  account needed.
                </p>
                <p>The signature covers a canonical serialization, so re-ordering or editing any field breaks it.</p>
              </CardContent>
            </Card>
          </Reveal>

          {retention ? (
            <Reveal delay={0.06}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Clock className="size-4 text-muted-foreground" />
                    Data retention
                  </CardTitle>
                  <CardDescription>
                    Automatically redact or delete messages older than a chosen window — for data-minimization
                    and right-to-erasure obligations.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <RetentionForm policy={retention} />
                </CardContent>
              </Card>
            </Reveal>
          ) : null}

          {org ? (
            <Reveal delay={0.12}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Globe2 className="size-4 text-muted-foreground" />
                    Data residency
                  </CardTitle>
                  <CardDescription>
                    Where this organization&apos;s data — messages, contacts, audit trail — is stored
                    and processed.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p>
                    <span className="font-medium">{REGION_LABELS[org.data_region] ?? org.data_region}</span>{" "}
                    <span className="font-mono text-xs text-muted-foreground">({org.data_region})</span>
                  </p>
                  <p className="text-muted-foreground">
                    Residency is pinned per organization and changed only by rootmail staff. Need a
                    specific region? The Data residency add-on pins your data where your compliance
                    posture requires — raise it with support to arrange the move.
                  </p>
                </CardContent>
              </Card>
            </Reveal>
          ) : null}
        </div>
      )}
    </>
  );
}
