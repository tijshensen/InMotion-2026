/**
 * Static site generator (legacy "render all pages").
 * Writes HTML + copies theme assets into public/sites/{slug}/
 */

import fs from "fs";
import path from "path";
import { prisma } from "./db";
import { renderPublicPage } from "./render";
import { generatedSiteFsDir } from "./site-context";

export type GenerateResult = {
  siteSlug: string;
  pagesWritten: number;
  outputDir: string;
  files: string[];
  errors: string[];
};

function rewriteToRelativeAssets(
  html: string,
  siteSlug: string,
  nestDepth: number,
): string {
  // Pages at root of sites/{slug}/ use ./assets/; nested a/b.html use ../assets/
  const up = nestDepth > 0 ? "../".repeat(nestDepth) : "./";
  let s = html;

  // Theme → local assets folder
  s = s.replace(/\/theme\/[a-zA-Z0-9_-]+\//g, `${up}assets/`);

  // Live routes → static files
  // /s/slug/foo → foo.html ; /s/slug → index.html
  s = s.replace(
    new RegExp(`href=(["'])/s/${siteSlug}/([^"']*)\\1`, "g"),
    (_m, q: string, rest: string) => {
      if (!rest || rest === "/") return `href=${q}${up}index.html${q}`;
      const clean = rest.replace(/\/$/, "");
      return `href=${q}${up}${clean}.html${q}`;
    },
  );
  s = s.replace(
    new RegExp(`href=(["'])/s/${siteSlug}\\1`, "g"),
    `href=$1${up}index.html$1`,
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

  const outRel = generatedSiteFsDir(site);
  const outAbs = path.join(process.cwd(), outRel);
  const files: string[] = [];
  const errors: string[] = [];

  // Clean previous publish (keep folder)
  fs.rmSync(outAbs, { recursive: true, force: true });
  fs.mkdirSync(outAbs, { recursive: true });

  // Copy theme assets → sites/{slug}/assets
  const themeSlug = site.themeSlug || site.slug;
  const themeSrc = path.join(process.cwd(), "public", "theme", themeSlug);
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

      // foo.html → depth 0; nested/path.html → depth 1
      const nestDepth = isHome
        ? 0
        : Math.max(0, page.slug.split("/").length - 1);

      const html = rewriteToRelativeAssets(result.html, site.slug, nestDepth);
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
    outputDir: outRel,
    files,
    errors,
  };
}
