export type MenuPage = {
  id: string;
  title: string;
  menuTitle: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
  isDefault: boolean;
  isHidden: boolean;
  inMenu: boolean;
};

export type MenuNode = MenuPage & { children: MenuNode[] };

/** Build a forest of menu nodes from a flat page list. */
export function buildMenuTree(pages: MenuPage[]): MenuNode[] {
  const byId = new Map<string, MenuNode>();
  for (const p of pages) {
    byId.set(p.id, { ...p, children: [] });
  }

  const roots: MenuNode[] = [];
  const sorted = [...pages].sort((a, b) => a.sortOrder - b.sortOrder);

  for (const p of sorted) {
    const node = byId.get(p.id)!;
    if (p.parentId && byId.has(p.parentId) && p.parentId !== p.id) {
      byId.get(p.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // sort children by sortOrder
  const sortRec = (nodes: MenuNode[]) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder);
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}

export function pageHref(siteSlug: string, page: Pick<MenuPage, "slug" | "isDefault">) {
  if (page.isDefault || page.slug === "home") return `/s/${siteSlug}`;
  return `/s/${siteSlug}/${page.slug}`;
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Nested <ul> menu HTML for public templates ({{menu}}). */
export function renderMenuHtml(
  siteSlug: string,
  pages: MenuPage[],
  opts?: { onlyInMenu?: boolean },
): string {
  const onlyInMenu = opts?.onlyInMenu !== false;
  const visible = pages.filter(
    (p) => !p.isHidden && (onlyInMenu ? p.inMenu !== false : true),
  );
  const tree = buildMenuTree(visible);
  if (!tree.length) return "";

  const renderNodes = (nodes: MenuNode[]): string => {
    const items = nodes
      .map((n) => {
        const label = escapeHtml(n.menuTitle || n.title);
        const href = pageHref(siteSlug, n);
        const kids =
          n.children.length > 0
            ? `<ul class="submenu">${renderNodes(n.children)}</ul>`
            : "";
        return `<li class="menu-item"><a href="${href}">${label}</a>${kids}</li>`;
      })
      .join("");
    return items;
  };

  return `<ul class="menu">${renderNodes(tree)}</ul>`;
}

/** Flatten tree back to parentId/sortOrder for saving. */
export function flattenMenuTree(
  roots: { id: string; children?: { id: string; children?: unknown[] }[] }[],
  parentId: string | null = null,
): { id: string; parentId: string | null; sortOrder: number }[] {
  const out: { id: string; parentId: string | null; sortOrder: number }[] = [];
  roots.forEach((node, index) => {
    out.push({ id: node.id, parentId, sortOrder: index });
    if (node.children?.length) {
      out.push(
        ...flattenMenuTree(
          node.children as {
            id: string;
            children?: { id: string; children?: unknown[] }[];
          }[],
          node.id,
        ),
      );
    }
  });
  return out;
}
