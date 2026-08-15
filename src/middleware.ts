import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isOnboardingHost } from "@/lib/hosts";

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") || "";
  if (!isOnboardingHost(host)) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname === "/" || pathname === "") {
    const url = req.nextUrl.clone();
    url.pathname = "/start";
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
