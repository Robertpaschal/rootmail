import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

// On-demand ISR. The API POSTs here the moment staff publish/edit CMS content, so
// the affected pages rebuild immediately rather than the site polling on a timer.
// Guarded by the shared INTERNAL_API_SECRET (same value the API holds). ?tag=blog|changelog.
const VALID_TAGS = new Set(["blog", "changelog"]);

export async function POST(req: NextRequest) {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret || req.headers.get("x-revalidate-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tag = req.nextUrl.searchParams.get("tag") ?? "";
  if (!VALID_TAGS.has(tag)) {
    return NextResponse.json({ error: "unknown tag" }, { status: 400 });
  }
  revalidateTag(tag);
  return NextResponse.json({ revalidated: true, tag });
}
