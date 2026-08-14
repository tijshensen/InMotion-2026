import path from "path";
import { mkdir, writeFile, unlink } from "fs/promises";
import { randomBytes } from "crypto";
import { uploadsRoot } from "./paths";

export { uploadsRoot };

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB
/** @deprecated use MAX_IMAGE_BYTES / MAX_VIDEO_BYTES */
export const MAX_UPLOAD_BYTES = MAX_IMAGE_BYTES;

export const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

export const ALLOWED_VIDEO_MIME = new Set(["video/mp4", "video/quicktime"]);

export const ALLOWED_MIME = new Set([
  ...ALLOWED_IMAGE_MIME,
  ...ALLOWED_VIDEO_MIME,
]);

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "video/mp4": ".mp4",
  "video/quicktime": ".mp4",
};

export function isImageMime(mime: string) {
  return ALLOWED_IMAGE_MIME.has(mime) || mime.startsWith("image/");
}

export function isVideoMime(mime: string) {
  return ALLOWED_VIDEO_MIME.has(mime) || mime.startsWith("video/");
}

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

function guessMimeFromName(filename: string, reported: string): string {
  if (reported && reported !== "application/octet-stream") return reported;
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".mp4" || ext === ".m4v") return "video/mp4";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".svg") return "image/svg+xml";
  return reported || "application/octet-stream";
}

export async function saveUploadedMedia(opts: {
  siteSlug: string;
  file: File;
}): Promise<{
  filename: string;
  path: string;
  mimeType: string;
  sizeBytes: number;
  posterPath: string;
}> {
  const mimeType = guessMimeFromName(opts.file.name, opts.file.type);
  if (!ALLOWED_MIME.has(mimeType)) {
    throw new Error(
      "Only JPEG, PNG, GIF, WebP, SVG images and MP4 video are allowed",
    );
  }
  const video = isVideoMime(mimeType);
  const max = video ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (opts.file.size > max) {
    throw new Error(
      video
        ? "Video is too large (max 50 MB)"
        : "File is too large (max 5 MB)",
    );
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
  const publicPath = publicUrlFor(relative);
  let posterPath = "";
  if (video) {
    posterPath = (await tryGenerateVideoPoster(publicPath)) || "";
  }
  return {
    filename: opts.file.name,
    path: publicPath,
    mimeType: video ? "video/mp4" : mimeType,
    sizeBytes: opts.file.size,
    posterPath,
  };
}

/** @deprecated use saveUploadedMedia */
export async function saveUploadedImage(opts: {
  siteSlug: string;
  file: File;
}) {
  return saveUploadedMedia(opts);
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

let ffmpegAvailable: boolean | null = null;

async function hasFfmpeg(): Promise<boolean> {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  try {
    const { execFile } = await import("child_process");
    const { promisify } = await import("util");
    const execFileAsync = promisify(execFile);
    await execFileAsync("ffmpeg", ["-version"], { timeout: 4000 });
    ffmpegAvailable = true;
  } catch {
    ffmpegAvailable = false;
  }
  return ffmpegAvailable;
}

/**
 * Grab a still from an uploaded MP4 when system ffmpeg is installed.
 * Returns a public /uploads/… jpg path, or null if ffmpeg is missing.
 */
export async function tryGenerateVideoPoster(
  publicVideoPath: string,
): Promise<string | null> {
  if (!publicVideoPath.startsWith("/uploads/")) return null;
  if (!(await hasFfmpeg())) return null;

  const abs = absolutePathFromPublicUrl(publicVideoPath);
  const root = uploadsRoot();
  if (!abs.startsWith(root)) return null;

  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const execFileAsync = promisify(execFile);

  const ext = path.extname(abs);
  const posterAbs = abs.slice(0, -ext.length || abs.length) + "-poster.jpg";
  try {
    await execFileAsync(
      "ffmpeg",
      ["-y", "-ss", "0.5", "-i", abs, "-frames:v", "1", "-q:v", "3", posterAbs],
      { timeout: 20000 },
    );
    const rel = path.relative(root, posterAbs).replace(/\\/g, "/");
    return publicUrlFor(rel);
  } catch {
    return null;
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

