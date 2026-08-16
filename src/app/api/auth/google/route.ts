import { NextResponse } from "next/server";
import { appOrigin } from "@/lib/google-oauth";

export const dynamic = "force-dynamic";

/** Alias — landing pages should use /auth/google. */
export async function GET(req: Request) {
  return NextResponse.redirect(new URL("/auth/google", appOrigin(req)));
}
