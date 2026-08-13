/**
 * Static site generator (legacy "render all pages").
 * Writes HTML + copies theme assets into generatedSitesRoot()/{slug}/
 * (public/sites locally, or $DATA_DIR/sites on Railway).
 */

import fs from "fs";
import path from "path";
import { prisma } from "./db";
import { renderPublicPage } from "./render";
import { generatedSiteAbsDir, themeAbsDir } from "./paths";

export type GenerateResult = {
  siteSlug: string;
  pagesWritten: number;
  outputDir: string;
  files: string[];
  errors: string[];
};

/**
 * Point theme assets + internal links at absolute /sites/{slug}/… URLs.
 * Absolute paths avoid broken ./assets when the browser is on /sites/slug
 * (no trailing slash).
 */
function rewriteForStaticPublish(html: string, siteSlug: string): string {
  const base = `/sites/${siteSlug}`;
  let s = html;

  // Theme → published assets
  s = s.replace(/\/theme\/[a-zA-Z0-9_-]+\//g, `${base}/assets/`);

  // Live preview routes → static HTML files
  s = s.replace(
    new RegExp(`href=(["'])/s/${siteSlug}/([^"']*)\\1`, "g"),
    (_m, q: string, rest: string) => {
      if (!rest || rest === "/") return `href=${q}${base}${q}`;
      const clean = rest.replace(/\/$/, "");
      return `href=${q}${base}/${clean}${q}`;
    },
  );
  s = s.replace(
    new RegExp(`href=(["'])/s/${siteSlug}\\1`, "g"),
    `href=$1${base}$1`,
  );

  return s;
}

function copyDir(src: string, dest: string) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

/**
 * Generate a full static website for one site.
 */
export async function generateStaticSite(
  siteId: string,
): Promise<GenerateResult> {
  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site) throw new Error("Site not found");

  const language =
    (await prisma.language.findFirst({
      where: { siteId: site.id, isDefault: true },
    })) ||
    (await prisma.language.findFirst({ where: { siteId: site.id } }));

  if (!language) throw new Error("No language for site");

  const pages = await prisma.page.findMany({
    where: { siteId: site.id, languageId: language.id, isHidden: false },
    orderBy: { sortOrder: "asc" },
  });

  const outAbs = generatedSiteAbsDir(site);
  const files: string[] = [];
  const errors: string[] = [];

  // Clean previous publish (keep folder)
  fs.rmSync(outAbs, { recursive: true, force: true });
  fs.mkdirSync(outAbs, { recursive: true });

  // Copy theme assets → sites/{slug}/assets
  const themeSlug = site.themeSlug || site.slug;
  const themeSrc = themeAbsDir(themeSlug);
  const assetsDest = path.join(outAbs, "assets");
  if (fs.existsSync(themeSrc)) {
    copyDir(themeSrc, assetsDest);
    files.push("assets/");
  }

  let pagesWritten = 0;

  for (const page of pages) {
    try {
      const pathSegments =
        page.isDefault || page.slug === "home" ? [] : page.slug.split("/");
      const result = await renderPublicPage({
        siteSlug: site.slug,
        pathSegments,
      });
      if (!result) {
        errors.push(`${page.slug}: render returned null`);
        continue;
      }

      // Nested path support
      const isHome = page.isDefault || page.slug === "home";
      const fileRel = isHome
        ? "index.html"
        : path.join(...page.slug.split("/")) + ".html";
      const fileAbs = path.join(outAbs, fileRel);
      fs.mkdirSync(path.dirname(fileAbs), { recursive: true });

      const html = rewriteForStaticPublish(result.html, site.slug);
      fs.writeFileSync(fileAbs, html, "utf8");
      files.push(fileRel);
      pagesWritten++;
    } catch (e) {
      errors.push(
        `${page.slug}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // Write a simple _meta.json
  const meta = {
    site: site.slug,
    generatedAt: new Date().toISOString(),
    pages: pagesWritten,
    framework: site.cssFramework,
  };
  fs.writeFileSync(
    path.join(outAbs, "_meta.json"),
    JSON.stringify(meta, null, 2),
  );
  files.push("_meta.json");

  await prisma.site.update({
    where: { id: site.id },
    data: { lastGeneratedAt: new Date() },
  });

  return {
    siteSlug: site.slug,
    pagesWritten,
    outputDir: outAbs,
    files,
    errors,
  };
}
