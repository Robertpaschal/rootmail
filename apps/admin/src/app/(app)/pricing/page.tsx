import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adminApi } from "@/lib/admin-api";
import { PlanEditor } from "./plan-editor";

export const metadata: Metadata = { title: "Pricing" };

export default async function PricingPage() {
  const { data: plans } = await adminApi.listPlans();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pricing</h1>
        <p className="text-sm text-muted-foreground">
          Plan economics — edits take effect immediately (quota, overage, seats, sub-tenants, AI
          credits). The billed Stripe price syncs separately. Superadmin only.
        </p>
      </div>

      <div className="space-y-4">
        {plans.map((p) => (
          <Card key={p.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="capitalize">{p.name}</span>
                <Badge variant={p.active ? "success" : "muted"}>
                  {p.active ? "active" : "inactive"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PlanEditor plan={p} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
