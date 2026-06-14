import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { enabledProviders } from "@/lib/oauth";
import { cn } from "@/lib/utils";

// Renders nothing until a provider's credentials are configured.
export function OAuthButtons() {
  const providers = enabledProviders();
  if (providers.length === 0) return null;

  return (
    <div className="mb-4 space-y-3">
      <div className="grid gap-2">
        {providers.map((p) => (
          <Link
            key={p.id}
            href={`/oauth/${p.id}`}
            className={cn(buttonVariants({ variant: "outline" }), "w-full")}
          >
            Continue with {p.label}
          </Link>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
