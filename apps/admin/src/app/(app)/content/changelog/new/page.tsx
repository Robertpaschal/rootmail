import type { Metadata } from "next";
import { ChangelogEditor } from "../changelog-editor";

export const metadata: Metadata = { title: "New changelog entry" };

export default function NewChangelogPage() {
  return <ChangelogEditor entry={null} />;
}
