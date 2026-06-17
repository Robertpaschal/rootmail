"use client";

import { useTransition } from "react";
import { UserCog } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createImpersonationLink } from "./actions";

export function ImpersonateButton({ userId, email }: { userId: string; email: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await createImpersonationLink(userId);
          if ("url" in res) {
            toast.success(`Opening the dashboard as ${email}…`);
            window.open(res.url, "_blank", "noopener");
          } else {
            toast.error(res.error);
          }
        })
      }
    >
      <UserCog className="size-3.5" />
      {pending ? "Starting…" : "Impersonate"}
    </Button>
  );
}
