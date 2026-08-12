import { requireUser } from "@/lib/auth";
import { getActiveSite } from "@/lib/site-context";
import { TemplatesAdminClient } from "./templates-admin-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function TemplatesAdminPage() {
  await requireUser();
  const active = await getActiveSite();

  if (!active) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Page templates</h1>
        <p className="text-sm text-slate-500">
          Select a website in the top bar first.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Page templates</h1>
        <p className="text-slate-500 mt-1 max-w-2xl">
          Full HTML shells for{" "}
          <strong className="text-slate-700">{active.name}</strong>. Tokens:{" "}
          <code className="text-xs bg-slate-100 px-1 rounded">
            {"{{sections}}"}
          </code>
          ,{" "}
          <code className="text-xs bg-slate-100 px-1 rounded">
            {"{{menu}}"}
          </code>
          ,{" "}
          <code className="text-xs bg-slate-100 px-1 rounded">
            {"{{page.title}}"}
          </code>
          ,{" "}
          <code className="text-xs bg-slate-100 px-1 rounded">
            {"{{site.title}}"}
          </code>
          ,{" "}
          <code className="text-xs bg-slate-100 px-1 rounded">
            {"{{insert:tag}}"}
          </code>
          . Section layouts are managed under{" "}
          <a href="/admin/sections" className="text-blue-600 underline">
            Sections
          </a>
          .
        </p>
      </div>

      <TemplatesAdminClient
        siteId={active.id}
        siteName={active.name}
        cssFramework={active.cssFramework}
      />
    </div>
  );
}
