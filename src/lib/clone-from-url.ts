import { prisma } from "./db";
import { createSiteForOrg } from "./sites";
import { saveMediaBuffer } from "./media";
import { scrapePage, scrapeBrowserUa, type PageSnapshot, type ScrapedImage } from "./scrape-page";
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
  wrapCloneMarkers,
} from "./clone-bands";
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

function buildCoreHtml(snapshot: PageSnapshot): string {
  const headMatch = snapshot.html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  let headInner = headMatch?.[1] || "";
  headInner = headInner.replace(/<title[^>]*>[\s\S]*?<\/title>/i, "<title>{{page.title}}</title>");
  if (!/<title/i.test(headInner)) {
    headInner = `<title>{{page.title}}</title>\n${headInner}`;
  }
  const clonedCss = snapshot.css
    ? `<style data-cms-cloned-css="1">\n${snapshot.css}\n</style>`
    : "";
  const lang = (snapshot.htmlLang || "en").replace(/[^a-zA-Z0-9-]/g, "") || "en";
  const bodyClass = (snapshot.bodyClass || "cms-clone").replace(/[^a-zA-Z0-9 _-]/g, "");
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
<body class="${bodyClass}">
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
): ImportPlan {
  const html = rewriteUrls(snapshot.html, imageMap);
  const css = rewriteUrls(snapshot.css, imageMap);
  const snapped = { ...snapshot, html, css };
  const { header, footer, content, afterContent } = splitShell(snapped);
  const sections = splitContent(rewriteUrls(content, imageMap), snapshot.builder);
  const coreHtml = buildCoreHtml(snapped);
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
    creatorUserId: opts.creatorUserId,
  });
  const language = site.languages[0];
  if (!language) throw new Error("Site language missing");

  const imageMap = await downloadImages(snapshot.images, {
    siteId: site.id,
    siteSlug: site.slug,
    referer: snapshot.finalUrl,
  });
  const plan = planCloneFromSnapshot(snapshot, imageMap);
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
  const plan = planCloneFromSnapshot(snapshot, imageMap);
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
  const plan = planCloneFromSnapshot(snapshot, imageMap);
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
