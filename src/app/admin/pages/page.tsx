import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getActiveSite } from "@/lib/site-context";
import { CreatePageSlide } from "./create-page-form";
import { PagesTable } from "./pages-table";

export default async function PagesAdminPage() {
  await requireUser();
  const active = await getActiveSite();

  const site = active
    ? await prisma.site.findUnique({
        where: { id: active.id },
        include: {
          languages: true,
          templateSets: { include: { templates: true } },
        },
      })
    : null;

  const pages = active
    ? await prisma.page.findMany({
        where: { siteId: active.id },
        orderBy: [{ sortOrder: "asc" }],
        include: {
          site: true,
          language: true,
          _count: { select: { blocks: true } },
        },
      })
    : [];

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Pages</h1>
          <p className="text-slate-500 mt-1">
            {active
              ? `Editing pages for ${active.name}`
              : "No website selected. Open Websites to choose or create one."}
          </p>
        </div>
        <CreatePageSlide
          site={site ? JSON.parse(JSON.stringify(site)) : null}
          cssFramework={active?.cssFramework || "none"}
          isFirstPage={pages.length === 0}
        />
      </div>

      <PagesTable pages={JSON.parse(JSON.stringify(pages))} />
    </div>
  );
}
