/**
 * Background section-layout thumbnails.
 * Never run this on editor load — only after a layout is saved, or via backfill.
 */

import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { prisma } from "./db";
import { uploadsRoot } from "./paths";
import { ensureSiteStylesheets } from "./site-context";
import { publicUrlFor } from "./media";
import {
  isFullThemeShell,
  renderBootstrapMenuHtml,
  rewriteThemeAssetUrls,
} from "./theme";
import { renderMenuHtml, type MenuPage } from "./menu";
import {
  menuTokenWantsBareItems,
  renderMenuFromSnippets,
  resolveMenuSnippets,
} from "./menu-snippets";
import { normalizeInsertHtml } from "./insert-html";
import { renderSectionHtml } from "./sections";
import { replaceLiteral } from "./html-split";

const VIEWPORT_W = 1200;
const CLIP_MAX_H = 640;
const OUT_W = 640;

let browserPromise: Promise<import("puppeteer").Browser> | null = null;
let queue: Promise<void> = Promise.resolve();

function thumbsDir() {
  return path.join(uploadsRoot(), "_thumbs", "sections");
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = (async () => {
      const puppeteer = await import("puppeteer");
      return puppeteer.default.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
      });
    })();
  }
  return browserPromise;
}

function fileHref(abs: string) {
  return pathToFileURL(abs).href;
}

function placeholderSvg(w: number, h: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect fill="#e4e4e7" width="100%" height="100%"/><rect fill="#d4d4d8" x="${w * 0.15}" y="${h * 0.2}" width="${w * 0.7}" height="${h * 0.6}" rx="8"/><text x="50%" y="50%" fill="#71717a" text-anchor="middle" dy=".35em" font-family="Arial,sans-serif" font-size="${Math.max(14, Math.round(w / 18))}">${w}×${h}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function wrapSectionForPreview(html: string) {
  const t = html.trim();
  if (/^<div[^>]*class="[^"]*\bcol-(?:xs|sm|md|lg)-\d+/i.test(t)) {
    return `<div class="container"><div class="row">${html}</div></div>`;
  }
  return html;
}

function sizeFromImgTag(tag: string): { w: number; h: number } {
  const size = tag.match(/size=["'](\d+)\s*\/\s*(\d+)/i);
  if (size) return { w: Number(size[1]) || 270, h: Number(size[2]) || 200 };
  const w = Number(tag.match(/\bwidth=["'](\d+)/i)?.[1] || 0);
  const h = Number(tag.match(/\bheight=["'](\d+)/i)?.[1] || 0);
  return { w: w || 270, h: h || 200 };
}

function rewritePreviewAssets(html: string) {
  let s = html.replace(
    /https?:\/\/(?:www\.)?placehold\.it\/(\d+)x(\d+)/gi,
    (_m, w: string, h: string) => placeholderSvg(Number(w) || 400, Number(h) || 300),
  );
  s = s.replace(
    /https?:\/\/(?:via\.)?placeholder\.com\/(\d+)x(\d+)/gi,
    (_m, w: string, h: string) => placeholderSvg(Number(w) || 400, Number(h) || 300),
  );
  // Remote CMS images often 404 from this machine — keep the box so the layout is visible
  s = s.replace(/<img\b[^>]*>/gi, (tag) => {
    if (!/src=["']https?:\/\//i.test(tag)) return tag;
    if (/placehold|placeholder\.com|data:/i.test(tag)) return tag;
    const { w, h } = sizeFromImgTag(tag);
    return tag.replace(/src=["'][^"']+["']/, `src="${placeholderSvg(w, h)}"`);
  });
  s = s.replace(
    /(src|href)=(["'])\/(theme|uploads)\/([^"']+)\2/gi,
    (_m, attr: string, q: string, folder: string, rest: string) => {
      const publicRoot = path.join(process.cwd(), "public");
      const abs =
        folder === "uploads"
          ? path.join(uploadsRoot(), rest)
          : path.join(publicRoot, folder, rest);
      return `${attr}=${q}${fileHref(abs)}${q}`;
    },
  );
  return s;
}

function rewriteCssUrls(css: string, cssDir: string) {
  return css.replace(/url\((['"]?)([^'")]+)\1\)/g, (full, _q: string, url: string) => {
    if (/^(data:|https?:|file:)/i.test(url)) return full;
    const abs = path.resolve(cssDir, url.split("?")[0] || url);
    if (!fs.existsSync(abs)) return full;
    return `url("${fileHref(abs)}")`;
  });
}

function inlineLocalStylesheets(html: string) {
  const publicRoot = path.join(process.cwd(), "public");
  return html.replace(
    /<link[^>]+rel=["']stylesheet["'][^>]*>/gi,
    (tag) => {
      const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
      if (!href || href.startsWith("http") || href.startsWith("data:")) return tag;
      const abs = href.startsWith("file:")
        ? new URL(href).pathname
        : path.join(publicRoot, href.replace(/^\//, ""));
      if (!fs.existsSync(abs)) return tag;
      const css = rewriteCssUrls(fs.readFileSync(abs, "utf8"), path.dirname(abs));
      return `<style>${css}</style>`;
    },
  );
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fillShell(opts: {
  coreHtml: string;
  sectionHtml: string;
  blockName: string;
  site: {
    name: string;
    slug: string;
    siteTitle: string;
    themeSlug: string | null;
    cssFramework: string | null;
    inserts: { tag: string; content: string }[];
  };
  menuHtml: string;
}): string {
  const themeSlug = opts.site.themeSlug || opts.site.slug;
  let html = (opts.coreHtml || "").trim();
  if (!html.includes("{{sections}}")) {
    html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>{{sections}}</body></html>`;
  }

  html = rewriteThemeAssetUrls(html, themeSlug);
  html = ensureSiteStylesheets(html, opts.site);

  const marked = `<div id="cms-preview-section">${wrapSectionForPreview(opts.sectionHtml)}</div>`;
  html = replaceLiteral(html, "{{sections}}", marked);
  html = replaceLiteral(html, "{{page.title}}", escapeHtml(opts.blockName));
  html = replaceLiteral(html, "{{page.metaDescription}}", "");
  html = replaceLiteral(
    html,
    "{{site.title}}",
    escapeHtml(opts.site.siteTitle || opts.site.name),
  );
  html = replaceLiteral(html, "{{site.slug}}", escapeHtml(opts.site.slug));
  html = replaceLiteral(html, "{{menu}}", opts.menuHtml);
  html = replaceLiteral(html, "{{submenu}}", "");
  html = html.replace(/\{\{block:[a-zA-Z0-9_-]+\}\}/g, "");

  const resolveInsert = (tag: string) => {
    const insert =
      opts.site.inserts.find((i) => i.tag === tag) ||
      opts.site.inserts.find((i) => i.tag === `[${tag}]`) ||
      opts.site.inserts.find((i) => i.tag === tag.replace(/^\[|\]$/g, ""));
    if (!insert) return "";
    return rewriteThemeAssetUrls(
      normalizeInsertHtml(insert.content),
      themeSlug,
    );
  };
  html = html.replace(
    /\{\{insert:([a-zA-Z0-9_\[\]-]+)\}\}/g,
    (_m, tag: string) => resolveInsert(tag),
  );
  html = html.replace(/\[([A-Z][A-Z0-9_]*)\]/g, (_m, tag: string) =>
    resolveInsert(`[${tag}]`) || resolveInsert(tag) || "",
  );

  html = rewritePreviewAssets(html);
  html = inlineLocalStylesheets(html);
  return html;
}

export async function generateSectionPreview(blockId: string): Promise<string | null> {
  const block = await prisma.templateBlock.findUnique({
    where: { id: blockId },
    include: {
      template: {
        include: {
          templateSet: {
            include: {
              site: { include: { inserts: true, pages: true } },
            },
          },
        },
      },
    },
  });
  if (!block?.defaultHtml.trim()) return null;

  const site = block.template.templateSet.site;
  const menuPages = site.pages.map((p) => ({
    id: p.id,
    title: p.title,
    menuTitle: p.menuTitle,
    slug: p.slug,
    parentId: p.parentId,
    sortOrder: p.sortOrder,
    isDefault: p.isDefault,
    isHidden: p.isHidden,
    inMenu: p.inMenu,
  })) as MenuPage[];
  const shell = block.template.coreHtml || "";
  const snippets = resolveMenuSnippets({
    template: block.template,
    templateSet: block.template.templateSet,
  });
  const menuHtml =
    renderMenuFromSnippets(snippets, site.slug, menuPages, null, {
      bareItems: menuTokenWantsBareItems(shell),
    }) ||
    (isFullThemeShell(shell)
      ? renderBootstrapMenuHtml(site.slug, menuPages)
      : renderMenuHtml(site.slug, menuPages));

  const html = fillShell({
    coreHtml: shell,
    sectionHtml: renderSectionHtml(block.defaultHtml, ""),
    blockName: block.name,
    site,
    menuHtml,
  });

  const dir = thumbsDir();
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `${block.id}.jpg`;
  const absOut = path.join(dir, fileName);
  const tmpPng = path.join(dir, `${block.id}.tmp.png`);

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({
      width: VIEWPORT_W,
      height: 2400,
      deviceScaleFactor: 1,
    });
    await page.setContent(html, { waitUntil: "load", timeout: 25_000 });
    await page.evaluate(async () => {
      const imgs = Array.from(document.images);
      await Promise.all(
        imgs.map(
          (img) =>
            img.complete ||
            new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            }),
        ),
      );
    });
    await new Promise((r) => setTimeout(r, 150));
    const el = await page.$("#cms-preview-section");
    const box = el ? await el.boundingBox() : null;
    if (el && box && box.height >= 8) {
      await el.screenshot({ path: tmpPng, type: "png" });
    } else {
      await page.screenshot({
        path: tmpPng,
        type: "png",
        clip: { x: 0, y: 0, width: VIEWPORT_W, height: CLIP_MAX_H },
      });
    }

    const sharp = (await import("sharp")).default;
    await sharp(tmpPng)
      .resize({ width: OUT_W, withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toFile(absOut);
    try {
      fs.unlinkSync(tmpPng);
    } catch {
      /* ignore */
    }
  } finally {
    await page.close();
  }

  const publicPath = publicUrlFor(`_thumbs/sections/${fileName}`);
  await prisma.templateBlock.update({
    where: { id: block.id },
    data: { previewPath: publicPath },
  });
  return publicPath;
}

/** Queue a preview so saves stay fast and we only run one Chrome job at a time. */
export async function closePreviewBrowser() {
  if (!browserPromise) return;
  try {
    const browser = await browserPromise;
    await browser.close();
  } catch {
    /* ignore */
  }
  browserPromise = null;
}

export function scheduleSectionPreview(blockId: string) {
  queue = queue
    .then(async () => {
      try {
        await generateSectionPreview(blockId);
      } catch (e) {
        console.error("[section-preview]", blockId, e);
      }
    })
    .catch(() => {
      /* keep the queue alive */
    });
}
