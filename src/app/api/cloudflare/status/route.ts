import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { verifyCloudflareConnection } from "@/lib/cloudflare-pages";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const status = await verifyCloudflareConnection();
  return NextResponse.json(status);
}
