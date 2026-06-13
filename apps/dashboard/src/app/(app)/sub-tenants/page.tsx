import Link from "next/link";
import { Network } from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { SubTenantStatusBadge } from "@/components/app/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { relativeTime } from "@/lib/format";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { SubTenant } from "@/lib/types";
import { CreateSubTenantForm } from "./create-form";

export default async function SubTenantsPage() {
  let tenants: SubTenant[] | null = null;
  let failed: string | null = null;
  let isApiErr = false;
  try {
    tenants = (await api.listSubTenants()).data;
  } catch (err) {
    if (err instanceof ConnectionError || err instanceof ApiError) {
      failed = err.message;
      isApiErr = err instanceof ApiError;
    } else {
      failed = "An unexpected error occurred.";
    }
  }

  return (
    <>
      <PageHeader
        title="Sub-tenants"
        description="Customers that send under their own verified domain — DKIM, SPF, and reputation isolated."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {failed ? (
            <ConnectionErrorCard message={failed} showReconnect={isApiErr} />
          ) : tenants && tenants.length === 0 ? (
            <EmptyState
              icon={<Network className="size-6" />}
              title="No sub-tenants yet"
              description="Create one to provision a sending domain with its own DKIM and SPF records."
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Domain</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(tenants ?? []).map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-mono text-sm">
                          <Link href={`/sub-tenants/${t.id}`} className="hover:underline">
                            {t.sending_domain}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{t.name}</TableCell>
                        <TableCell>
                          <SubTenantStatusBadge status={t.status} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-muted-foreground">
                          {relativeTime(t.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>

        <CreateSubTenantForm />
      </div>
    </>
  );
}
