import Link from "next/link";
import { SubmitButton } from "@/components/app/submit-button";
import { Badge } from "@/components/ui/badge";
import type { CustomPlanListItem } from "@/lib/types";
import { deactivateCustomPlan } from "./actions";

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function CustomPlansCard({ plans }: { plans: CustomPlanListItem[] }) {
  if (plans.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No custom plans yet. Create one from an organization&apos;s page (Organizations → pick an
        org → Custom plan), or convert a won sales lead — it appears here once created.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Organization</th>
            <th className="py-2 pr-3 font-medium">Plan</th>
            <th className="py-2 pr-3 font-medium">Price</th>
            <th className="py-2 pr-3 font-medium">Quota / mo</th>
            <th className="py-2 pr-3 font-medium">Overage</th>
            <th className="py-2 pr-3 font-medium">Status</th>
            <th className="py-2 pr-3" />
          </tr>
        </thead>
        <tbody>
          {plans.map((p) => (
            <tr key={p.id} className="border-b last:border-0">
              <td className="py-2 pr-3">
                <Link href={`/orgs/${p.organization.id}`} className="font-medium hover:underline">
                  {p.organization.name}
                </Link>
              </td>
              <td className="py-2 pr-3">{p.name}</td>
              <td className="py-2 pr-3 tabular-nums">
                {money(p.price_cents)}/{p.interval === "year" ? "yr" : "mo"}
              </td>
              <td className="py-2 pr-3 tabular-nums">{p.monthly_quota.toLocaleString()}</td>
              <td className="py-2 pr-3 tabular-nums">
                {p.allow_overage ? `${money(p.overage_per_1000_cents)}/1k` : "capped"}
              </td>
              <td className="py-2 pr-3">
                {p.active ? <Badge variant="success">active</Badge> : <Badge variant="muted">ended</Badge>}
              </td>
              <td className="py-2 pr-3 text-right">
                {p.active ? (
                  <form action={deactivateCustomPlan}>
                    <input type="hidden" name="org_id" value={p.organization.id} />
                    <SubmitButton variant="outline" size="sm" pendingLabel="…">
                      End
                    </SubmitButton>
                  </form>
                ) : (
                  <Link
                    href={`/orgs/${p.organization.id}`}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    edit
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
