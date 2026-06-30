import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { adminApi } from "@/lib/admin-api";
import { SupportTable } from "./support-table";

export const metadata: Metadata = { title: "Support" };

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
      <PageHeader
        title="Support"
        description={`Customer-care tickets filed from the dashboard — separate from sales leads. ${open} open. Replies are emailed to the customer.`}
      />

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : (
        <SupportTable tickets={tickets} />
      )}
    </div>
  );
}
