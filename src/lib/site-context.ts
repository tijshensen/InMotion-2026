/**
 * Active website context for multi-site admin.
 * Cookie stores the selected site id so every admin screen focuses on one site.
 * Site lists are filtered by the current user's access (org owner / membership).
 */

import { cookies } from "next/headers";
import { getSessionUser } from "./auth";
import { listAccessibleSites } from "./access";
import { generatedSiteAbsDir } from "./paths";

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
  organizationId: string | null;
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
  return generatedSiteAbsDir(site);
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

function toActiveSite(active: {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  siteTitle: string;
  cssFramework: string;
  themeSlug: string;
  lastGeneratedAt: Date | null;
  isActive: boolean;
  organizationId: string | null;
}): ActiveSite {
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
    organizationId: active.organizationId,
  };
}

export async function getActiveSite(): Promise<ActiveSite | null> {
  const user = await getSessionUser();
  if (!user) return null;

  const sites = await listAccessibleSites(user.id);
  if (!sites.length) return null;

  const cookieId = await getActiveSiteId();
  const active =
    sites.find((s) => s.id === cookieId) ||
    sites.find((s) => s.slug === "kiekeboe") ||
    sites[0];

  return toActiveSite(active);
}

export async function listSitesForSwitcher() {
  const user = await getSessionUser();
  if (!user) return [];

  const sites = await listAccessibleSites(user.id);
  return sites.map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    cssFramework: s.cssFramework,
    lastGeneratedAt: s.lastGeneratedAt,
  }));
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
    hrefs.push("https://cdn.tailwindcss.com");
  }

  hrefs.push(`${theme}/css/kiekeboe.css`);
  hrefs.push(`${theme}/css/style.css`);

  return [...new Set(hrefs)];
}
