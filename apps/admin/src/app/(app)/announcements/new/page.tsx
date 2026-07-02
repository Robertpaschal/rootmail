import type { Metadata } from "next";
import { adminApi } from "@/lib/admin-api";
import { ComposeAnnouncement } from "../compose";

export const metadata: Metadata = { title: "New announcement" };

export default async function NewAnnouncementPage() {
  const { count } = await adminApi.announcementRecipients();
  return <ComposeAnnouncement recipientCount={count} />;
}
