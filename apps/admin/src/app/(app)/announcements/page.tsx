import type { Metadata } from "next";
import Link from "next/link";
import { Megaphone, Plus, Users } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { adminApi } from "@/lib/admin-api";
import type { Announcement } from "@/lib/types";
import { formatDateTime, timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Announcements" };

// The archive is the page; composing is a deliberate step, not the landing state.
export default async function AnnouncementsPage() {
  let sent: Announcement[] = [];
  let error = "";
  try {
    sent = (await adminApi.listAnnouncements()).data;
  } catch (e) {
    error = e instanceof Error ? e.message : "Couldn't load announcements.";
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Announcements"
        description="Broadcasts to every account owner, delivered through rootmail's own pipeline. Everything sent is archived here."
        actions={
          <Link
            href="/announcements/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="size-4" /> New announcement
          </Link>
        }
      />

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : sent.length === 0 ? (
        <div className="rounded-lg border">
          <EmptyState
            icon={Megaphone}
            title="Nothing announced yet"
            description="When you broadcast a product or service update to account owners, the send is archived here — subject, reach, sender, and the exact message."
            action={
              <Link href="/announcements/new" className="text-sm font-medium text-primary hover:underline">
                Write the first announcement →
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {sent.map((a) => (
            <li key={a.id}>
              <Link
                href={`/announcements/${a.id}`}
                className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.subject}</p>
                  <p className="truncate text-xs text-muted-foreground">{a.body}</p>
                </div>
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <Users className="size-3.5" /> {a.recipient_count.toLocaleString()}
                </span>
                <span
                  className="shrink-0 text-xs text-muted-foreground"
                  title={formatDateTime(a.created_at)}
                >
                  {timeAgo(a.created_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
