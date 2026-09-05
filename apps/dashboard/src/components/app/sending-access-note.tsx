import Link from "next/link";
import { api } from "@/lib/rootmail";

/** Explain the restriction at the moment someone chooses recipients. */
export async function SendingAccessNote() {
  try {
    const access = await api.sendingAccess();
    if (!access.required) return null;
    const ready = access.data.filter(r => r.status === "verified");
    return (
      <aside className="mb-5 rounded-lg border bg-card px-4 py-3 text-sm">
        <p className="font-medium">Send to confirmed test inboxes</p>
        <p className="mt-1 text-muted-foreground">
          Rootmail&apos;s SES account is in sandbox. Real recipients need AWS confirmation;
          the delivery scenarios are available without it. Templates and campaign drafts stay in this workspace as access expands.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {ready.length ? `Confirmed: ${ready.slice(0, 3).map(r => r.email).join(", ")}${ready.length > 3 ? "…" : ""}` : "Start by confirming your own inbox."}
        </p>
        <Link href="/testing#test-inboxes" className="mt-2 inline-block font-medium text-foreground underline underline-offset-4 hover:no-underline">Manage test inboxes →</Link>
      </aside>
    );
  } catch {
    return <p className="mb-4 text-sm text-muted-foreground">Sending access could not be checked. <Link className="text-foreground underline underline-offset-4 hover:no-underline" href="/testing#test-inboxes">Check test inboxes before sending.</Link></p>;
  }
}
