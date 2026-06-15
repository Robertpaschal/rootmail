import { ShieldCheck, Trash2 } from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { EmptyState } from "@/components/app/empty-state";
import { FeatureLocked, type FeatureLockedInfo, asFeatureLocked } from "@/components/app/feature-locked";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { RolesResult } from "@/lib/types";
import { RoleForm } from "./role-form";
import { deleteRole } from "./actions";

export default async function RolesPage() {
  let result: RolesResult | null = null;
  let failed: string | null = null;
  let isApiErr = false;
  let locked: FeatureLockedInfo | null = null;
  try {
    result = await api.listRoles();
  } catch (err) {
    if (err instanceof ApiError && err.code === "feature_locked") locked = asFeatureLocked(err.details);
    else if (err instanceof ConnectionError || err instanceof ApiError) {
      failed = err.message;
      isApiErr = err instanceof ApiError;
    } else failed = "An unexpected error occurred.";
  }

  if (locked) {
    return (
      <>
        <PageHeader title="Roles" />
        <FeatureLocked info={locked} blurb="Custom roles let you grant teammates exactly the permissions they need — define your own and assign them on invite." />
      </>
    );
  }

  if (failed || !result) {
    return (
      <>
        <PageHeader title="Roles" />
        <ConnectionErrorCard message={failed ?? "No data."} showReconnect={isApiErr} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Roles"
        description="Built-in roles (owner, admin, member) apply on every plan. Define custom roles to grant exactly the permissions you want."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {result.data.length === 0 ? (
            <EmptyState icon={<ShieldCheck className="size-6" />} title="No custom roles yet" description="Create one to grant a scoped set of permissions." />
          ) : (
            <Card>
              <CardContent className="space-y-3 p-4">
                {result.data.map((r) => (
                  <div key={r.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
                    <div className="min-w-0">
                      <p className="font-medium">{r.name}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {r.permissions.map((p) => (
                          <Badge key={p} variant="secondary" className="font-mono text-[10px]">
                            {p}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <form action={deleteRole}>
                      <input type="hidden" name="id" value={r.id} />
                      <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="size-4" />
                      </Button>
                    </form>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">New custom role</CardTitle>
          </CardHeader>
          <CardContent>
            <RoleForm permissions={result.permissions} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
