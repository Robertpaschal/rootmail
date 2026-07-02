import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { adminApi } from "@/lib/admin-api";
import { ChangelogEditor } from "../changelog-editor";

export const metadata: Metadata = { title: "Edit changelog entry" };

export default async function EditChangelogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data } = await adminApi.listChangelog();
  const entry = data.find((e) => e.id === id);
  if (!entry) notFound();
  return <ChangelogEditor entry={entry} />;
}
