import type { Metadata } from "next";
import { PostEditor } from "../post-editor";

export const metadata: Metadata = { title: "New post" };

// A new post starts as the same empty document you'd write in — no form ceremony.
export default function NewPostPage() {
  return <PostEditor post={null} />;
}
