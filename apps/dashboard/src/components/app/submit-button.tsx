"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";

export function SubmitButton({
  children,
  pendingLabel,
  disabled,
  ...props
}: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" {...props} disabled={pending || disabled} aria-busy={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      {pending ? (pendingLabel ?? children) : children}
    </Button>
  );
}
