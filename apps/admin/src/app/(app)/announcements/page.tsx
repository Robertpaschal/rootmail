import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adminApi } from "@/lib/admin-api";
import { AnnouncementForm } from "./announcement-form";

export const metadata: Metadata = { title: "Announcements" };

export default async function AnnouncementsPage() {
  const { count } = await adminApi.announcementRecipients();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Announcements</h1>
        <p className="text-sm text-muted-foreground">
          Broadcast a product or service update to every account owner — delivered through rootmail&apos;s
          own send pipeline. Superadmin only.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Compose</CardTitle>
        </CardHeader>
        <CardContent>
          <AnnouncementForm recipientCount={count} />
        </CardContent>
      </Card>
    </div>
  );
}
