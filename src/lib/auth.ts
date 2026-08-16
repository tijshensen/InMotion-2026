import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./db";
import type { Role, User } from "@prisma/client";
import { authCookieDomain } from "./hosts";

const COOKIE = "cms_session";

function sessionCookieOptions(expiresAt: Date) {
  const domain = authCookieDomain();
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production" || Boolean(domain),
    path: "/",
    expires: expiresAt,
    ...(domain ? { domain } : {}),
  };
}

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string, res?: NextResponse) {
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14); // 14 days
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("14d")
    .setIssuedAt()
    .sign(secretKey());

  await prisma.session.create({
    data: { token, userId, expiresAt },
  });

  const opts = sessionCookieOptions(expiresAt);
  if (res) {
    res.cookies.set(COOKIE, token, opts);
    return;
  }

  const jar = await cookies();
  jar.set(COOKIE, token, opts);
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { token } });
    const domain = authCookieDomain();
    jar.set(COOKIE, "", {
      httpOnly: true,
      path: "/",
      expires: new Date(0),
      ...(domain ? { domain } : {}),
    });
  }
}

export type SessionUser = Pick<
  User,
  "id" | "email" | "firstName" | "lastName" | "role" | "isActive"
>;

export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const jar = await cookies();
    const token = jar.get(COOKIE)?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, secretKey());
    const userId = payload.sub;
    if (!userId) return null;

    const session = await prisma.session.findUnique({
      where: { token },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            isActive: true,
          },
        },
      },
    });

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      }
      return null;
    }

    if (!session.user.isActive) {
      await prisma.session.deleteMany({ where: { userId: session.user.id } }).catch(() => {});
      return null;
    }

    return session.user;
  } catch (err) {
    // Let Next.js handle dynamic-route detection during build/render
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      (err as { digest?: string }).digest === "DYNAMIC_SERVER_USAGE"
    ) {
      throw err;
    }
    // Session/DB glitches should not crash the page — treat as logged out
    console.error("[auth] getSessionUser failed:", err);
    return null;
  }
}

export async function requireUser(roles?: Role[]) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (roles && !roles.includes(user.role) && user.role !== "SUPERADMIN") {
    redirect("/admin");
  }
  return user;
}
