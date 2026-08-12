import {
  convertBootstrapHtml,
  TAILWIND_SHELL,
} from "./bootstrap-to-tailwind";
import { prisma } from "./db";
import { normalizeInsertHtml } from "./insert-html";
import {
  resolveInternalLinks,
  type LinkablePage,
} from "./internal-links";
import { renderMenuHtml, type MenuPage } from "./menu";
import { renderAllSections } from "./sections";

type RenderPageInput = {
  siteSlug: string;
  pathSegments?: string[];
};

/**
 * Template tokens:
 * {{page.title}}, {{site.title}}, {{menu}}, {{sections}}, {{insert:tag}}
 * Also supports legacy {{block:name}} if present (ignored when using sections).
 */
export async function renderPublicPage({
  siteSlug,
  pathSegments = [],
}: RenderPageInput): Promise<{ html: string; status: number } | null> {
  const site = await prisma.site.findUnique({
    where: { slug: siteSlug },
    include: {
      languages: true,
      inserts: true,
    },
  });

  if (!site || !site.isActive) return null;

  const language =
    site.languages.find((l) => l.isDefault) || site.languages[0];
  if (!language) return null;

  const slug =
    pathSegments.length === 0 || pathSegments[0] === ""
      ? "home"
      : pathSegments.join("/");

  let page = await prisma.page.findFirst({
    where: {
      siteId: site.id,
      languageId: language.id,
      slug,
      isHidden: false,
    },
    include: {
      blocks: {
        orderBy: { sortOrder: "asc" },
        include: { templateBlock: true },
      },
      template: true,
    },
  });

  if (!page) {
    page = await prisma.page.findFirst({
      where: {
        siteId: site.id,
        languageId: language.id,
        isDefault: true,
        isHidden: false,
      },
      include: {
        blocks: {
          orderBy: { sortOrder: "asc" },
          include: { templateBlock: true },
        },
        template: true,
      },
    });
    if (!page) return null;
  }

  const allPages = await prisma.page.findMany({
    where: {
      siteId: site.id,
      languageId: language.id,
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

  const menuPages = allPages.filter((p) => !p.isHidden) as MenuPage[];
  const linkPages: LinkablePage[] = allPages.map((p) => ({
    id: p.id,
    slug: p.slug,
    isDefault: p.isDefault,
    legacyId: p.legacyId,
    title: p.title,
    menuTitle: p.menuTitle,
  }));

  const menu = renderMenuHtml(site.slug, menuPages);

  let sectionsHtml = renderAllSections(
    page.blocks.map((b) => ({
      templateHtml: b.templateBlock?.defaultHtml || "",
      content: b.content,
      css: b.css,
      isHidden: b.isHidden,
    })),
  );
  // Resolve #internalURI{legacyId} / #page:{id} inside section HTML
  sectionsHtml = resolveInternalLinks(sectionsHtml, site.slug, linkPages);

  // Prefer stored shell; upgrade Bootstrap shells to Tailwind automatically
  let html = page.template?.coreHtml || TAILWIND_SHELL;
  if (/bootstrap/i.test(html) || !html.includes("cdn.tailwindcss.com")) {
    html = TAILWIND_SHELL;
  }

  html = html
    .replaceAll("{{page.title}}", escapeHtml(page.title))
    .replaceAll("{{page.metaDescription}}", escapeHtml(page.metaDescription))
    .replaceAll("{{site.title}}", escapeHtml(site.siteTitle || site.name))
    .replaceAll("{{site.slug}}", escapeHtml(site.slug))
    .replaceAll("{{menu}}", menu)
    .replaceAll("{{sections}}", sectionsHtml);

  // Fallback if shell has no {{sections}} token
  if (!html.includes(sectionsHtml)) {
    if (html.includes("</main>")) {
      html = html.replace("</main>", `${sectionsHtml}</main>`);
    } else if (html.includes("</body>")) {
      html = html.replace("</body>", `${sectionsHtml}</body>`);
    } else {
      html += sectionsHtml;
    }
  }

  // Clear unused block placeholders
  html = html.replace(/\{\{block:[a-zA-Z0-9_-]+\}\}/g, "");

  html = html.replace(
    /\{\{insert:([a-zA-Z0-9_\[\]-]+)\}\}/g,
    (_m, tag: string) => {
      const insert = site.inserts.find((i) => i.tag === tag);
      if (!insert) return "";
      return convertBootstrapHtml(normalizeInsertHtml(insert.content));
    },
  );

  // Resolve any remaining internal link refs in shell / inserts
  html = resolveInternalLinks(html, site.slug, linkPages);

  const status =
    page.slug === slug || slug === "home" || page.isDefault ? 200 : 404;

  return { html, status };
}

function defaultShellHtml() {
  return TAILWIND_SHELL;
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
