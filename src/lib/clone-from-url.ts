import { prisma } from "./db";
import { createSiteForOrg } from "./sites";
import { saveMediaBuffer } from "./media";
import { scrapePage, scrapeBrowserUa, type PageSnapshot, type ScrapedImage } from "./scrape-page";
import {
  applyImportPlan,
  applyImportPlanAsTemplate,
  type ImportPlan,
} from "./import-from-url";

function blockByTag(html: string, tag: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "i");
  const m = html.match(re);
  return m ? m[0] : null;
}

function innerByTag(html: string, tag: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = html.match(re);
  return m?.[1] || null;
}

function innerByIdOrClass(html: string, idOrClass: string): string | null {
  const re = new RegExp(
    `<([a-z0-9]+)\\b[^>]*(?:id|class)=["'][^"']*${idOrClass}[^"']*["'][^>]*>`,
    "i",
  );
  const open = html.match(re);
  if (!open || open.index == null) return null;
  const tag = open[1];
  const start = open.index;
  const after = html.slice(start);
  const close = after.search(new RegExp(`<\\/${tag}>`, "i"));
  if (close < 0) return after.slice(0, Math.min(after.length, 80_000));
  return after.slice(0, close + tag.length + 3);
}

function bodyInner(html: string) {
  const m = html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i);
  return m?.[1] || html;
}

function headingName(html: string, fallback: string) {
  const m = html.match(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i);
  const text = (m?.[1] || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return text || fallback;
}

function wrapCloneSection(html: string): string {
  let imgN = 0;
  let s = html.replace(/<img\b([^>]*?)\/?>/gi, (full, attrs: string) => {
    if (/\beditable\s*=/i.test(attrs)) return full;
    imgN += 1;
    const trimmed = String(attrs || "").replace(/\/\s*$/, "");
    return `<img editable="true" name="Image ${imgN}"${trimmed} />`;
  });
  let hN = 0;
  s = s.replace(
    /<(h[1-3])\b([^>]*)>([\s\S]*?)<\/\1>/gi,
    (full, tag: string, attrs: string, inner: string) => {
      if (/<singleline\b/i.test(inner)) return full;
      const text = inner.replace(/<[^>]+>/g, "").trim();
      if (text.length < 2) return full;
      hN += 1;
      return `<${tag}${attrs}><singleline name="Heading ${hN}">${inner}</singleline></${tag}>`;
    },
  );
  return s;
}

function splitContent(content: string): { name: string; html: string }[] {
  const trimmed = content.trim();
  if (!trimmed) return [{ name: "Content", html: "<p></p>" }];

  let chunks: string[] = [];
  if ((trimmed.match(/<section\b/gi) || []).length >= 2) {
    chunks = trimmed.split(/(?=<section\b)/i).map((c) => c.trim()).filter(Boolean);
  } else if ((trimmed.match(/<h2\b/gi) || []).length >= 2) {
    const parts = trimmed.split(/(?=<h2\b)/i);
    const lead = parts[0]?.trim() || "";
    const rest = parts.slice(1);
    chunks = lead && !/^<h2\b/i.test(lead) ? [lead, ...rest] : rest;
  } else {
    chunks = [trimmed];
  }

  if (chunks.length > 12) {
    const head = chunks.slice(0, 11);
    const tail = chunks.slice(11).join("\n");
    chunks = [...head, tail];
  }

  return chunks
    .map((html, i) => ({
      name: headingName(html, i === 0 ? "Hero" : `Section ${i + 1}`),
      html: wrapCloneSection(html),
    }))
    .filter((s) => s.html.replace(/<[^>]+>/g, "").trim().length > 8 || /<img\b/i.test(s.html));
}

function buildCoreHtml(snapshot: PageSnapshot, header: string, footer: string): string {
  const headMatch = snapshot.html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  let headInner = headMatch?.[1] || "";
  headInner = headInner.replace(/<title[^>]*>[\s\S]*?<\/title>/i, "<title>{{page.title}}</title>");
  if (!/<title/i.test(headInner)) {
    headInner = `<title>{{page.title}}</title>\n${headInner}`;
  }
  const clonedCss = snapshot.css
    ? `<style data-cms-cloned-css="1">\n${snapshot.css}\n</style>`
    : "";
  return `<!DOCTYPE html>
<html lang="en" data-cms-clone="1" data-cms-builder="${snapshot.builder}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${headInner}
${clonedCss}
</head>
<body>
${header}
{{sections}}
${footer}
</body>
</html>`;
}

function splitShell(snapshot: PageSnapshot): {
  header: string;
  footer: string;
  content: string;
} {
  const body = bodyInner(snapshot.html);
  const header =
    blockByTag(body, "header") ||
    innerByIdOrClass(body, "masthead") ||
    innerByIdOrClass(body, "site-header") ||
    innerByIdOrClass(body, "navbar") ||
    "";
  const footer =
    blockByTag(body, "footer") ||
    innerByIdOrClass(body, "colophon") ||
    innerByIdOrClass(body, "site-footer") ||
    "";
  let content =
    innerByTag(body, "main") ||
    innerByIdOrClass(body, "site-content") ||
    innerByIdOrClass(body, "content") ||
    innerByIdOrClass(body, "primary") ||
    body;
  if (header) content = content.replace(header, "");
  if (footer) content = content.replace(footer, "");
  return { header, footer, content };
}

async function downloadImages(
  images: ScrapedImage[],
  opts: { siteId: string; siteSlug: string; referer: string },
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const queue = images.slice(0, 30);
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
  const { header, footer, content } = splitShell(snapped);
  const sections = splitContent(rewriteUrls(content, imageMap));
  const coreHtml = buildCoreHtml(
    snapped,
    rewriteUrls(header, imageMap),
    rewriteUrls(footer, imageMap),
  );
  return {
    siteTitle: snapshot.title,
    coreHtml,
    menuHtml: "",
    submenuHtml: "",
    sections,
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
