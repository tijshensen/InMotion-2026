import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    return NextResponse.json(
      { error: "Google sign-in is not configured (GOOGLE_CLIENT_ID)" },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI?.trim() ||
    `${url.origin}/api/auth/google/callback`;

  const state = crypto.randomUUID();
  const jar = await cookies();
  jar.set("cms_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  const dest = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  dest.searchParams.set("client_id", clientId);
  dest.searchParams.set("redirect_uri", redirectUri);
  dest.searchParams.set("response_type", "code");
  dest.searchParams.set("scope", "openid email profile");
  dest.searchParams.set("state", state);
  dest.searchParams.set("prompt", "select_account");

  return NextResponse.redirect(dest);
}
