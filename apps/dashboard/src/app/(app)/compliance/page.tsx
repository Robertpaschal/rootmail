import { Clock, FileCheck2, Globe2, ShieldCheck } from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { FeatureLocked } from "@/components/app/feature-locked";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Organization, RetentionPolicy } from "@/lib/types";
import { ExportForm } from "./export-form";
import { RetentionForm } from "./retention-form";

// Human labels for the regions rootmail can pin an org's data to.
const REGION_LABELS: Record<string, string> = {
  "us-east-1": "United States — US East (N. Virginia)",
};

export default async function CompliancePage() {
  let hasProof = false;
  let retention: RetentionPolicy | null = null;
  let org: Organization | null = null;
  try {
    const billing = await api.getBilling();
    hasProof = billing.plan.features.includes("proof");
    if (hasProof) retention = await api.getRetention().catch(() => null);
    org = await api.getOrganization().catch(() => null);
  } catch (err) {
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

  return (
    <>
      <PageHeader
        title="Compliance"
        description="Export a signed, tamper-evident record of everything you sent — prove exactly what went out, and when."
      />

      {hasProof ? (
        <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-3">
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
        </div>

        {retention ? (
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
        ) : null}

        {org ? (
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
                Residency is pinned per organization and changed only by rootmail staff. If your
                compliance posture requires an EU region, raise it with support — regional
                expansion is planned with the enterprise rollout.
              </p>
            </CardContent>
          </Card>
        ) : null}
        </div>
      ) : (
        <FeatureLocked
          info={{ feature: "proof", required_plan_name: "Enterprise" }}
          blurb="Signed, audit-grade compliance exports are an Enterprise feature — the same Layer-3 proof, batched across a date range."
        />
      )}
    </>
  );
}
