import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isOnboardingHost, onboardingOrigin } from "@/lib/hosts";

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const { pathname } = req.nextUrl;

  // CMS host (i.): onboarding lives on mymother, not here.
  if (
    !isOnboardingHost(host) &&
    (pathname === "/onboarding" || pathname.startsWith("/onboarding/"))
  ) {
    const origin = onboardingOrigin();
    if (origin) {
      return NextResponse.redirect(`${origin}${pathname}${req.nextUrl.search}`);
    }
  }

  if (!isOnboardingHost(host)) return NextResponse.next();

  if (pathname === "/" || pathname === "") {
    const url = req.nextUrl.clone();
    url.pathname = "/start";
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/onboarding", "/onboarding/:path*"],
};
