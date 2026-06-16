"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

// Route-group error boundary — catches anything a page throws that isn't handled
// inline, so the shell never white-screens.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface for debugging; production logging hooks in here later.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-red-100 text-red-600">
        <TriangleAlert className="size-6" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          An unexpected error occurred while loading this page. Try again, or head back to the overview.
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <a href="/" className={buttonVariants({ variant: "outline" })}>
          Go to overview
        </a>
      </div>
    </div>
  );
}
