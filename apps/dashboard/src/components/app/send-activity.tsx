import * as React from "react";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";

/** Request activity, not a delivery claim. The adjacent label owns the status. */
export function SendActivity({ pending, className }: { pending: boolean; className?: string }) {
  return <Send aria-hidden="true" className={cn("size-4 shrink-0", pending && "ui-send-working", className)} />;
}
