import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { assertSiteAccess } from "@/lib/access";
import { generateStaticSite } from "@/lib/generate-site";
import {
  cloudflareConfigured,
  publishSiteToCloudflare,
} from "@/lib/cloudflare-pages";

type Ctx = { params: Promise<{ id: string }> };

/** Generate + Cloudflare upload can take a while on large sites. */
export const maxDuration = 300;

export async function POST(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const denied = await assertSiteAccess(user, id, "ADMIN");
  if (denied) return denied;

  try {
    const result = await generateStaticSite(id);

    if (!cloudflareConfigured()) {
      return NextResponse.json({
        ...result,
        cloudflare: {
          skipped:
            "Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID to deploy to Pages.",
        },
      });
    }

    try {
      const cloudflare = await publishSiteToCloudflare(id);
      return NextResponse.json({ ...result, cloudflare });
    } catch (e) {
      console.error("[generate] cloudflare", e);
      return NextResponse.json({
        ...result,
        cloudflare: {
          error: e instanceof Error ? e.message : "Cloudflare publish failed",
        },
      });
    }
  } catch (e) {
    console.error("[generate]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Generate failed" },
      { status: 500 },
    );
  }
}
