import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { MenuBuilderClient } from "./menu-builder-client";

export default async function MenusAdminPage() {
  await requireUser();

  const sites = await prisma.site.findMany({
    orderBy: { name: "asc" },
    include: {
      languages: { orderBy: { name: "asc" } },
    },
  });

  const site = sites[0];
  const language =
    site?.languages.find((l) => l.isDefault) || site?.languages[0];

  const pages =
    site && language
      ? await prisma.page.findMany({
          where: { siteId: site.id, languageId: language.id },
          orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
          select: {
            id: true,
            title: true,
            menuTitle: true,
            slug: true,
            parentId: true,
            sortOrder: true,
            isDefault: true,
            isHidden: true,
            inMenu: true,
          },
        })
      : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Menu builder</h1>
        <p className="text-slate-500 mt-1">
          Order, nest, and label navigation for each site and language. Public
          templates use <code className="text-xs">{"{{menu}}"}</code>.
        </p>
      </div>

      <MenuBuilderClient
        sites={JSON.parse(
          JSON.stringify(
            sites.map((s) => ({
              id: s.id,
              name: s.name,
              languages: s.languages.map((l) => ({
                id: l.id,
                name: l.name,
                code: l.code,
              })),
            })),
          ),
        )}
        initialSiteId={site?.id || ""}
        initialLanguageId={language?.id || ""}
        initialPages={JSON.parse(JSON.stringify(pages))}
      />
    </div>
  );
}
