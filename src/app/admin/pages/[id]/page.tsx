import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { renderMenuHtml, type MenuPage } from "@/lib/menu";
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
      template: true,
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

  // Full list — menu HTML builders exclude isHidden / !inMenu / orphans
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
  const menuHtml = isFullThemeShell(shellHtml)
    ? renderBootstrapMenuHtml(page.site.slug, menuPages)
    : renderMenuHtml(page.site.slug, menuPages);
  const siteTitle = page.site.siteTitle || page.site.name;
  const inserts = page.site.inserts.map((i) => ({
    tag: i.tag,
    content: i.content,
  }));

  return (
    <div className="admin-page-builder -mx-6 -my-8 max-w-none">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <Link
          href="/admin/pages"
          className="text-sm text-slate-500 hover:text-slate-800"
        >
          ← Pages
        </Link>
        <span className="text-slate-300">/</span>
        <h1 className="text-sm font-semibold text-slate-900 truncate max-w-[40vw]">
          {page.title}
        </h1>
        <span className="hidden sm:inline text-xs text-slate-400">
          {page.site.name} · {page.template?.name || "no template"}
        </span>
        <Link
          href={`/s/${page.site.slug}/${page.isDefault ? "" : page.slug}`}
          target="_blank"
          className="ml-auto rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs hover:bg-slate-50"
        >
          Open live page ↗
        </Link>
      </div>

      <PageEditor
        page={JSON.parse(JSON.stringify(page))}
        catalog={JSON.parse(JSON.stringify(catalog))}
        siteTitle={siteTitle}
        siteSlug={page.site.slug}
        shellHtml={shellHtml}
        menuHtml={menuHtml}
        inserts={JSON.parse(JSON.stringify(inserts))}
        linkPages={JSON.parse(JSON.stringify(linkPages))}
      />
    </div>
  );
}
