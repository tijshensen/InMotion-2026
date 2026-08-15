/**
 * Download remote images from an import and store them as site media.
 */

import { prisma } from "./db";
import { saveBufferAsMedia } from "./media";

export type ImageIngestCtx = {
  siteId: string;
  siteSlug: string;
  sourceOrigin?: string;
  cache?: Map<string, string>;
};

function decodeAmp(url: string) {
  return url.replace(/&amp;/g, "&");
}

export function resolveImportImageUrl(
  src: string,
  sourceOrigin?: string,
): string | null {
  const raw = decodeAmp((src || "").trim());
  if (!raw || /^data:|^blob:|^javascript:/i.test(raw)) return null;
  if (raw.startsWith("/uploads/")) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (!sourceOrigin) return null;
  try {
    return new URL(raw, sourceOrigin).href;
  } catch {
    return null;
  }
}

function filenameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const base = u.pathname.split("/").pop() || "image";
    return base.split("?")[0] || "image";
  } catch {
    return "image";
  }
}

function mimeFromResponse(
  contentType: string | null,
  url: string,
  buf: Buffer,
): string {
  const ct = (contentType || "").split(";")[0].trim().toLowerCase();
  if (ct.startsWith("image/") || ct === "video/mp4") return ct;
  const ext = filenameFromUrl(url).toLowerCase();
  if (ext.endsWith(".svg")) return "image/svg+xml";
  if (ext.endsWith(".png")) return "image/png";
  if (ext.endsWith(".webp")) return "image/webp";
  if (ext.endsWith(".gif")) return "image/gif";
  if (ext.endsWith(".jpg") || ext.endsWith(".jpeg")) return "image/jpeg";
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buf.slice(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (buf.slice(0, 6).toString("ascii") === "GIF87a" || buf.slice(0, 6).toString("ascii") === "GIF89a") {
    return "image/gif";
  }
  if (buf.slice(0, 4).toString("ascii") === "<svg" || buf.includes(Buffer.from("<svg"))) {
    return "image/svg+xml";
  }
  return ct || "application/octet-stream";
}

export async function ingestRemoteImage(
  ctx: ImageIngestCtx,
  src: string,
): Promise<string | null> {
  const abs = resolveImportImageUrl(src, ctx.sourceOrigin);
  if (!abs) return null;
  if (abs.startsWith("/uploads/")) return abs;
  const cache = ctx.cache || (ctx.cache = new Map());
  const hit = cache.get(abs);
  if (hit) return hit;

  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 15_000);
    const res = await fetch(abs, {
      redirect: "follow",
      signal: ac.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; CMSinMotionBot/1.0; +https://cmsinmotion.local)",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        ...(ctx.sourceOrigin ? { Referer: ctx.sourceOrigin } : {}),
      },
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 80 || buf.length > 5 * 1024 * 1024) return null;
    const mime = mimeFromResponse(res.headers.get("content-type"), abs, buf);
    if (!mime.startsWith("image/")) return null;

    const saved = await saveBufferAsMedia({
      siteSlug: ctx.siteSlug,
      buffer: buf,
      filename: filenameFromUrl(abs),
      mimeType: mime,
    });
    await prisma.mediaAsset.create({
      data: {
        siteId: ctx.siteId,
        filename: saved.filename,
        path: saved.path,
        mimeType: saved.mimeType,
        sizeBytes: saved.sizeBytes,
        alt: "",
        posterPath: saved.posterPath || "",
      },
    });
    cache.set(abs, saved.path);
    return saved.path;
  } catch {
    return null;
  }
}

export async function localizeHtmlImages(
  html: string,
  ctx: ImageIngestCtx,
): Promise<string> {
  if (!html) return html;
  const re = /<img\b[^>]*>/gi;
  const tags = html.match(re) || [];
  let out = html;
  for (const tag of tags) {
    const src = tag.match(/\bsrc\s*=\s*["']([^"']*)["']/i)?.[1] || "";
    const local = await ingestRemoteImage(ctx, src);
    if (!local || local === src) continue;
    const next = /\bsrc\s*=\s*["'][^"']*["']/i.test(tag)
      ? tag.replace(/\bsrc\s*=\s*["'][^"']*["']/i, `src="${local}"`)
      : tag.replace(/<img/i, `<img src="${local}"`);
    out = out.replace(tag, next);
  }
  return out;
}

export async function localizeFieldImages(
  fields: Record<string, string>,
  ctx: ImageIngestCtx,
): Promise<Record<string, string>> {
  const out = { ...fields };
  for (const [k, v] of Object.entries(fields)) {
    if (!v || v.startsWith("/uploads/")) continue;
    const looksUrl =
      /^https?:\/\//i.test(v) ||
      (v.startsWith("/") && !v.startsWith("/uploads/"));
    if (!looksUrl) continue;
    const local = await ingestRemoteImage(ctx, v);
    if (local) out[k] = local;
  }
  return out;
}
