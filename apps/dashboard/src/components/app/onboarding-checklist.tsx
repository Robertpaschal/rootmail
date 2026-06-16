import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/rootmail";
import { cn } from "@/lib/utils";

/**
 * First-run checklist on the Overview page. Computes completion from the account's
 * own data and hides itself once every step is done. Fail-quiet: if any lookup
 * fails, it simply doesn't render.
 */
export async function OnboardingChecklist() {
  let emailVerified = false;
  let templates = 0;
  let messages = 0;
  let keys = 0;
  try {
    const [me, t, m, k] = await Promise.all([
      api.me(),
      api.listTemplates(),
      api.listMessages({ limit: 1 }),
      api.listApiKeys(),
    ]);
    emailVerified = me.user.email_verified;
    templates = t.data.length;
    messages = m.data.length;
    keys = k.data.length;
  } catch {
    return null;
  }

  const steps = [
    { done: emailVerified, label: "Verify your email", desc: "Unlock live sending.", href: null as string | null },
    { done: keys > 0, label: "Get your API key", desc: "Send via the API or SDK.", href: "/api-keys" },
    { done: templates > 0, label: "Create a template", desc: "Design a reusable email.", href: "/templates/new" },
    { done: messages > 0, label: "Send your first email", desc: "Try it from the composer.", href: "/messages/new" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null; // fully onboarded → hide

  return (
    <Card className="mb-6 border-primary/30 bg-primary/5">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Get started</CardTitle>
        <span className="text-sm text-muted-foreground">
          {doneCount}/{steps.length} done
        </span>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        {steps.map((s) => (
          <div key={s.label} className="flex items-center gap-3 rounded-md border bg-background p-3">
            {s.done ? (
              <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
            ) : (
              <Circle className="size-5 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-medium", s.done && "text-muted-foreground line-through")}>
                {s.label}
              </p>
              <p className="truncate text-xs text-muted-foreground">{s.desc}</p>
            </div>
            {!s.done && s.href ? (
              <Link
                href={s.href}
                className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
              >
                Go <ArrowRight className="size-3" />
              </Link>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
