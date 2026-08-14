import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
import { renderMenuHtml, type MenuPage } from "@/lib/menu";
import {
  menuTokenWantsBareItems,
  renderMenuFromSnippets,
  resolveMenuSnippets,
} from "@/lib/menu-snippets";
import { isFullThemeShell, renderBootstrapMenuHtml } from "@/lib/theme";
import { PageEditor } from "./page-editor";

type Props = { params: Promise<{ id: string }> };

export default async function EditPageAdmin({ params }: Props) {
  await requireUser();
  const { id } = await params;

  const page = await prisma.page.findUnique({
    where: { id },
    include: {
      blocks: {
        orderBy: { sortOrder: "asc" },
        include: { templateBlock: true },
      },
      site: {
        include: {
          inserts: {
            select: { tag: true, content: true },
          },
        },
      },
      language: true,
      template: {
        include: {
          templateSet: { select: { menuHtml: true, submenuHtml: true } },
        },
      },
    },
  });

  if (!page) notFound();

  const catalog = page.templateId
    ? await prisma.templateBlock.findMany({
        where: { templateId: page.templateId },
        orderBy: { sortOrder: "asc" },
      })
    : [];

  const allPages = await prisma.page.findMany({
    where: {
      siteId: page.siteId,
      languageId: page.languageId,
    },
    orderBy: { sortOrder: "asc" },
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
      legacyId: true,
    },
  });

  const menuPages = allPages as MenuPage[];
  const linkPages = allPages.map((p) => ({
    id: p.id,
    title: p.title,
    menuTitle: p.menuTitle,
    slug: p.slug,
    isDefault: p.isDefault,
    legacyId: p.legacyId,
  }));

  const shellHtml = page.template?.coreHtml || "";
  const snippets = resolveMenuSnippets({
    template: page.template,
    templateSet: page.template?.templateSet,
  });
  const menuHtml =
    renderMenuFromSnippets(snippets, page.site.slug, menuPages, page.id, {
      bareItems: menuTokenWantsBareItems(shellHtml),
    }) ||
    (isFullThemeShell(shellHtml)
      ? renderBootstrapMenuHtml(page.site.slug, menuPages)
      : renderMenuHtml(page.site.slug, menuPages));
  const siteTitle = page.site.siteTitle || page.site.name;
  const inserts = page.site.inserts.map((i) => ({
    tag: i.tag,
    content: i.content,
  }));

  // Full-bleed canvas only — no breadcrumb bar (page select + actions live in top nav)
  return (
    <div className="admin-page-builder h-full min-h-0 w-full overflow-hidden">
      <PageEditor
        page={JSON.parse(JSON.stringify(page))}
        catalog={JSON.parse(JSON.stringify(catalog))}
        siteTitle={siteTitle}
        siteSlug={page.site.slug}
        shellHtml={shellHtml}
        menuHtml={menuHtml}
        inserts={JSON.parse(JSON.stringify(inserts))}
        linkPages={JSON.parse(JSON.stringify(linkPages))}
        cssFramework={page.site.cssFramework || "none"}
      />
    </div>
  );
}
