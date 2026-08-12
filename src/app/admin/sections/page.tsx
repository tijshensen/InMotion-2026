import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getActiveSite } from "@/lib/site-context";
import { SectionsAdminClient } from "./sections-admin-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Sections for the active website only (site chosen in the top bar).
 */
export default async function SectionsAdminPage() {
  try {
    await requireUser();
    const active = await getActiveSite();

    if (!active) {
      return (
        <div className="space-y-4">
          <h1 className="text-2xl font-semibold">Section layouts</h1>
          <p className="text-sm text-slate-500">
            Select a website in the top bar first.
          </p>
        </div>
      );
    }

    const site = await prisma.site.findUnique({
      where: { id: active.id },
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

    if (!site) {
      return (
        <div className="space-y-4">
          <h1 className="text-2xl font-semibold">Section layouts</h1>
          <p className="text-sm text-slate-500">Website not found.</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Section layouts</h1>
          <p className="text-slate-500 mt-1 max-w-2xl">
            Reusable section HTML for{" "}
            <strong className="text-slate-700">{site.name}</strong>. Markers:{" "}
            <code className="text-xs bg-slate-100 px-1 rounded">
              &lt;singleline&gt;
            </code>
            ,{" "}
            <code className="text-xs bg-slate-100 px-1 rounded">
              &lt;multiline&gt;
            </code>
            ,{" "}
            <code className="text-xs bg-slate-100 px-1 rounded">
              &lt;img editable=&quot;true&quot;&gt;
            </code>
            .
          </p>
        </div>

        <SectionsAdminClient site={JSON.parse(JSON.stringify(site))} />
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
