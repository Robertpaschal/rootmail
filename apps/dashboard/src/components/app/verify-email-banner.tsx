"use client";

import { useTransition } from "react";
import { MailWarning } from "lucide-react";
import { toast } from "sonner";
import { resendVerification } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

export function VerifyEmailBanner() {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-between gap-3 border-b bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <div className="flex items-center gap-2">
        <MailWarning className="size-4 shrink-0" />
        <span>Verify your email to unlock live sending — check your inbox for the link.</span>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await resendVerification();
            if (res.sent) toast.success("Verification email sent — check your inbox.");
            else toast.error(res.error ?? "Couldn't resend right now.");
          })
        }
      >
        {pending ? "Sending…" : "Resend"}
      </Button>
    </div>
  );
}
