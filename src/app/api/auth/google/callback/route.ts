import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSession } from "@/lib/auth";
import { ensurePersonalOrg, upsertGoogleUser } from "@/lib/onboarding";

type GoogleToken = { access_token?: string; error?: string };
type GoogleUser = {
  email?: string;
  email_verified?: boolean;
  given_name?: string;
  family_name?: string;
  name?: string;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const jar = await cookies();
  const expected = jar.get("cms_oauth_state")?.value || "";
  jar.delete("cms_oauth_state");

  const fail = (msg: string) =>
    NextResponse.redirect(new URL(`/?error=${encodeURIComponent(msg)}`, url.origin));

  if (!code || !state || !expected || state !== expected) {
    return fail("Google sign-in was cancelled or expired.");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI?.trim() ||
    `${url.origin}/api/auth/google/callback`;
  if (!clientId || !clientSecret) {
    return fail("Google sign-in is not configured.");
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const token = (await tokenRes.json()) as GoogleToken;
  if (!token.access_token) {
    return fail("Could not complete Google sign-in.");
  }

  const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const profile = (await profileRes.json()) as GoogleUser;
  if (!profile.email || profile.email_verified === false) {
    return fail("Google did not provide a verified email.");
  }

  try {
    const names = (profile.name || "").trim().split(/\s+/);
    const user = await upsertGoogleUser({
      email: profile.email,
      firstName: profile.given_name || names[0] || "There",
      lastName: profile.family_name || names.slice(1).join(" "),
    });
    await ensurePersonalOrg(user.id, user.email);
    // Stay on this host (mymother). Jumping to i. after Google is a
    // cross-site 302 that Cloudflare/Chrome often serve as HTTP 403.
    const next = NextResponse.redirect(new URL("/onboarding", url.origin));
    next.headers.set("Referrer-Policy", "no-referrer");
    await createSession(user.id, next);
    return next;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not create account";
    return fail(msg);
  }
}
