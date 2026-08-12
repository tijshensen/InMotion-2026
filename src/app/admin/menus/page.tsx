import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getActiveSite } from "@/lib/site-context";
import { MenuBuilderClient } from "./menu-builder-client";

export default async function MenusAdminPage() {
  await requireUser();
  const active = await getActiveSite();

  if (!active) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Menu builder</h1>
        <p className="text-sm text-slate-500">
          Select a website in the top bar first.
        </p>
      </div>
    );
  }

  const site = await prisma.site.findUnique({
    where: { id: active.id },
    include: {
      languages: { orderBy: { name: "asc" } },
    },
  });

  if (!site) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Menu builder</h1>
        <p className="text-sm text-slate-500">Website not found.</p>
      </div>
    );
  }

  const language =
    site.languages.find((l) => l.isDefault) || site.languages[0];

  const pages = language
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
          Navigation for{" "}
          <strong className="text-slate-700">{site.name}</strong>. Public
          templates use <code className="text-xs">{"{{menu}}"}</code>.
        </p>
      </div>

      <MenuBuilderClient
        site={{
          id: site.id,
          name: site.name,
          languages: site.languages.map((l) => ({
            id: l.id,
            name: l.name,
            code: l.code,
          })),
        }}
        initialLanguageId={language?.id || ""}
        initialPages={JSON.parse(JSON.stringify(pages))}
      />
    </div>
  );
}
