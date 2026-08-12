/**
 * Active website context for multi-site admin.
 * Cookie stores the selected site id so every admin screen focuses on one site.
 */

import { cookies } from "next/headers";
import { prisma } from "./db";

export const ACTIVE_SITE_COOKIE = "cms_active_site";

export type ActiveSite = {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  siteTitle: string;
  cssFramework: string;
  themeSlug: string;
  lastGeneratedAt: Date | null;
  isActive: boolean;
};

export function themePublicPath(site: { slug: string; themeSlug?: string | null }) {
  const t = (site.themeSlug || site.slug || "").trim() || site.slug;
  return `/theme/${t}`;
}

/** Static publish output: /sites/{slug}/index.html … */
export function generatedSitePath(site: { slug: string }) {
  return `/sites/${site.slug}`;
}

export function generatedSiteFsDir(site: { slug: string }) {
  return `public/sites/${site.slug}`;
}

export async function getActiveSiteId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(ACTIVE_SITE_COOKIE)?.value || null;
}

export async function setActiveSiteId(siteId: string) {
  const jar = await cookies();
  jar.set(ACTIVE_SITE_COOKIE, siteId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function getActiveSite(): Promise<ActiveSite | null> {
  const sites = await prisma.site.findMany({
    orderBy: { name: "asc" },
  });
  if (!sites.length) return null;

  const cookieId = await getActiveSiteId();
  const active =
    sites.find((s) => s.id === cookieId) ||
    sites.find((s) => s.slug === "kiekeboe") ||
    sites[0];

  return {
    id: active.id,
    name: active.name,
    slug: active.slug,
    domain: active.domain,
    siteTitle: active.siteTitle,
    cssFramework: active.cssFramework || "none",
    themeSlug: active.themeSlug || active.slug,
    lastGeneratedAt: active.lastGeneratedAt,
    isActive: active.isActive,
  };
}

export async function listSitesForSwitcher() {
  return prisma.site.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      cssFramework: true,
      lastGeneratedAt: true,
    },
  });
}

/**
 * Stylesheet hrefs for public/editor preview based on site framework + theme.
 * Framework is per-site: bootstrap, tailwind, none, or custom.
 */
export function siteStylesheetHrefs(site: {
  slug: string;
  themeSlug?: string | null;
  cssFramework?: string | null;
}): string[] {
  const theme = themePublicPath(site);
  const fw = (site.cssFramework || "none").toLowerCase();
  const hrefs: string[] = [];

  if (fw === "bootstrap") {
    hrefs.push(`${theme}/css/bootstrap.min.css`);
    hrefs.push(`${theme}/css/font-awesome.min.css`);
  } else if (fw === "tailwind") {
    // Tailwind via CDN for generated/preview (admin already has Tailwind)
    hrefs.push("https://cdn.tailwindcss.com");
  }

  // Site-specific compiled CSS (always, if present as convention)
  hrefs.push(`${theme}/css/kiekeboe.css`); // legacy name; also try style.css
  hrefs.push(`${theme}/css/style.css`);

  // Unique + keep order
  return [...new Set(hrefs)];
}
