import { startGoogleOAuth } from "@/lib/google-oauth";

export const dynamic = "force-dynamic";

/** Public start URL for landing pages: https://i.madeawebsite.com/auth/google */
export async function GET(req: Request) {
  return startGoogleOAuth(req);
}
