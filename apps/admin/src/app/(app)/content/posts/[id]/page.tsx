import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { adminApi } from "@/lib/admin-api";
import { PostEditor } from "../post-editor";

export const metadata: Metadata = { title: "Edit post" };

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // No single-get admin endpoint; the library is small, so pick from the list.
  const { data } = await adminApi.listBlogPosts();
  const post = data.find((p) => p.id === id);
  if (!post) notFound();
  return <PostEditor post={post} />;
}
