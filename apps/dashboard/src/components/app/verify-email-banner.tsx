"use client";

import { useTransition } from "react";
import { MailWarning } from "lucide-react";
import { toast } from "sonner";
import { resendVerification } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

/**
 * `blocked`: our verification email was refused because, during the closed
 * beta, our provider only delivers to addresses that have confirmed with it.
 * "Check your inbox" would send them looking for mail that will never come.
 */
export function VerifyEmailBanner({ blocked = false }: { blocked?: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-between gap-3 border-b bg-acted-tint px-4 py-2 text-sm text-acted">
      <div className="flex items-center gap-2">
        <MailWarning className="size-4 shrink-0" />
        <span>
          {blocked
            ? "We couldn't deliver your verification email yet — during the closed beta our email provider only delivers to addresses that have confirmed with it. Click the link in the confirmation email from Amazon Web Services, then press Resend. Or sign in with Google or GitHub using this address to verify instantly."
            : "Verify your email to unlock live sending — check your inbox for the link."}
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await resendVerification();
            if (res.sent) toast.success("Verification email sent — check your inbox.");
            else toast.error(res.error ?? "Couldn't resend right now.", { duration: 12_000 });
          })
        }
      >
        {pending ? "Sending…" : "Resend"}
      </Button>
    </div>
  );
}
