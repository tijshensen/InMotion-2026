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

  const sortRec = (nodes: MenuNode[]) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder);
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}

export function pageHref(
  siteSlug: string,
  page: Pick<MenuPage, "slug" | "isDefault">,
) {
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

/**
 * Tailwind site navigation (replaces Bootstrap navbar).
 *
 * - Desktop (md+): horizontal bar; only top-level items visible;
 *   multi-level submenus open on hover / focus-within.
 * - Mobile: hamburger toggles a vertical panel; submenus accordion.
 *
 * Returns a complete <nav>…</nav> block for {{menu}}.
 */
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
  if (!tree.length) {
    return `<nav class="cms-nav" aria-label="Hoofdmenu"></nav>`;
  }

  const renderNodes = (nodes: MenuNode[], depth: number): string => {
    // depth 0 = top bar; 1 = dropdown; 2+ = nested flyouts
    // Submenus are hidden by default; desktop opens via group-hover / focus-within
    const listClass =
      depth === 0
        ? "cms-menu flex flex-col gap-0 md:flex-row md:flex-wrap md:items-center md:gap-0"
        : depth === 1
          ? [
              "cms-submenu",
              "hidden flex-col border-l border-slate-600/40 pl-3 ml-2 mt-1",
              "md:absolute md:left-0 md:top-full md:z-50 md:ml-0 md:mt-0 md:min-w-[14rem]",
              "md:rounded-lg md:border md:border-slate-700 md:bg-slate-900 md:py-1 md:shadow-xl md:pl-0",
              "md:hidden md:group-hover:flex md:group-focus-within:flex",
            ].join(" ")
          : [
              "cms-submenu cms-submenu-nested",
              "hidden flex-col border-l border-slate-600/40 pl-3 ml-2 mt-1",
              "md:absolute md:left-full md:top-0 md:z-50 md:ml-0 md:mt-0 md:min-w-[14rem]",
              "md:rounded-lg md:border md:border-slate-700 md:bg-slate-900 md:py-1 md:shadow-xl md:pl-0",
              // named group on parent li (group/sub)
              "md:hidden md:group-hover/sub:flex md:group-focus-within/sub:flex",
            ].join(" ");

    const items = nodes
      .map((n) => {
        const label = escapeHtml(n.menuTitle || n.title);
        const href = pageHref(siteSlug, n);
        const hasKids = n.children.length > 0;
        const kids = hasKids ? renderNodes(n.children, depth + 1) : "";

        // Top-level uses `group`; deeper items with children use `group/sub` for flyouts
        const itemClass =
          depth === 0
            ? "cms-menu-item group relative border-b border-slate-700/60 md:border-0"
            : hasKids
              ? "cms-menu-item group/sub relative"
              : "cms-menu-item relative";

        const linkClass =
          depth === 0
            ? "flex flex-1 items-center px-1 py-3 text-sm font-medium text-slate-200 hover:text-white md:px-3 md:py-2"
            : "flex flex-1 items-center px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 hover:text-white";

        const toggle = hasKids
          ? `<button type="button" class="cms-submenu-toggle shrink-0 rounded p-2 text-slate-400 hover:bg-slate-800 hover:text-white md:hidden" aria-expanded="false" aria-label="Submenu ${label}">
              <svg class="h-4 w-4 transition-transform" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd"/></svg>
            </button>`
          : "";

        const chevronDesktop = hasKids
          ? depth === 0
            ? `<span class="ml-1 hidden text-[10px] text-slate-400 md:inline" aria-hidden="true">▾</span>`
            : `<span class="ml-auto hidden pl-2 text-[10px] text-slate-400 md:inline" aria-hidden="true">›</span>`
          : "";

        return `<li class="${itemClass}">
  <div class="flex items-center">
    <a class="${linkClass}" href="${href}">${label}${chevronDesktop}</a>
    ${toggle}
  </div>
  ${kids}
</li>`;
      })
      .join("\n");

    return `<ul class="${listClass}"${depth === 0 ? ' role="menubar"' : ' role="menu"'}>${items}</ul>`;
  };

  const panelId = "cms-nav-panel";

  // Small progressive-enhancement script (no framework) for mobile open + accordion
  const script = `
<script>
(function(){
  var nav = document.currentScript && document.currentScript.previousElementSibling;
  if (!nav || !nav.classList.contains('cms-nav')) {
    nav = document.querySelector('nav.cms-nav');
  }
  if (!nav || nav.dataset.cmsNavReady) return;
  nav.dataset.cmsNavReady = '1';
  var btn = nav.querySelector('.cms-nav-toggle');
  var panel = nav.querySelector('.cms-nav-panel');
  if (btn && panel) {
    btn.addEventListener('click', function(){
      var open = panel.classList.toggle('cms-nav-open');
      panel.classList.toggle('hidden', !open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      var iconOpen = btn.querySelector('.icon-open');
      var iconClose = btn.querySelector('.icon-close');
      if (iconOpen && iconClose) {
        iconOpen.classList.toggle('hidden', open);
        iconClose.classList.toggle('hidden', !open);
      }
    });
  }
  nav.querySelectorAll('.cms-submenu-toggle').forEach(function(t){
    t.addEventListener('click', function(e){
      e.preventDefault();
      e.stopPropagation();
      var li = t.closest('li');
      if (!li) return;
      var sub = li.querySelector(':scope > ul.cms-submenu, :scope > ul.cms-submenu-nested');
      if (!sub) return;
      var open = sub.classList.toggle('cms-submenu-open');
      // mobile: show/hide via flex/hidden
      if (open) {
        sub.classList.remove('hidden');
        sub.classList.add('flex');
      } else {
        sub.classList.add('hidden');
        sub.classList.remove('flex');
      }
      t.setAttribute('aria-expanded', open ? 'true' : 'false');
      var svg = t.querySelector('svg');
      if (svg) svg.style.transform = open ? 'rotate(180deg)' : '';
    });
  });
})();
</script>`.trim();

  return `<nav class="cms-nav relative w-full md:w-auto" aria-label="Hoofdmenu">
  <div class="flex items-center justify-end md:contents">
    <button type="button"
      class="cms-nav-toggle inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 md:hidden"
      aria-expanded="false"
      aria-controls="${panelId}">
      <svg class="icon-open h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
      <svg class="icon-close hidden h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
      <span>Menu</span>
    </button>
  </div>
  <div id="${panelId}" class="cms-nav-panel hidden w-full md:block md:w-auto">
    ${renderNodes(tree, 0)}
  </div>
</nav>
${script}`;
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
