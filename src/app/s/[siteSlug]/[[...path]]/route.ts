import { renderPublicPage } from "@/lib/render";

type Ctx = { params: Promise<{ siteSlug: string; path?: string[] }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { siteSlug, path } = await ctx.params;
  const result = await renderPublicPage({
    siteSlug,
    pathSegments: path || [],
  });

  if (!result) {
    return new Response("Site or page not found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(result.html, {
    status: result.status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
