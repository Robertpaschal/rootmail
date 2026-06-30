import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { adminApi } from "@/lib/admin-api";

export const metadata: Metadata = { title: "Support" };

function ago(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default async function SupportPage() {
  let tickets: Awaited<ReturnType<typeof adminApi.listSupportTickets>>["data"] = [];
  let error = "";
  try {
    tickets = (await adminApi.listSupportTickets()).data;
  } catch (e) {
    error = e instanceof Error ? e.message : "Couldn't load support tickets.";
  }
  const open = tickets.filter((t) => t.status === "open").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Support</h1>
        <p className="text-sm text-muted-foreground">
          Customer-care tickets filed from the dashboard — separate from sales leads.{" "}
          {open} open. Replies are emailed to the customer.
        </p>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : tickets.length === 0 ? (
        <p className="text-sm text-muted-foreground">No support tickets yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">From</th>
                <th className="px-4 py-2 font-medium">Organization</th>
                <th className="px-4 py-2 font-medium">Latest message</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2 align-top">
                    <Link href={`/support/${t.id}`} className="block font-medium hover:underline">
                      {t.name || t.email}
                    </Link>
                    <span className="text-xs text-muted-foreground">{t.email}</span>
                  </td>
                  <td className="px-4 py-2 align-top">{t.organization_name ?? "—"}</td>
                  <td className="max-w-sm px-4 py-2 align-top">
                    <Link href={`/support/${t.id}`} className="block truncate text-muted-foreground hover:underline">
                      {t.last_message
                        ? `${t.last_message.author === "staff" ? "You: " : ""}${t.last_message.body}`
                        : t.subject ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-2 align-top">
                    <Badge variant={t.status === "open" ? "secondary" : "muted"}>{t.status}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 align-top text-xs text-muted-foreground">
                    {ago(t.last_message_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
