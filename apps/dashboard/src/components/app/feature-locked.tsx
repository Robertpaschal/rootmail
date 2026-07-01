import Link from "next/link";
import { Lock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** The actionable payload carried by a 402 `feature_locked` API error. */
export interface FeatureLockedInfo {
  feature?: string;
  current_plan?: string;
  required_plan?: string | null;
  required_plan_name?: string | null;
  price?: number | null;
}

/** Extract feature-locked details from an unknown caught error's `details`. */
export function asFeatureLocked(details: unknown): FeatureLockedInfo {
  return (details ?? {}) as FeatureLockedInfo;
}

export function FeatureLocked({ info, blurb }: { info: FeatureLockedInfo; blurb?: string }) {
  const planName = info.required_plan_name ?? info.required_plan ?? "a higher plan";
  return (
    <Card className="flex flex-col items-center gap-3 p-12 text-center">
      <div className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
        <Lock className="size-6" />
      </div>
      <h3 className="text-base font-semibold">Upgrade to {planName} to unlock this</h3>
      <p className="max-w-md text-sm text-muted-foreground">
        {blurb ?? "This feature isn't included in your current plan."}
        {info.price != null ? ` ${planName} starts at $${info.price}/mo.` : ""}
      </p>
      <Link href="/billing?tab=plans" className={cn(buttonVariants({ size: "sm" }), "mt-1")}>
        See plans &amp; upgrade
      </Link>
    </Card>
  );
}
