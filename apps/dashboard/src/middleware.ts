import { NextResponse, type NextRequest } from "next/server";
import { KEY_COOKIE } from "@/lib/session";

const PUBLIC_PATHS = ["/connect"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasKey = req.cookies.has(KEY_COOKIE);
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // Not connected → force the connect screen.
  if (!hasKey && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/connect";
    return NextResponse.redirect(url);
  }

  // Already connected → skip the connect screen.
  if (hasKey && pathname === "/connect") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml).*)"],
};
