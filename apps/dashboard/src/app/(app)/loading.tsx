import { Loader2 } from "lucide-react";

// Route-group loading fallback — shown via Suspense while any (app) page's data
// loads (unless a segment provides its own loading.tsx).
export default function Loading() {
  return (
    <div role="status" className="flex min-h-40 items-center justify-center gap-3 rounded-xl border bg-card p-6 text-base text-muted-foreground">
      <Loader2 aria-hidden="true" className="size-5 animate-spin motion-reduce:animate-none" />
      Loading your workspace…
    </div>
  );
}
