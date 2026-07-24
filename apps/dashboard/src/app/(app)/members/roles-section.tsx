import { ShieldCheck, Trash2 } from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { EmptyState } from "@/components/app/empty-state";
import { FeatureLocked, type FeatureLockedInfo, asFeatureLocked } from "@/components/app/feature-locked";
import { Reveal } from "@/components/app/motion";
import { InlineReveal } from "@/components/app/reveal-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { RolesResult } from "@/lib/types";
import { RoleForm } from "../roles/role-form";
import { deleteRole } from "../roles/actions";

/**
 * The Roles tab of the Team hub — roles are HOW teammates get their access, so
 * they live with the team, not as a distant standalone section. Headerless: the
 * hub owns the PageHeader; this renders the body (locked / empty / list).
 */
export async function RolesSection() {
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
      <FeatureLocked
        info={locked}
        blurb="Custom roles let you grant teammates exactly the permissions they need — define your own and assign them on invite."
      />
    );
  }

  if (failed || !result) {
    return <ConnectionErrorCard message={failed ?? "No data."} showReconnect={isApiErr} />;
  }

  const empty = result.data.length === 0;
  // The create form lives inside the reveal — never shown next to the list.
  const form = (
    <div className="mt-4 w-full max-w-xl rounded-lg border bg-muted/20 p-4">
      <p className="mb-3 text-sm font-medium">New custom role</p>
      <RoleForm permissions={result.permissions} />
    </div>
  );

  if (empty) {
    return (
      <Reveal className="space-y-6">
        <EmptyState
          icon={<ShieldCheck className="size-6" />}
          title="No custom roles yet"
          description="Built-in owner, admin, and member cover most teams. Add a custom role when you need finer control — say, a “Marketer” who can manage content but not billing."
        />
        <InlineReveal triggerLabel="Create your first role" defaultOpen>
          {form}
        </InlineReveal>
      </Reveal>
    );
  }

  return (
    <Reveal className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Built-in roles (owner, admin, member) apply on every plan. Custom roles grant exactly the
          permissions you want — assign them when you invite.
        </p>
        <InlineReveal triggerLabel="New role">{form}</InlineReveal>
      </div>
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
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </Button>
              </form>
            </div>
          ))}
        </CardContent>
      </Card>
    </Reveal>
  );
}
