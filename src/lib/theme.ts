/**
 * Full theme / template engine helpers.
 *
 * Legacy MotionCMS templates use:
 *   [repeatBlock_0]           → page sections
 *   <insert menu …/>          → main navigation
 *   [FOOTER], [GOOGLEANALYTICS] → inserts
 *   Absolute /content/ asset URLs → /theme/{slug}/…
 */

import {
  buildMenuTree,
  filterPagesForMenu,
  pageHref,
  type MenuPage,
} from "./menu";

const LEGACY_CONTENT_HOSTS = [
  "http://cms.kinderdagverblijfkiekeboe.nl/content/",
  "https://cms.kinderdagverblijfkiekeboe.nl/content/",
  "http://localhost:8888/cmsinmotion/cms/content/",
  "https://localhost:8888/cmsinmotion/cms/content/",
  "http://cms.joomlamigrator.com/content/",
  "https://cms.joomlamigrator.com/content/",
];

/**
 * Rewrite legacy /content/ asset URLs to local theme paths for CSS/JS/fonts/lib.
 * Content images stay on the original host (full media dump is hundreds of MB).
 * Logo is available locally at /theme/{slug}/images/logo.png.
 */
export function rewriteThemeAssetUrls(
  html: string,
  themeSlug = "kiekeboe",
): string {
  if (!html) return html;
  let s = html;
  const base = `/theme/${themeSlug}/`;

  for (const host of LEGACY_CONTENT_HOSTS) {
    // Static theme packages only
    s = s.replaceAll(`${host}css/`, `${base}css/`);
    s = s.replaceAll(`${host}js/`, `${base}js/`);
    s = s.replaceAll(`${host}lib/`, `${base}lib/`);
    s = s.replaceAll(`${host}fonts/`, `${base}fonts/`);
    s = s.replaceAll(`${host}favicon.ico`, `${base}favicon.ico`);
    s = s.replaceAll(`${host}images/logo.png`, `${base}images/logo.png`);
    s = s.replaceAll(`${host}images/logo.PNG`, `${base}images/logo.png`);
  }

  s = s.replace(
    /\/\/cms\.kinderdagverblijfkiekeboe\.nl\/content\/(css|js|lib|fonts)\//g,
    `${base}$1/`,
  );
  s = s.replace(
    /\/\/cms\.kinderdagverblijfkiekeboe\.nl\/content\/images\/logo\.png/gi,
    `${base}images/logo.png`,
  );

  return s;
}

/** Swap theme logo.png / {{site.logo}} for the uploaded website logo. */
export function applySiteLogo(
  html: string,
  logoPath: string | null | undefined,
  themeSlug?: string,
): string {
  if (!html) return html;
  const path = (logoPath || "").trim();
  const fallback =
    themeSlug ? `/theme/${themeSlug}/images/logo.png` : "";
  const src = path || fallback;
  let s = html.replaceAll("{{site.logo}}", src);
  if (path && themeSlug) {
    s = s.replaceAll(`/theme/${themeSlug}/images/logo.png`, path);
    s = s.replaceAll(`/theme/${themeSlug}/images/logo.PNG`, path);
  }
  return s;
}

/**
 * Normalize a raw legacy template `core` HTML into our token system
 * while preserving the full theme markup.
 */
export function normalizeLegacyTemplateCore(
  core: string,
  themeSlug = "kiekeboe",
): string {
  let html = core || "";
  html = rewriteThemeAssetUrls(html, themeSlug);

  // Content area: all repeat blocks → sections token (pages use ordered sections)
  html = html.replace(/\[repeatBlock_\d+\]/gi, "{{sections}}");

  // Menu insert (various shapes)
  html = html.replace(
    /<insert\s+menu\b[^>]*\/?>/gi,
    "{{menu}}",
  );
  html = html.replace(/\{\{insert:menu\}\}/gi, "{{menu}}");

  // Legacy bracket inserts → {{insert:TAG}}
  // Avoid double-wrapping if already converted
  html = html.replace(/\[([A-Z][A-Z0-9_]*)\]/g, (full, tag: string) => {
    // leave IE conditionals alone ([if …] already not matched by this pattern well)
    if (tag === "endif" || tag.startsWith("if")) return full;
    return `{{insert:[${tag}]}}`;
  });

  // Title / meta tokens when static
  html = html.replace(
    /<title>[^<]*<\/title>/i,
    "<title>{{page.title}} — {{site.title}}</title>",
  );
  if (!html.includes('name="description"') && html.includes("</head>")) {
    html = html.replace(
      "</head>",
      '<meta name="description" content="{{page.metaDescription}}" />\n</head>',
    );
  } else {
    html = html.replace(
      /(<meta\s+name=["']description["']\s+content=["'])([^"']*)(["'])/i,
      "$1{{page.metaDescription}}$3",
    );
  }

  // Ensure {{sections}} exists
  if (!html.includes("{{sections}}")) {
    if (html.includes("</body>")) {
      html = html.replace("</body>", "{{sections}}</body>");
    } else {
      html += "{{sections}}";
    }
  }

  return html;
}

/** Detect if shell is a full HTML document theme (not our minimal shell). */
export function isFullThemeShell(html: string): boolean {
  if (!html) return false;
  return (
    /data-cms-clone\s*=/.test(html) ||
    (/<!DOCTYPE\s+html/i.test(html) &&
      (/bootstrap|kiekeboe\.css|navbar-static-top|bs-navbar/i.test(html) ||
        (html.includes("{{sections}}") && html.length > 3000)))
  );
}

/**
 * Bootstrap 3 nav HTML matching original template menu field,
 * for use inside .navbar-collapse (full Kiekeboe theme).
 */
export function renderBootstrapMenuHtml(
  siteSlug: string,
  pages: MenuPage[],
): string {
  // Same rules as Tailwind menu: no hidden pages, no orphans under hidden parents
  const visible = filterPagesForMenu(pages);
  const tree = buildMenuTree(visible);
  if (!tree.length) return "";

  const escape = (s: string) =>
    s
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  const renderChildren = (
    nodes: ReturnType<typeof buildMenuTree>,
  ): string =>
    nodes
      .map((n) => {
        const label = escape(n.menuTitle || n.title);
        const href = pageHref(siteSlug, n);
        if (n.children.length) {
          return `<li class="dropdown">
  <a href="${href}" class="dropdown-toggle" data-toggle="dropdown" role="button" aria-expanded="false">${label} <span class="caret"></span></a>
  <ul class="dropdown-menu" role="menu">
    ${n.children
      .map((c) => {
        const cl = escape(c.menuTitle || c.title);
        const ch = pageHref(siteSlug, c);
        if (c.children.length) {
          return `<li class="dropdown-header">${cl}</li>${c.children
            .map(
              (gc) =>
                `<li><a href="${pageHref(siteSlug, gc)}">${escape(gc.menuTitle || gc.title)}</a></li>`,
            )
            .join("")}`;
        }
        return `<li><a href="${ch}">${cl}</a></li>`;
      })
      .join("\n")}
  </ul>
</li>`;
        }
        return `<li><a href="${href}">${label}</a></li>`;
      })
      .join("\n");

  return `<ul class="nav navbar-nav">\n${renderChildren(tree)}\n</ul>`;
}
