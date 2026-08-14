import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { enabledProviders } from "@/lib/oauth";
import { cn } from "@/lib/utils";

/**
 * Renders nothing until a provider's credentials are configured.
 *
 * `inviteCode` rides along to /oauth/<provider>, which parks it in a cookie for
 * the round trip. Without it, "Continue with Google" would be a door with no
 * lock: the API refuses to CREATE an account without a code, so a tester
 * arriving from their invite email — which links to /signup?invite_code=… —
 * would otherwise be bounced for no visible reason.
 */
export function OAuthButtons({ inviteCode }: { inviteCode?: string }) {
  const providers = enabledProviders();
  if (providers.length === 0) return null;

  return (
    <div className="mb-4 space-y-3">
      <div className="grid gap-2">
        {providers.map((p) => (
          <Link
            key={p.id}
            href={inviteCode ? `/oauth/${p.id}?invite_code=${encodeURIComponent(inviteCode)}` : `/oauth/${p.id}`}
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
