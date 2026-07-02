import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Users } from "lucide-react";
import { adminApi } from "@/lib/admin-api";
import { formatDateTime } from "@/lib/format";
import { AnnouncementPreview } from "../announcement-preview";

export const metadata: Metadata = { title: "Announcement" };

// Read-only archive record: what went out, exactly as it looked, and to whom.
export default async function AnnouncementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data } = await adminApi.listAnnouncements();
  const a = data.find((x) => x.id === id);
  if (!a) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/announcements"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Announcements
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{a.subject}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>{formatDateTime(a.created_at)}</span>
          <span className="flex items-center gap-1">
            <Users className="size-3.5" /> {a.recipient_count.toLocaleString()} recipient
            {a.recipient_count === 1 ? "" : "s"}
          </span>
          {a.sent_by_email ? <span>by {a.sent_by_email}</span> : null}
        </p>
      </div>

      <div>
        <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
          As delivered to each owner
        </p>
        <AnnouncementPreview body={a.body} />
      </div>
    </div>
  );
}
