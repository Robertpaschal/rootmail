import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { adminApi } from "@/lib/admin-api";
import type { SupportTicketDetail } from "@/lib/types";
import { ReplyBox } from "./reply-box";

export default async function SupportTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let ticket: SupportTicketDetail;
  try {
    ticket = await adminApi.getSupportTicket(id);
  } catch {
    notFound();
  }

  return (
    <div className="space-y-5">
      <Link
        href="/support"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All support
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {ticket.subject || "Support request"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {ticket.name || ticket.email} · {ticket.email}
            {ticket.organization_name ? ` · ${ticket.organization_name}` : ""}
          </p>
        </div>
        <Badge variant={ticket.status === "open" ? "secondary" : "muted"}>{ticket.status}</Badge>
      </div>

      <div className="space-y-3">
        {ticket.messages.map((m) => {
          const staff = m.author === "staff";
          return (
            <div key={m.id} className={staff ? "ml-8" : "mr-8"}>
              <div className="mb-1 text-xs text-muted-foreground">
                {staff ? "Staff" : ticket.name || "Customer"} ·{" "}
                {new Date(m.created_at).toLocaleString()}
              </div>
              <div
                className={`whitespace-pre-wrap rounded-lg border p-3 text-sm ${
                  staff ? "bg-primary/5" : "bg-muted/40"
                }`}
              >
                {m.body}
              </div>
            </div>
          );
        })}
      </div>

      <ReplyBox id={ticket.id} status={ticket.status} />
    </div>
  );
}
