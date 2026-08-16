import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { appPublicUrl } from "@/lib/hosts";
import {
  ensurePersonalOrg,
  postLoginPath,
  seedOnboardingReplayOnce,
  upsertGoogleUser,
} from "@/lib/onboarding";

const STATE_COOKIE = "cms_oauth_state";

type GoogleToken = { access_token?: string; error?: string };
type GoogleUser = {
  email?: string;
  email_verified?: boolean;
  given_name?: string;
  family_name?: string;
  name?: string;
};

/** Railway app origin. Landing pages never handle OAuth. */
export function appOrigin(req: Request) {
  return appPublicUrl() || new URL(req.url).origin;
}

/**
 * Callback Google must call. Always on the Railway host
 * (CMS_PUBLIC_URL / GOOGLE_REDIRECT_URI), never a Pages landing domain.
 */
export function googleRedirectUri(req: Request) {
  const pinned = process.env.GOOGLE_REDIRECT_URI?.trim();
  const app = appPublicUrl();
  if (app && pinned && !pinned.startsWith(app)) {
    return `${app}/auth/google/callback`;
  }
  if (pinned) return pinned;
  return `${appOrigin(req)}/auth/google/callback`;
}

function stateCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  };
}

export async function startGoogleOAuth(req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    return NextResponse.redirect(
      new URL("/start?error=Google+sign-in+is+not+configured", appOrigin(req)),
    );
  }

  const state = crypto.randomUUID();
  const dest = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  dest.searchParams.set("client_id", clientId);
  dest.searchParams.set("redirect_uri", googleRedirectUri(req));
  dest.searchParams.set("response_type", "code");
  dest.searchParams.set("scope", "openid email profile");
  dest.searchParams.set("state", state);
  dest.searchParams.set("prompt", "select_account");

  const res = NextResponse.redirect(dest);
  res.cookies.set(STATE_COOKIE, state, stateCookieOptions());
  return res;
}

export async function handleGoogleCallback(req: Request) {
  const origin = appOrigin(req);
  const url = new URL(req.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value || "";

  const fail = (msg: string) => {
    const res = NextResponse.redirect(
      new URL(`/start?error=${encodeURIComponent(msg)}`, origin),
    );
    res.cookies.set(STATE_COOKIE, "", { ...stateCookieOptions(), maxAge: 0 });
    return res;
  };

  if (!code || !state || !expected || state !== expected) {
    return fail("Google sign-in was cancelled or expired.");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
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
      redirect_uri: googleRedirectUri(req),
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
    await seedOnboardingReplayOnce();
    const fresh = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, replayOnboarding: true },
    });
    const nextPath = await postLoginPath(
      fresh ?? { id: user.id, replayOnboarding: user.replayOnboarding },
    );
    const next = NextResponse.redirect(new URL(nextPath, origin));
    next.cookies.set(STATE_COOKIE, "", { ...stateCookieOptions(), maxAge: 0 });
    await createSession(user.id, next);
    return next;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not create account";
    return fail(msg);
  }
}
