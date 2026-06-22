import { FileCheck2, ShieldCheck } from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { FeatureLocked } from "@/components/app/feature-locked";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import { ExportForm } from "./export-form";

export default async function CompliancePage() {
  let hasProof = false;
  try {
    const billing = await api.getBilling();
    hasProof = billing.plan.features.includes("proof");
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
      ) : (
        <FeatureLocked
          info={{ feature: "proof", required_plan_name: "Enterprise" }}
          blurb="Signed, audit-grade compliance exports are an Enterprise feature — the same Layer-3 proof, batched across a date range."
        />
      )}
    </>
  );
}
