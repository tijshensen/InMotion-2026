import path from "path";
import { mkdir, writeFile, unlink } from "fs/promises";
import { randomBytes } from "crypto";
import { uploadsRoot } from "./paths";

export { uploadsRoot };

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

export const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
};

export function publicUrlFor(relativePath: string) {
  // relativePath is like "demo/abc.jpg" or already "/uploads/..."
  if (relativePath.startsWith("/uploads/")) return relativePath;
  return `/uploads/${relativePath.replace(/^\/+/, "")}`;
}

export function absolutePathFromPublicUrl(publicPath: string) {
  const clean = publicPath.replace(/^\/uploads\//, "").replace(/^\/+/, "");
  return path.join(uploadsRoot(), clean);
}

function safeSiteSlug(slug: string) {
  return slug.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "site";
}

function originalBasename(filename: string) {
  const base = path.basename(filename).replace(/[^a-zA-Z0-9._-]+/g, "-");
  return base.slice(0, 80) || "file";
}

export async function saveUploadedImage(opts: {
  siteSlug: string;
  file: File;
}): Promise<{
  filename: string;
  path: string;
  mimeType: string;
  sizeBytes: number;
}> {
  const mimeType = opts.file.type || "application/octet-stream";
  if (!ALLOWED_MIME.has(mimeType)) {
    throw new Error("Only JPEG, PNG, GIF, WebP, and SVG images are allowed");
  }
  if (opts.file.size > MAX_UPLOAD_BYTES) {
    throw new Error("File is too large (max 5 MB)");
  }

  const ext = EXT_BY_MIME[mimeType] || path.extname(opts.file.name) || ".bin";
  const id = randomBytes(8).toString("hex");
  const original = originalBasename(opts.file.name);
  const storedName = `${id}-${original.replace(/\.[^.]+$/, "")}${ext}`;
  const siteDir = safeSiteSlug(opts.siteSlug);
  const dir = path.join(uploadsRoot(), siteDir);
  await mkdir(dir, { recursive: true });

  const buffer = Buffer.from(await opts.file.arrayBuffer());
  const diskPath = path.join(dir, storedName);
  await writeFile(diskPath, buffer);

  const relative = `${siteDir}/${storedName}`;
  return {
    filename: opts.file.name,
    path: publicUrlFor(relative),
    mimeType,
    sizeBytes: opts.file.size,
  };
}

export async function deleteUploadedFile(publicPath: string) {
  if (!publicPath.startsWith("/uploads/")) return;
  const abs = absolutePathFromPublicUrl(publicPath);
  // prevent path traversal
  const root = uploadsRoot();
  if (!abs.startsWith(root)) return;
  try {
    await unlink(abs);
  } catch {
    // file may already be gone
  }
}

/** Crop region in natural (source) image pixels. */
export type CropRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * Crop a source upload to `crop` then resize to target dimensions.
 * Matches MotionCMS cropimage.ajax.php: extract region + resample to size.
 * Writes a new file (does not overwrite the original).
 */
export async function cropAndResizeImage(opts: {
  siteSlug: string;
  sourcePublicPath: string;
  crop: CropRect;
  targetWidth: number;
  targetHeight: number;
  originalFilename?: string;
}): Promise<{
  filename: string;
  path: string;
  mimeType: string;
  sizeBytes: number;
}> {
  const targetWidth = Math.round(opts.targetWidth);
  const targetHeight = Math.round(opts.targetHeight);
  if (
    !Number.isFinite(targetWidth) ||
    !Number.isFinite(targetHeight) ||
    targetWidth < 1 ||
    targetHeight < 1 ||
    targetWidth > 4000 ||
    targetHeight > 4000
  ) {
    throw new Error("Invalid target dimensions (1–4000 px)");
  }

  const left = Math.max(0, Math.round(opts.crop.left));
  const top = Math.max(0, Math.round(opts.crop.top));
  const width = Math.max(1, Math.round(opts.crop.width));
  const height = Math.max(1, Math.round(opts.crop.height));

  if (!opts.sourcePublicPath.startsWith("/uploads/")) {
    throw new Error("Can only crop uploaded media");
  }

  const abs = absolutePathFromPublicUrl(opts.sourcePublicPath);
  const root = uploadsRoot();
  if (!abs.startsWith(root)) {
    throw new Error("Invalid source path");
  }

  // Dynamic import keeps sharp out of edge bundles that never crop
  const sharp = (await import("sharp")).default;

  const meta = await sharp(abs).metadata();
  const srcW = meta.width || 0;
  const srcH = meta.height || 0;
  if (!srcW || !srcH) {
    throw new Error("Could not read image dimensions");
  }
  if (meta.format === "svg") {
    throw new Error("SVG images cannot be cropped; use as-is");
  }

  // Clamp crop to image bounds
  const cropLeft = Math.min(left, srcW - 1);
  const cropTop = Math.min(top, srcH - 1);
  const cropW = Math.min(width, srcW - cropLeft);
  const cropH = Math.min(height, srcH - cropTop);
  if (cropW < 1 || cropH < 1) {
    throw new Error("Crop region is outside the image");
  }

  const siteDir = safeSiteSlug(opts.siteSlug);
  const dir = path.join(uploadsRoot(), siteDir);
  await mkdir(dir, { recursive: true });

  const id = randomBytes(8).toString("hex");
  // Keep crop filenames simple (no multi-dot originals) for reliable URLs
  const storedName = `c${id}-${targetWidth}x${targetHeight}.jpg`;
  const diskPath = path.join(dir, storedName);

  const buffer = await sharp(abs)
    .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
    .resize(targetWidth, targetHeight, {
      fit: "fill",
      withoutEnlargement: false,
    })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();

  await writeFile(diskPath, buffer);

  const relative = `${siteDir}/${storedName}`;
  return {
    filename: storedName,
    path: publicUrlFor(relative),
    mimeType: "image/jpeg",
    sizeBytes: buffer.length,
  };
}

/** Parse "340" or "340/250" style size hints into integers. */
export function parseDimension(value?: string | number | null): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : parseInt(String(value).trim(), 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

