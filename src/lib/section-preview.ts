/**
 * Background section-layout thumbnails.
 * Never run this on editor load — only after a layout is saved, or via backfill.
 */

import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { prisma } from "./db";
import { uploadsRoot } from "./paths";
import { siteStylesheetHrefs } from "./site-context";
import { publicUrlFor } from "./media";

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

function rewriteLocalUrls(html: string) {
  const publicRoot = path.join(process.cwd(), "public");
  return html.replace(
    /(src|href)=(["'])\/(theme|uploads)\/([^"']+)\2/gi,
    (_m, attr: string, q: string, folder: string, rest: string) => {
      const abs =
        folder === "uploads"
          ? path.join(uploadsRoot(), rest)
          : path.join(publicRoot, folder, rest);
      return `${attr}=${q}${fileHref(abs)}${q}`;
    },
  );
}

function buildPreviewHtml(
  sectionHtml: string,
  cssHrefs: string[],
): string {
  const publicRoot = path.join(process.cwd(), "public");
  const links = cssHrefs
    .map((href) => {
      if (href.startsWith("http")) {
        return `<link rel="stylesheet" href="${href}">`;
      }
      const rel = href.replace(/^\//, "");
      const abs = path.join(publicRoot, rel);
      if (!fs.existsSync(abs)) return "";
      return `<link rel="stylesheet" href="${fileHref(abs)}">`;
    })
    .filter(Boolean)
    .join("\n");

  const body = rewriteLocalUrls(sectionHtml);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${VIEWPORT_W}">
<style>
  html, body { margin: 0; padding: 0; background: #fff; }
  .cms-preview-root { width: ${VIEWPORT_W}px; overflow: hidden; }
</style>
${links}
</head>
<body>
<div class="cms-preview-root">${body}</div>
</body>
</html>`;
}

export async function generateSectionPreview(blockId: string): Promise<string | null> {
  const block = await prisma.templateBlock.findUnique({
    where: { id: blockId },
    include: {
      template: {
        include: {
          templateSet: { include: { site: true } },
        },
      },
    },
  });
  if (!block?.defaultHtml.trim()) return null;

  const site = block.template.templateSet.site;
  const hrefs = siteStylesheetHrefs(site);
  const html = buildPreviewHtml(block.defaultHtml, hrefs);

  const dir = thumbsDir();
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `${block.id}.jpg`;
  const absOut = path.join(dir, fileName);
  const tmpPng = path.join(dir, `${block.id}.tmp.png`);

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: VIEWPORT_W, height: CLIP_MAX_H, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "load", timeout: 20_000 });
    const el = await page.$(".cms-preview-root");
    const box = el ? await el.boundingBox() : null;
    const height = Math.max(
      80,
      Math.min(CLIP_MAX_H, Math.ceil(box?.height || CLIP_MAX_H)),
    );
    await page.screenshot({
      path: tmpPng,
      type: "png",
      clip: { x: 0, y: 0, width: VIEWPORT_W, height },
    });

    const sharp = (await import("sharp")).default;
    await sharp(tmpPng)
      .resize({ width: OUT_W, withoutEnlargement: true })
      .jpeg({ quality: 72, mozjpeg: true })
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
