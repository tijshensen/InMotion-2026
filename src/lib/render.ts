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
import {
  isFullThemeShell,
  renderBootstrapMenuHtml,
  rewriteThemeAssetUrls,
} from "./theme";

type RenderPageInput = {
  siteSlug: string;
  pathSegments?: string[];
};

/**
 * Template tokens:
 * {{page.title}}, {{site.title}}, {{site.slug}}, {{menu}}, {{sections}}, {{insert:tag}}
 * Legacy (normalized on import): [repeatBlock_0], <insert menu/>, [FOOTER]
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

  let html = page.template?.coreHtml?.trim() || TAILWIND_SHELL;
  const fullTheme = isFullThemeShell(html);

  // Full MotionCMS themes keep Bootstrap markup → Bootstrap menu.
  // Minimal shells use Tailwind nav.
  const menu = fullTheme
    ? renderBootstrapMenuHtml(site.slug, menuPages)
    : renderMenuHtml(site.slug, menuPages);

  // Only force minimal shell when we have no real template
  if (!page.template?.coreHtml?.trim()) {
    html = TAILWIND_SHELL;
  }

  let sectionsHtml = renderAllSections(
    page.blocks.map((b) => ({
      templateHtml: b.templateBlock?.defaultHtml || "",
      content: b.content,
      css: b.css,
      isHidden: b.isHidden,
    })),
  );
  sectionsHtml = resolveInternalLinks(sectionsHtml, site.slug, linkPages);
  sectionsHtml = rewriteThemeAssetUrls(sectionsHtml, site.slug);

  // Wrap sections so theme CSS spacing still applies
  if (fullTheme && !sectionsHtml.includes("cms-page-sections")) {
    sectionsHtml = `<div class="cms-page-sections">${sectionsHtml}</div>`;
  }

  html = rewriteThemeAssetUrls(html, site.slug);

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

  // Inserts: {{insert:tag}} and bare [TAG] leftovers
  const resolveInsert = (tag: string) => {
    const insert =
      site.inserts.find((i) => i.tag === tag) ||
      site.inserts.find((i) => i.tag === `[${tag}]`) ||
      site.inserts.find((i) => i.tag === tag.replace(/^\[|\]$/g, ""));
    if (!insert) return "";
    let content = convertBootstrapHtml(normalizeInsertHtml(insert.content));
    content = rewriteThemeAssetUrls(content, site.slug);
    return content;
  };

  html = html.replace(
    /\{\{insert:([a-zA-Z0-9_\[\]-]+)\}\}/g,
    (_m, tag: string) => resolveInsert(tag),
  );
  // Any remaining [FOOTER]-style tags
  html = html.replace(/\[([A-Z][A-Z0-9_]*)\]/g, (_m, tag: string) =>
    resolveInsert(`[${tag}]`) || resolveInsert(tag) || "",
  );

  html = resolveInternalLinks(html, site.slug, linkPages);

  // Home / logo links in theme often point to index.html
  html = html.replace(
    /href=(["'])(?:index\.html|\.\.\/|\.\/)\1/gi,
    `href=$1/s/${site.slug}$1`,
  );

  const status =
    page.slug === slug || slug === "home" || page.isDefault ? 200 : 404;

  return { html, status };
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
