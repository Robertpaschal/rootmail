import type { SupportTicket } from "./types";

export function supportThreadSubject(message: string, subject?: string): string {
  return subject?.trim().slice(0, 200) || message.trim().split("\n")[0].slice(0, 120);
}

export function filterSupportThreads(threads: SupportTicket[], status: "all" | "open" | "closed", query: string): SupportTicket[] {
  const search = query.trim().toLowerCase();
  return threads.filter((ticket) => (status === "all" || ticket.status === status) && (ticket.subject ?? "Conversation with support").toLowerCase().includes(search));
}
