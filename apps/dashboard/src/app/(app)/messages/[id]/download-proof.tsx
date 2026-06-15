"use client";

import { useTransition } from "react";
import { FileCheck2, Loader2 } from "lucide-react";
import { getProofAction } from "../actions";
import { Button } from "@/components/ui/button";

export function DownloadProof({ messageId }: { messageId: string }) {
  const [pending, start] = useTransition();

  const onClick = () =>
    start(async () => {
      const res = await getProofAction(messageId);
      if (res.proof) {
        const url = URL.createObjectURL(new Blob([res.proof], { type: "application/json" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `proof-${messageId}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } else if (res.error) {
        window.alert(res.locked ? `${res.error} Upgrade under Plan & usage.` : res.error);
      }
    });

  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick} disabled={pending} title="Download a signed proof bundle">
      {pending ? <Loader2 className="size-4 animate-spin" /> : <FileCheck2 className="size-4" />}
      Proof
    </Button>
  );
}
