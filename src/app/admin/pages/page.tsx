import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getActiveSite } from "@/lib/site-context";
import { CreatePageForm } from "./create-page-form";
import { PagesTable } from "./pages-table";

export default async function PagesAdminPage() {
  await requireUser();
  const active = await getActiveSite();

  const sites = await prisma.site.findMany({
    include: {
      languages: true,
      templateSets: { include: { templates: true } },
    },
    orderBy: { name: "asc" },
  });

  const pages = await prisma.page.findMany({
    where: active ? { siteId: active.id } : undefined,
    orderBy: [{ sortOrder: "asc" }],
    include: {
      site: true,
      language: true,
      _count: { select: { blocks: true } },
    },
  });

  const defaultSiteId = active?.id || sites[0]?.id;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Pages</h1>
          <p className="text-slate-500 mt-1">
            {active
              ? `Editing pages for ${active.name}`
              : "Select a website from the top bar."}
          </p>
        </div>
      </div>

      <CreatePageForm
        sites={JSON.parse(JSON.stringify(sites))}
        defaultSiteId={defaultSiteId}
      />

      <PagesTable
        pages={JSON.parse(JSON.stringify(pages))}
        sites={sites.map((s) => ({ id: s.id, name: s.name, slug: s.slug }))}
        defaultSiteId={defaultSiteId}
      />
    </div>
  );
}
