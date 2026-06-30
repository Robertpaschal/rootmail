import type { Metadata } from "next";
import { BadgePercent } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { SubmitButton } from "@/components/app/submit-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { adminApi } from "@/lib/admin-api";
import { deactivatePromotion } from "./actions";
import { CreatePromotionForm } from "./promotions-form";

export const metadata: Metadata = { title: "Promotions" };

export default async function PromotionsPage() {
  const { data: promos } = await adminApi.listPromotions();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Promotions</h1>
        <p className="text-sm text-muted-foreground">
          Coupons &amp; promo codes — redeemable by customers at checkout. Superadmin only.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New promotion</CardTitle>
        </CardHeader>
        <CardContent>
          <CreatePromotionForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Codes</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {promos.length === 0 ? (
            <EmptyState
              icon={BadgePercent}
              title="No promotions yet"
              description="Create a coupon above and it shows up here — with live redemption counts and an off-switch."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead className="text-right">Redeemed</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {promos.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono font-medium">{p.code}</TableCell>
                    <TableCell>{p.discount || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.duration === "repeating" && p.duration_in_months
                        ? `${p.duration_in_months} mo`
                        : (p.duration ?? "—")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.times_redeemed}
                      {p.max_redemptions ? ` / ${p.max_redemptions}` : ""}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.active ? "success" : "muted"}>
                        {p.active ? "active" : "inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {p.active ? (
                        <form action={deactivatePromotion}>
                          <input type="hidden" name="id" value={p.id} />
                          <SubmitButton variant="outline" size="sm" pendingLabel="…">
                            Deactivate
                          </SubmitButton>
                        </form>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
