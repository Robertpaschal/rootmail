"use client";

import { useState, useTransition } from "react";
import { MailWarning } from "lucide-react";
import { resendVerification } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

export function VerifyEmailBanner() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const done = message === "Verification email sent.";

  return (
    <div className="flex items-center justify-between gap-3 border-b bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <div className="flex items-center gap-2">
        <MailWarning className="size-4 shrink-0" />
        <span>{message ?? "Verify your email to unlock live sending — check your inbox for the link."}</span>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={pending || done}
        onClick={() =>
          startTransition(async () => {
            const res = await resendVerification();
            setMessage(res.sent ? "Verification email sent." : (res.error ?? "Couldn't resend."));
          })
        }
      >
        {pending ? "Sending…" : "Resend"}
      </Button>
    </div>
  );
}
