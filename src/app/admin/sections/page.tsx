import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SectionsAdminClient } from "./sections-admin-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Minimal server page: auth + site/template ids only.
 * Section HTML is loaded client-side via /api/template-blocks
 * (same pattern as inserts — avoids RSC payload / stale chunk issues).
 */
export default async function SectionsAdminPage() {
  try {
    await requireUser();

    const sites = await prisma.site.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        templateSets: {
          select: {
            id: true,
            name: true,
            templates: {
              orderBy: { name: "asc" },
              select: {
                id: true,
                name: true,
                _count: { select: { blocks: true } },
              },
            },
          },
        },
      },
    });

    const defaultSiteId =
      sites.find((s) => s.slug === "kiekeboe")?.id ?? sites[0]?.id;

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Section layouts</h1>
          <p className="text-slate-500 mt-1 max-w-2xl">
            Create and maintain reusable section HTML (like the original CMS).
            Use{" "}
            <code className="text-xs bg-slate-100 px-1 rounded">
              &lt;singleline name=&quot;…&quot;&gt;
            </code>
            ,{" "}
            <code className="text-xs bg-slate-100 px-1 rounded">
              &lt;multiline name=&quot;…&quot;&gt;
            </code>
            , and{" "}
            <code className="text-xs bg-slate-100 px-1 rounded">
              &lt;img editable=&quot;true&quot; width=&quot;365&quot;
              height=&quot;200&quot; …&gt;
            </code>{" "}
            as placeholders. The page builder renders this layout as the page.
          </p>
        </div>

        <SectionsAdminClient sites={sites} defaultSiteId={defaultSiteId} />
      </div>
    );
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      String((err as { digest?: string }).digest || "").includes(
        "NEXT_REDIRECT",
      )
    ) {
      throw err;
    }
    console.error("[admin/sections] page failed:", err);
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Section layouts</h1>
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Could not load sections.{" "}
          <code className="text-xs">
            {err instanceof Error ? err.message : "Unknown error"}
          </code>
        </div>
      </div>
    );
  }
}
