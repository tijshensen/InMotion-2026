import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { prisma } from "./db";
import { createSiteForOrg } from "./sites";
import { publicUrlFor, saveMediaBuffer } from "./media";
import { uploadsRoot } from "./paths";
import {
  scrapePage,
  scrapeBrowserUa,
  extractDocumentHead,
  sanitizeCloneBodyClass,
  CLONE_CSS_FILE_MIN,
  type PageSnapshot,
  type ScrapedImage,
  type CssSheet,
} from "./scrape-page";
import {
  balanceHtmlFragment,
  splitPageShell,
  stripSectionChrome,
  stripTags,
} from "./html-split";
import {
  cloneSectionName,
  collapseCloneRepeats,
  splitCloneBands,
  unwrapTextMarkers,
  wrapCloneMarkers,
} from "./clone-bands";
import { unwrapRepeatableTags } from "./section-repeat";
import {
  cloneFixStyleTag,
  cloneReviveScriptTag,
  wrapSectionsInBuilderChrome,
} from "./clone-runtime";
import {
  applyImportPlan,
  applyImportPlanAsTemplate,
  type ImportPlan,
} from "./import-from-url";
import { emptyFieldsFromTemplate, serializeContent } from "./sections";
import { scheduleSectionPreview } from "./section-preview";

function splitContent(
  content: string,
  builder: string,
): {
  name: string;
  html: string;
  repeatSeeds?: {
    groupKey: string;
    fields: Record<string, string>;
    labels?: Record<string, string>;
  }[];
}[] {
  let chunks = splitCloneBands(content, builder);
  if (chunks.length > 20) {
    const head = chunks.slice(0, 19);
    const tail = chunks.slice(19).join("\n");
    chunks = [...head, tail];
  }

  const sections = chunks
    .map((html, i) => {
      const cleaned = balanceHtmlFragment(stripSectionChrome(html));
      const name = cloneSectionName(cleaned, i);
      const marked = wrapCloneMarkers(cleaned, builder);
      const collapsed = collapseCloneRepeats(marked, name);
      return {
        name,
        html: collapsed.html,
        repeatSeeds: collapsed.repeatSeeds,
      };
    })
    .filter(
      (s) =>
        stripTags(s.html).length > 8 ||
        /<img\b/i.test(s.html) ||
        /background/i.test(s.html),
    );

  return sections.length
    ? sections
    : [{ name: "Content", html: wrapCloneMarkers(content, builder) }];
}

function stripHeadScripts(head: string) {
  return head
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<link\b[^>]*rel=["']?modulepreload["']?[^>]*>/gi, "")
    .replace(
      /<link\b[^>]*rel=["']?preload["']?[^>]*as=["']?script["']?[^>]*>/gi,
      "",
    );
}

function linkHref(tag: string): string {
  const m = tag.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
  return (m?.[2] ?? m?.[3] ?? m?.[4] ?? "").trim();
}

function linkRel(tag: string): string {
  const m = tag.match(/\brel\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
  return (m?.[2] ?? m?.[3] ?? m?.[4] ?? "").trim().toLowerCase();
}

/** Local clone.css is rewritten from the original bytes, so SRI hashes must go. */
export function rewriteStylesheetHrefs(
  head: string,
  hrefMap: Map<string, string>,
): string {
  if (!head || hrefMap.size === 0) return head;
  const locals = [...hrefMap.entries()];
  return head.replace(/<link\b[^>]*>/gi, (tag) => {
    const rel = linkRel(tag);
    if (!rel.includes("stylesheet") && !/\bas\s*=\s*["']?style/i.test(tag)) {
      return tag;
    }
    const href = linkHref(tag);
    let local = hrefMap.get(href);
    if (!local && href) {
      for (const [from, to] of locals) {
        try {
          if (from === href || new URL(from).pathname === href) {
            local = to;
            break;
          }
        } catch {
          if (from.endsWith(href) || href.endsWith(from.split("/").pop() || "\0")) {
            local = to;
            break;
          }
        }
      }
    }
    if (!local) return tag;
    let next = tag.replace(
      /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i,
      `href="${local}"`,
    );
    next = next.replace(/\s+integrity\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i, "");
    next = next.replace(/\s+crossorigin(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+)))?/gi, "");
    if (!/data-cms-cloned-css/i.test(next)) {
      next = next.replace(/<link\b/i, `<link data-cms-cloned-css="1"`);
    }
    return next;
  });
}

async function persistLargeStylesheets(
  siteSlug: string,
  sheets: CssSheet[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const slug = siteSlug.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "site";
  const dir = path.join(uploadsRoot(), slug);
  let n = 0;
  for (const sheet of sheets) {
    if (!sheet.css || sheet.css.length < CLONE_CSS_FILE_MIN) continue;
    n += 1;
    const file = n === 1 ? "clone.css" : `clone-${n}.css`;
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, file), sheet.css, "utf8");
    map.set(sheet.href, publicUrlFor(`${slug}/${file}`));
  }
  return map;
}

function buildCoreHtml(
  snapshot: PageSnapshot,
  sheetHrefMap: Map<string, string> = new Map(),
): string {
  let headInner = stripHeadScripts(extractDocumentHead(snapshot.html));
  headInner = headInner.replace(
    /<title[^>]*>[\s\S]*?<\/title>/i,
    "<title>{{page.title}}</title>",
  );
  if (!/<title/i.test(headInner)) {
    headInner = `<title>{{page.title}}</title>\n${headInner}`;
  }
  headInner = rewriteStylesheetHrefs(headInner, sheetHrefMap);
  for (const localHref of sheetHrefMap.values()) {
    if (localHref && !headInner.includes(localHref)) {
      headInner += `\n<link rel="stylesheet" href="${localHref}" data-cms-cloned-css="1" />\n`;
    }
  }

  const hasSheetLink = /<link\b[^>]*stylesheet/i.test(headInner);
  const clonedCss =
    !hasSheetLink && snapshot.css.trim()
      ? `<style data-cms-cloned-css="1">\n${snapshot.css}\n</style>`
      : "";

  const lang = (snapshot.htmlLang || "en").replace(/[^a-zA-Z0-9-]/g, "") || "en";
  const bodyClass = sanitizeCloneBodyClass(
    snapshot.bodyClass || "cms-clone",
  );
  const withClone = /\bcms-clone\b/.test(bodyClass)
    ? bodyClass
    : `${bodyClass} cms-clone`.trim();
  const chrome = wrapSectionsInBuilderChrome(snapshot.builder);
  return `<!DOCTYPE html>
<html lang="${lang}" data-cms-clone="1" data-cms-builder="${snapshot.builder}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${headInner}
${clonedCss}
${cloneFixStyleTag()}
</head>
<body class="${withClone}">
${chrome}
${cloneReviveScriptTag()}
</body>
</html>`;
}

function splitShell(snapshot: PageSnapshot) {
  return splitPageShell(snapshot.html);
}

async function downloadImages(
  images: ScrapedImage[],
  opts: { siteId: string; siteSlug: string; referer: string },
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const queue = images.slice(0, 48);
  let i = 0;
  const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (i < queue.length) {
      const img = queue[i++];
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 15_000);
        const res = await fetch(img.url, {
          signal: ctrl.signal,
          redirect: "follow",
          headers: {
            "User-Agent": scrapeBrowserUa,
            Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
            Referer: opts.referer,
          },
        });
        clearTimeout(t);
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 80) continue;
        const mime = (res.headers.get("content-type") || "").split(";")[0].trim();
        const name =
          decodeURIComponent(new URL(img.url).pathname.split("/").pop() || "") ||
          "image.jpg";
        const saved = await saveMediaBuffer({
          siteSlug: opts.siteSlug,
          buffer: buf,
          filename: name,
          mimeType: mime,
        });
        await prisma.mediaAsset.create({
          data: {
            siteId: opts.siteId,
            filename: saved.filename,
            path: saved.path,
            mimeType: saved.mimeType,
            sizeBytes: saved.sizeBytes,
            alt: img.alt || "",
            posterPath: saved.posterPath || "",
          },
        });
        map.set(img.url, saved.path);
      } catch {
        /* skip one image */
      }
    }
  });
  await Promise.all(workers);
  return map;
}

function rewriteUrls(html: string, map: Map<string, string>) {
  let s = html;
  for (const [from, to] of map) {
    s = s.split(from).join(to);
  }
  return s;
}

export function planCloneFromSnapshot(
  snapshot: PageSnapshot,
  imageMap: Map<string, string>,
  sheetHrefMap: Map<string, string> = new Map(),
): ImportPlan {
  const html = rewriteUrls(snapshot.html, imageMap);
  const css = rewriteUrls(snapshot.css, imageMap);
  const cssSheets = (snapshot.cssSheets || []).map((s) => ({
    href: s.href,
    css: rewriteUrls(s.css, imageMap),
  }));
  const snapped = { ...snapshot, html, css, cssSheets };
  const { header, footer, content, afterContent } = splitShell(snapped);
  const sections = splitContent(rewriteUrls(content, imageMap), snapshot.builder);
  const coreHtml = buildCoreHtml(snapped, sheetHrefMap);
  const inserts = [
    { tag: "header", content: rewriteUrls(header, imageMap) },
    { tag: "after", content: rewriteUrls(afterContent, imageMap) },
    { tag: "footer", content: rewriteUrls(footer, imageMap) },
  ].filter((i) => i.content.trim());
  return {
    siteTitle: snapshot.title,
    coreHtml,
    menuHtml: "",
    submenuHtml: "",
    sections,
    inserts,
  };
}

export async function cloneSiteFromUrl(opts: {
  organizationId: string;
  name?: string;
  sourceUrl: string;
  creatorUserId: string;
}) {
  const snapshot = await scrapePage(opts.sourceUrl);
  const site = await createSiteForOrg({
    organizationId: opts.organizationId,
    name: (opts.name || snapshot.title).trim(),
    siteTitle: snapshot.title,
    cssFramework: snapshot.cssKind,
    sourceUrl: snapshot.finalUrl || opts.sourceUrl,
    creatorUserId: opts.creatorUserId,
  });
  const language = site.languages[0];
  if (!language) throw new Error("Site language missing");

  const imageMap = await downloadImages(snapshot.images, {
    siteId: site.id,
    siteSlug: site.slug,
    referer: snapshot.finalUrl,
  });
  const sheetHrefMap = await persistLargeStylesheets(
    site.slug,
    (snapshot.cssSheets || []).map((s) => ({
      href: s.href,
      css: rewriteUrls(s.css, imageMap),
    })),
  );
  const plan = planCloneFromSnapshot(snapshot, imageMap, sheetHrefMap);
  const applied = await applyImportPlan({
    siteId: site.id,
    languageId: language.id,
    plan,
    creatorUserId: opts.creatorUserId,
    title: "Home",
    slug: "home",
    menuTitle: "Home",
    templateName: "Home",
    isDefault: true,
  });

  await prisma.siteSetting.createMany({
    data: [
      { siteId: site.id, key: "importedFromUrl", value: opts.sourceUrl },
      { siteId: site.id, key: "importMode", value: "clone" },
      {
        siteId: site.id,
        key: "cloneSnapshot",
        value: JSON.stringify({
          builder: snapshot.builder,
          cssKind: snapshot.cssKind,
          imageCount: snapshot.images.length,
          downloaded: imageMap.size,
          headings: snapshot.headings,
        }),
      },
    ],
  });

  return { site, ...applied };
}

export async function cloneTemplateFromUrl(opts: {
  siteId: string;
  sourceUrl: string;
  name?: string;
}) {
  const site = await prisma.site.findUnique({
    where: { id: opts.siteId },
    select: { id: true, slug: true },
  });
  if (!site) throw new Error("Site not found");
  const snapshot = await scrapePage(opts.sourceUrl);
  const imageMap = await downloadImages(snapshot.images, {
    siteId: site.id,
    siteSlug: site.slug,
    referer: snapshot.finalUrl,
  });
  const sheetHrefMap = await persistLargeStylesheets(
    site.slug,
    (snapshot.cssSheets || []).map((s) => ({
      href: s.href,
      css: rewriteUrls(s.css, imageMap),
    })),
  );
  const plan = planCloneFromSnapshot(snapshot, imageMap, sheetHrefMap);
  return applyImportPlanAsTemplate({
    siteId: site.id,
    plan,
    templateName: opts.name || snapshot.title,
  });
}

/** Re-run clone split onto an existing page (same template + page id). */
export async function reclonePageFromUrl(opts: {
  pageId: string;
  sourceUrl?: string;
  skipPreview?: boolean;
}) {
  const page = await prisma.page.findUnique({
    where: { id: opts.pageId },
    include: {
      site: { select: { id: true, slug: true } },
    },
  });
  if (!page) throw new Error("Page not found");
  if (!page.templateId) throw new Error("Page has no template");
  const sourceUrl =
    opts.sourceUrl ||
    (
      await prisma.siteSetting.findUnique({
        where: { siteId_key: { siteId: page.siteId, key: "importedFromUrl" } },
      })
    )?.value;
  if (!sourceUrl) throw new Error("No source URL stored for this site");

  const snapshot = await scrapePage(sourceUrl);
  const imageMap = await downloadImages(snapshot.images, {
    siteId: page.site.id,
    siteSlug: page.site.slug,
    referer: snapshot.finalUrl,
  });
  const sheetHrefMap = await persistLargeStylesheets(
    page.site.slug,
    (snapshot.cssSheets || []).map((s) => ({
      href: s.href,
      css: rewriteUrls(s.css, imageMap),
    })),
  );
  const plan = planCloneFromSnapshot(snapshot, imageMap, sheetHrefMap);
  const templateId = page.templateId;

  await prisma.$transaction(async (tx) => {
    await tx.pageBlock.deleteMany({ where: { pageId: page.id } });
    await tx.templateBlock.deleteMany({ where: { templateId } });
    await tx.template.update({
      where: { id: templateId },
      data: { coreHtml: plan.coreHtml },
    });
    for (let i = 0; i < plan.sections.length; i++) {
      const s = plan.sections[i];
      const tb = await tx.templateBlock.create({
        data: {
          templateId,
          name: s.name,
          defaultHtml: s.html,
          isRepeatable: /<repeatable\b/i.test(s.html),
          sortOrder: i,
        },
      });
      await tx.pageBlock.create({
        data: {
          pageId: page.id,
          templateBlockId: tb.id,
          content: serializeContent({
            fields: emptyFieldsFromTemplate(s.html),
            layoutHtml: s.html,
          }),
          sortOrder: i,
          repeatItems: {
            create: (s.repeatSeeds || []).map((seed, ri) => ({
              groupKey: seed.groupKey,
              sortOrder: ri,
              origin: "scraped",
              content: serializeContent({
                fields: seed.fields,
                labels: seed.labels,
              }),
            })),
          },
        },
      });
    }
  });

  if (!opts.skipPreview) {
    const tbs = await prisma.templateBlock.findMany({
      where: { templateId },
      select: { id: true },
    });
    for (const tb of tbs) scheduleSectionPreview(tb.id);
  }

  return {
    pageId: page.id,
    templateId,
    sectionCount: plan.sections.length,
    names: plan.sections.map((s) => s.name),
    sourceUrl,
  };
}

/** Re-run marker wrapping on an existing clone page (does not re-scrape). */
export async function refreshPageCloneMarkers(pageId: string) {
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    include: {
      blocks: {
        orderBy: { sortOrder: "asc" },
        include: { templateBlock: true },
      },
    },
  });
  if (!page) throw new Error("Page not found");
  const snap = await prisma.siteSetting.findUnique({
    where: { siteId_key: { siteId: page.siteId, key: "cloneSnapshot" } },
  });
  let builder = "unknown";
  try {
    const parsed = JSON.parse(snap?.value || "{}") as { builder?: string };
    if (parsed.builder) builder = parsed.builder;
  } catch {
    /* keep unknown */
  }

  const names: string[] = [];
  for (const block of page.blocks) {
    const tb = block.templateBlock;
    if (!tb) continue;
    const marked = wrapCloneMarkers(
      unwrapTextMarkers(unwrapRepeatableTags(tb.defaultHtml)),
      builder,
    );
    names.push(tb.name);
    await prisma.$transaction([
      prisma.templateBlock.update({
        where: { id: tb.id },
        data: {
          defaultHtml: marked,
          isRepeatable: /<repeatable\b/i.test(marked),
        },
      }),
      prisma.pageBlockRepeatItem.deleteMany({ where: { pageBlockId: block.id } }),
      prisma.pageBlock.update({
        where: { id: block.id },
        data: {
          content: serializeContent({
            fields: emptyFieldsFromTemplate(marked),
            layoutHtml: marked,
          }),
        },
      }),
    ]);
  }

  return { pageId, builder, sectionCount: names.length, names };
}
