/**
 * Disk paths that must survive deploys.
 *
 * Locally everything stays under the repo (`public/uploads`, `public/sites`).
 * On Railway, attach a volume (typically `/data`) and set DATA_DIR — or leave
 * DATA_DIR unset and we pick up RAILWAY_VOLUME_MOUNT_PATH automatically.
 */

import path from "path";

export function dataDir(): string | null {
  const raw = (process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || "").trim();
  return raw ? path.resolve(raw) : null;
}

export function uploadsRoot(): string {
  const data = dataDir();
  if (data) return path.join(data, "uploads");
  return path.join(process.cwd(), "public", "uploads");
}

export function generatedSitesRoot(): string {
  const data = dataDir();
  if (data) return path.join(data, "sites");
  return path.join(process.cwd(), "public", "sites");
}

export function generatedSiteAbsDir(site: { slug: string }): string {
  return path.join(generatedSitesRoot(), site.slug);
}

export function themeAbsDir(themeSlug: string): string {
  return path.join(process.cwd(), "public", "theme", themeSlug);
}
