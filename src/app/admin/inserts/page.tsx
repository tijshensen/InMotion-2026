import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { InsertsAdminClient } from "./inserts-admin-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Minimal server page: auth + site list only.
 * Insert HTML is fetched client-side (never via RSC).
 * No dynamic() chunks — avoids "Failed to load chunk" errors.
 */
export default async function InsertsAdminPage() {
  try {
    await requireUser();

    const sites = await prisma.site.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    });

    const defaultSiteId =
      sites.find((s) => s.slug === "kiekeboe")?.id ?? sites[0]?.id;

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Inserts</h1>
          <p className="text-slate-500 mt-1 max-w-2xl">
            Reusable HTML snippets. In templates use{" "}
            <code className="text-xs bg-slate-100 px-1 rounded">
              {"{{insert:tag}}"}
            </code>
            . Click a tag to edit. Preview shows the rendered HTML.
          </p>
        </div>

        <InsertsAdminClient sites={sites} defaultSiteId={defaultSiteId} />
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
    console.error("[admin/inserts] page failed:", err);
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Inserts</h1>
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Could not load inserts.{" "}
          <code className="text-xs">
            {err instanceof Error ? err.message : "Unknown error"}
          </code>
        </div>
      </div>
    );
  }
}
