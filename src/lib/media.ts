import path from "path";
import { mkdir, writeFile, unlink } from "fs/promises";
import { randomBytes } from "crypto";

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

export function uploadsRoot() {
  return path.join(process.cwd(), "public", "uploads");
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

