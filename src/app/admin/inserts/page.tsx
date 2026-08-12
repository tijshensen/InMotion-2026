import { requireUser } from "@/lib/auth";
import { getActiveSite } from "@/lib/site-context";
import { InsertsAdminClient } from "./inserts-admin-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Inserts for the active website only (site chosen in the top bar).
 */
export default async function InsertsAdminPage() {
  try {
    await requireUser();
    const active = await getActiveSite();

    if (!active) {
      return (
        <div className="space-y-4">
          <h1 className="text-2xl font-semibold">Inserts</h1>
          <p className="text-sm text-slate-500">
            Select a website in the top bar first.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Inserts</h1>
          <p className="text-slate-500 mt-1 max-w-2xl">
            Reusable HTML for{" "}
            <strong className="text-slate-700">{active.name}</strong>. In
            templates use{" "}
            <code className="text-xs bg-slate-100 px-1 rounded">
              {"{{insert:tag}}"}
            </code>
            .
          </p>
        </div>

        <InsertsAdminClient
          siteId={active.id}
          siteName={active.name}
        />
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
