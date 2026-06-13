import Link from "next/link";
import { PlugZap } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function ConnectionError({
  title,
  message,
  showReconnect,
}: {
  title?: string;
  message: string;
  showReconnect?: boolean;
}) {
  return (
    <Card className="flex flex-col items-center gap-3 p-12 text-center">
      <div className="grid size-12 place-items-center rounded-xl bg-amber-100 text-amber-700">
        <PlugZap className="size-6" />
      </div>
      <h3 className="text-base font-semibold">{title ?? "Can't reach the rootmail API"}</h3>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      {showReconnect ? (
        <Link href="/connect" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-1")}>
          Reconnect with a different key
        </Link>
      ) : null}
    </Card>
  );
}
