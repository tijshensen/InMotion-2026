/**
 * MotionCMS menu snippets: per-template HTML patterns that render the
 * live page tree into {{menu}} / {{submenu}}.
 *
 * Tags:
 *   <menu type="head">…</menu>                  top-level item, no children
 *   <menu type="head-with-dropdown">…</menu>    top-level item with children
 *   <menuitem type="dropdown">…</menuitem>      child inside a dropdown
 *   <menuitem type="submenu">…</menuitem>       {{submenu}} item
 *
 * Tokens: [[href]] [[title]] [[currentindicator]]
 */

import {
  buildMenuTree,
  filterPagesForMenu,
  pageHref,
  type MenuPage,
} from "./menu";

export type MenuSnippets = {
  menuHtml: string;
  submenuHtml: string;
};

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function extractTagged(html: string, tag: string, type: string): string {
  const re = new RegExp(
    `<${tag}\\b[^>]*\\btype=["']${type}["'][^>]*>([\\s\\S]*?)</${tag}>`,
    "i",
  );
  return html.match(re)?.[1] ?? "";
}

function applyTokens(
  tpl: string,
  page: Pick<MenuPage, "id" | "title" | "menuTitle" | "slug" | "isDefault">,
  siteSlug: string,
  currentPageId?: string | null,
): string {
  const current = currentPageId && page.id === currentPageId ? "active" : "";
  return tpl
    .replaceAll("[[href]]", pageHref(siteSlug, page))
    .replaceAll("[[title]]", escapeHtml(page.menuTitle || page.title))
    .replaceAll("[[currentindicator]]", current);
}

function defaultHeadItem(): string {
  return `<li class="[[currentindicator]]"><a href="[[href]]">[[title]]</a></li>`;
}

function defaultDropdownItem(): string {
  return `<li><a href="[[href]]">[[title]]</a></li>`;
}

function defaultHeadWithDropdown(): string {
  return `<li class="dropdown [[currentindicator]]">
  <a href="[[href]]" class="dropdown-toggle" data-toggle="dropdown">[[title]] <span class="caret"></span></a>
  <ul class="dropdown-menu" role="menu">
    <menuitem type="dropdown">${defaultDropdownItem()}</menuitem>
  </ul>
</li>`;
}

/** True when the snippet contains MotionCMS <menu> / <menuitem> patterns. */
export function hasMenuSnippetPatterns(html: string): boolean {
  return /<menu\b/i.test(html) || /<menuitem\b/i.test(html);
}

/**
 * Render the main nav from a template menu snippet.
 * Returns null when there is no usable snippet (caller should use the
 * hardcoded Bootstrap / Tailwind renderer).
 */
export function renderMenuFromSnippets(
  snippets: MenuSnippets | null | undefined,
  siteSlug: string,
  pages: MenuPage[],
  currentPageId?: string | null,
): string | null {
  const raw = (snippets?.menuHtml || "").trim();
  if (!raw || !hasMenuSnippetPatterns(raw)) return null;

  const head = extractTagged(raw, "menu", "head") || defaultHeadItem();
  const headDrop =
    extractTagged(raw, "menu", "head-with-dropdown") ||
    defaultHeadWithDropdown();
  const dropItem =
    extractTagged(raw, "menuitem", "dropdown") ||
    extractTagged(headDrop, "menuitem", "dropdown") ||
    defaultDropdownItem();

  const tree = buildMenuTree(filterPagesForMenu(pages));
  const items = tree
    .map((n) => {
      if (!n.children.length) {
        return applyTokens(head, n, siteSlug, currentPageId);
      }
      const kids = n.children
        .flatMap((c) =>
          c.children.length
            ? [
                applyTokens(dropItem, c, siteSlug, currentPageId),
                ...c.children.map((gc) =>
                  applyTokens(dropItem, gc, siteSlug, currentPageId),
                ),
              ]
            : [applyTokens(dropItem, c, siteSlug, currentPageId)],
        )
        .join("\n");
      const block = headDrop.replace(
        /<menuitem\b[^>]*>[\s\S]*?<\/menuitem>/i,
        kids,
      );
      return applyTokens(block, n, siteSlug, currentPageId);
    })
    .join("\n");

  let out = raw.replace(/<menu\b[^>]*>[\s\S]*?<\/menu>/gi, "<!--CMS_MENU-->");
  if (out.includes("<!--CMS_MENU-->")) {
    out = out.replace("<!--CMS_MENU-->", items);
    out = out.replaceAll("<!--CMS_MENU-->", "");
  } else {
    out = items;
  }
  return out;
}

/**
 * Secondary nav: children of the current page, or its siblings.
 * Returns null when there is no submenu snippet.
 */
export function renderSubmenuFromSnippets(
  snippets: MenuSnippets | null | undefined,
  siteSlug: string,
  pages: MenuPage[],
  currentPageId?: string | null,
): string | null {
  const raw = (snippets?.submenuHtml || "").trim();
  if (!raw || !hasMenuSnippetPatterns(raw)) return null;

  const itemTpl =
    extractTagged(raw, "menuitem", "submenu") || defaultHeadItem();
  const visible = filterPagesForMenu(pages);
  const current = currentPageId
    ? visible.find((p) => p.id === currentPageId)
    : null;
  const children = current
    ? visible
        .filter((p) => p.parentId === current.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
    : [];
  const list =
    children.length > 0
      ? children
      : current
        ? visible
            .filter((p) => p.parentId === current.parentId)
            .sort((a, b) => a.sortOrder - b.sortOrder)
        : visible.filter((p) => !p.parentId);

  const items = list
    .map((p) => applyTokens(itemTpl, p, siteSlug, currentPageId))
    .join("\n");

  let out = raw.replace(
    /<menuitem\b[^>]*>[\s\S]*?<\/menuitem>/gi,
    "<!--CMS_SUB-->",
  );
  if (out.includes("<!--CMS_SUB-->")) {
    out = out.replace("<!--CMS_SUB-->", items);
    out = out.replaceAll("<!--CMS_SUB-->", "");
  } else {
    out = items;
  }
  return out;
}

export function resolveMenuSnippets(opts: {
  template?: { menuHtml?: string | null; submenuHtml?: string | null } | null;
  templateSet?: { menuHtml?: string | null; submenuHtml?: string | null } | null;
}): MenuSnippets {
  return {
    menuHtml: (opts.template?.menuHtml || opts.templateSet?.menuHtml || "").trim(),
    submenuHtml: (
      opts.template?.submenuHtml ||
      opts.templateSet?.submenuHtml ||
      ""
    ).trim(),
  };
}
