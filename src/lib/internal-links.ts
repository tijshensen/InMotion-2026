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
