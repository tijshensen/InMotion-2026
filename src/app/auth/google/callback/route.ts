import { handleGoogleCallback } from "@/lib/google-oauth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handleGoogleCallback(req);
}
