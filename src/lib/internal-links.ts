/**
 * Internal page links (MotionCMS-compatible).
 *
 * Stored forms:
 *   #internalURI194     — legacy numeric page id
 *   #page:clxyz…        — modern page cuid
 *   /s/{site}/{slug}    — already-resolved path (left as-is)
 *   https://…           — external
 */

export type LinkablePage = {
  id: string;
  slug: string;
  isDefault: boolean;
  legacyId?: number | null;
  title?: string;
  menuTitle?: string;
};

export function pagePath(siteSlug: string, page: LinkablePage): string {
  if (page.isDefault || page.slug === "home") return `/s/${siteSlug}`;
  return `/s/${siteSlug}/${page.slug}`;
}

/** Encode an internal page link for storage (legacy-compatible when legacyId set). */
export function encodeInternalLink(page: LinkablePage): string {
  if (page.legacyId != null && page.legacyId > 0) {
    return `#internalURI${page.legacyId}`;
  }
  return `#page:${page.id}`;
}

/** True when href points at an internal CMS page ref. */
export function isInternalLinkRef(href: string): boolean {
  return /^#internalURI\d+$/i.test(href) || /^#page:[a-z0-9_-]+$/i.test(href);
}

/** Map a preview / public href to an editor page id, or null if external. */
export function matchEditorPageFromHref(
  href: string,
  siteSlug: string,
  pages: LinkablePage[],
): string | null {
  if (!href || !siteSlug || !pages.length) return null;
  const raw = href.trim();
  const ref = parseInternalLinkRef(raw);
  if (ref?.kind === "page") {
    return pages.some((p) => p.id === ref.id) ? ref.id : null;
  }
  if (ref?.kind === "legacy") {
    return pages.find((p) => p.legacyId === ref.id)?.id || null;
  }

  let path = raw;
  try {
    if (/^https?:\/\//i.test(raw)) {
      path = new URL(raw).pathname;
    }
  } catch {
    /* keep raw */
  }
  path = path.split("?")[0].split("#")[0];
  if (!path.startsWith("/")) return null;

  const prefixes = [`/s/${siteSlug}`, `/sites/${siteSlug}`];
  for (const prefix of prefixes) {
    if (path === prefix || path === `${prefix}/`) {
      return (
        pages.find((p) => p.isDefault || p.slug === "home" || p.slug === "")
          ?.id || null
      );
    }
    if (path.startsWith(`${prefix}/`)) {
      const slug = path.slice(prefix.length + 1).replace(/\/+$/, "");
      if (!slug) {
        return pages.find((p) => p.isDefault || p.slug === "home")?.id || null;
      }
      return pages.find((p) => p.slug === slug)?.id || null;
    }
  }
  return null;
}

export function parseInternalLinkRef(
  href: string,
): { kind: "legacy"; id: number } | { kind: "page"; id: string } | null {
  const legacy = href.match(/^#internalURI(\d+)$/i);
  if (legacy) return { kind: "legacy", id: Number(legacy[1]) };
  const page = href.match(/^#page:([a-z0-9_-]+)$/i);
  if (page) return { kind: "page", id: page[1] };
  return null;
}

/**
 * Resolve #internalURI / #page: refs to public paths.
 * Used for public HTML and editor preview.
 */
export function resolveInternalLinks(
  html: string,
  siteSlug: string,
  pages: LinkablePage[],
): string {
  if (!html || !pages.length) return html;

  const byLegacy = new Map<number, LinkablePage>();
  const byId = new Map<string, LinkablePage>();
  for (const p of pages) {
    byId.set(p.id, p);
    if (p.legacyId != null) byLegacy.set(p.legacyId, p);
  }

  return html.replace(
    /#internalURI(\d+)|#page:([a-zA-Z0-9_-]+)/g,
    (full, legacyId: string | undefined, pageId: string | undefined) => {
      if (legacyId) {
        const page = byLegacy.get(Number(legacyId));
        if (page) return pagePath(siteSlug, page);
        return full; // leave unresolved rather than break
      }
      if (pageId) {
        const page = byId.get(pageId);
        if (page) return pagePath(siteSlug, page);
        return full;
      }
      return full;
    },
  );
}
