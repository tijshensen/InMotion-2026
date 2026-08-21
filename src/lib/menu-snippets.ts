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
 * Tokens: [[href]] [[title]] [[currentindicator]] [[submenu]]
 */

import {
  buildMenuTree,
  filterPagesForMenu,
  pageHref,
  type MenuNode,
  type MenuPage,
} from "./menu";

export type MenuSnippets = {
  menuHtml: string;
  submenuHtml: string;
};

export type RenderMenuOpts = {
  /** When the shell already has <ul>{{menu}}</ul>, emit <li> items only. */
  bareItems?: boolean;
};

/** Hover dropdowns so snippets work without Bootstrap JS. */
export const MENU_SNIPPET_STYLE = `<style data-cms-menu-snippet>
.cms-snippet-nav { display: block; }
.cms-snippet-nav ul { list-style: none; margin: 0; padding: 0; }
.cms-snippet-nav > ul,
.cms-snippet-nav ul.cms-menu,
.cms-snippet-nav ul.nav { display: flex; flex-wrap: wrap; align-items: center; gap: 0; }
.cms-snippet-nav li { position: relative; list-style: none; }
.cms-snippet-nav li.dropdown > .dropdown-menu,
.cms-snippet-nav li.dropdown > ul,
.cms-snippet-nav li.relative > ul.cms-submenu,
.cms-snippet-nav li.relative > ul.absolute,
.cms-snippet-nav li.group > ul {
  display: none;
  position: absolute;
  left: 0;
  top: 100%;
  z-index: 60;
  min-width: 12rem;
}
.cms-snippet-nav li.dropdown:hover > .dropdown-menu,
.cms-snippet-nav li.dropdown:focus-within > .dropdown-menu,
.cms-snippet-nav li.dropdown:hover > ul,
.cms-snippet-nav li.dropdown:focus-within > ul,
.cms-snippet-nav li.relative:hover > ul,
.cms-snippet-nav li.relative:focus-within > ul,
.cms-snippet-nav li.group:hover > ul,
.cms-snippet-nav li.group:focus-within > ul {
  display: block;
}
.cms-snippet-nav .dropdown-menu,
.cms-snippet-nav li.relative > ul,
.cms-snippet-nav li.group > ul {
  background: #fff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 0.5rem;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
  padding: 0.25rem 0;
}
.cms-snippet-nav .dropdown-menu a,
.cms-snippet-nav li.relative > ul a,
.cms-snippet-nav li.group > ul a {
  display: block;
  padding: 0.4rem 0.9rem;
  white-space: nowrap;
}
.cms-snippet-nav a.active,
.cms-snippet-nav li.active > a { font-weight: 600; }
</style>`;

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function extractTagged(html: string, tag: string, type: string): string {
  const re = new RegExp(
    `<${tag}\\b[^>]*\\btype\\s*=\\s*["']?${type}["']?[^>]*>([\\s\\S]*?)</${tag}>`,
    "i",
  );
  return (html.match(re)?.[1] ?? "").trim();
}

function isPlaceholderOnly(html: string): boolean {
  const t = html.replace(/\{\{[^}]+\}\}|\[\[[^\]]+\]\]/g, "").trim();
  return t.length === 0;
}

function applyTokens(
  tpl: string,
  page: Pick<MenuPage, "id" | "title" | "menuTitle" | "slug" | "isDefault">,
  siteSlug: string,
  currentPageId?: string | null,
): string {
  const current = currentPageId && page.id === currentPageId ? "active" : "";
  return tpl
    .replace(/\[\[currentindicator\]\]/gi, (_m, offset: number, str: string) => {
      if (!current) return "";
      const prev = str[offset - 1];
      if (prev && prev !== '"' && prev !== "'" && !/\s/.test(prev)) {
        return ` ${current}`;
      }
      return current;
    })
    .split("[[href]]")
    .join(pageHref(siteSlug, page))
    .split("[[title]]")
    .join(escapeHtml(page.menuTitle || page.title))
    .replace(/class="\s+/g, 'class="')
    .replace(/\s+class=""/g, "");
}

function defaultHeadItem(): string {
  return `<li class="[[currentindicator]]"><a href="[[href]]">[[title]]</a></li>`;
}

function defaultDropdownItem(): string {
  return `<li><a href="[[href]]">[[title]]</a></li>`;
}

function defaultHeadWithDropdown(): string {
  return `<li class="dropdown [[currentindicator]]">
  <a href="[[href]]">[[title]]</a>
  <ul class="dropdown-menu" role="menu">[[submenu]]</ul>
</li>`;
}

function usableItemTemplate(raw: string, fallback: string): string {
  if (!raw || isPlaceholderOnly(raw) || !/\[\[href\]\]|\[\[title\]\]/i.test(raw)) {
    return fallback;
  }
  return raw;
}

/** True when the snippet contains MotionCMS <menu> / <menuitem> patterns. */
export function hasMenuSnippetPatterns(html: string): boolean {
  return /<menu\b/i.test(html) || /<menuitem\b/i.test(html);
}

function renderChildItems(
  children: MenuNode[],
  itemTpl: string,
  siteSlug: string,
  currentPageId?: string | null,
): string {
  return children
    .flatMap((c) =>
      c.children.length
        ? [
            applyTokens(itemTpl, c, siteSlug, currentPageId),
            ...c.children.map((gc) =>
              applyTokens(itemTpl, gc, siteSlug, currentPageId),
            ),
          ]
        : [applyTokens(itemTpl, c, siteSlug, currentPageId)],
    )
    .join("\n");
}

function insertChildren(block: string, kids: string): string {
  // Prefer replacing the whole <menuitem>…</menuitem> block. Grok often
  // puts [[submenu]] *inside* that tag; replacing the token first would
  // leave a leftover <menuitem> wrapper.
  if (/<menuitem\b/i.test(block)) {
    return block.replace(/<menuitem\b[^>]*>[\s\S]*?<\/menuitem>/i, kids);
  }
  if (/\[\[submenu\]\]/i.test(block)) {
    return block.replace(/\[\[submenu\]\]/gi, kids);
  }
  if (/<\/ul>/i.test(block)) {
    return block.replace(/<\/ul>/i, `${kids}</ul>`);
  }
  return `${block}\n${kids}`;
}

function prepareDropdownTemplate(headDrop: string): string {
  // Original MotionCMS used href="#" on the toggle — use the page URL instead.
  return headDrop.replace(
    /<a([^>]*?)href=["']#["']/i,
    `<a$1href="[[href]]"`,
  );
}

function wrapRendered(itemsHtml: string, raw: string, bareItems?: boolean): string {
  const hasWrapper = /<(ul|nav|ol)\b/i.test(raw.replace(/<menu\b[\s\S]*?<\/menu>/gi, ""));
  let inner = itemsHtml;
  if (!bareItems && !hasWrapper) {
    inner = `<ul class="cms-menu">${itemsHtml}</ul>`;
  } else if (!bareItems && hasWrapper) {
    let out = raw.replace(/<menu\b[^>]*>[\s\S]*?<\/menu>/gi, "<!--CMS_MENU-->");
    if (out.includes("<!--CMS_MENU-->")) {
      out = out.replace("<!--CMS_MENU-->", itemsHtml);
      out = out.replaceAll("<!--CMS_MENU-->", "");
      inner = out;
    }
  }

  inner = inner
    .replace(/<\/?menu\b[^>]*>/gi, "")
    .replace(/<\/?menuitem\b[^>]*>/gi, "");
  if (bareItems) return inner;

  return `${MENU_SNIPPET_STYLE}<div class="cms-snippet-nav">${inner}</div>`;
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
  opts?: RenderMenuOpts,
): string | null {
  const raw = (snippets?.menuHtml || "").trim();
  if (!raw || !hasMenuSnippetPatterns(raw)) return null;

  const head = usableItemTemplate(
    extractTagged(raw, "menu", "head"),
    defaultHeadItem(),
  );
  const headDrop = prepareDropdownTemplate(
    extractTagged(raw, "menu", "head-with-dropdown") ||
      defaultHeadWithDropdown(),
  );
  const dropItem = usableItemTemplate(
    extractTagged(raw, "menuitem", "dropdown") ||
      extractTagged(headDrop, "menuitem", "dropdown"),
    defaultDropdownItem(),
  );

  const tree = buildMenuTree(filterPagesForMenu(pages));
  const items = tree
    .map((n) => {
      if (!n.children.length) {
        return applyTokens(head, n, siteSlug, currentPageId);
      }
      const kids = renderChildItems(n.children, dropItem, siteSlug, currentPageId);
      return applyTokens(insertChildren(headDrop, kids), n, siteSlug, currentPageId);
    })
    .join("\n");

  return wrapRendered(items, raw, opts?.bareItems);
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

  const itemTpl = usableItemTemplate(
    extractTagged(raw, "menuitem", "submenu"),
    defaultHeadItem(),
  );
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
    out = `<ul class="cms-menu">${items}</ul>`;
  }
  return `${MENU_SNIPPET_STYLE}<div class="cms-snippet-nav">${out}</div>`;
}

export function menuTokenWantsBareItems(shellHtml: string): boolean {
  return /<(ul|ol)\b[^>]*>\s*\{\{menu\}\}/i.test(shellHtml || "");
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
