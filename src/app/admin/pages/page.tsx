import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { CreatePageForm } from "./create-page-form";
import { PagesTable } from "./pages-table";

export default async function PagesAdminPage() {
  await requireUser();

  const sites = await prisma.site.findMany({
    include: {
      languages: true,
      templateSets: { include: { templates: true } },
    },
    orderBy: { name: "asc" },
  });

  const pages = await prisma.page.findMany({
    orderBy: [{ siteId: "asc" }, { sortOrder: "asc" }],
    include: {
      site: true,
      language: true,
      _count: { select: { blocks: true } },
    },
  });

  const kiekeboeId = sites.find((s) => s.slug === "kiekeboe")?.id;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Pages</h1>
          <p className="text-slate-500 mt-1">
            Open <strong>Builder</strong> on any row to edit title + body with
            the visual page builder.
          </p>
        </div>
      </div>

      <CreatePageForm
        sites={JSON.parse(JSON.stringify(sites))}
        defaultSiteId={kiekeboeId}
      />

      <PagesTable
        pages={JSON.parse(JSON.stringify(pages))}
        sites={sites.map((s) => ({ id: s.id, name: s.name, slug: s.slug }))}
        defaultSiteId={kiekeboeId}
      />
    </div>
  );
}
