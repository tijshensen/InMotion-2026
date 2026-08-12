"use client";

import { useCallback, useState, type ReactNode } from "react";
import { buildMenuTree, type MenuNode, type MenuPage } from "@/lib/menu";

type Site = {
  id: string;
  name: string;
  languages: { id: string; name: string; code: string }[];
};

type Props = {
  site: Site;
  initialLanguageId: string;
  initialPages: MenuPage[];
};

function cloneTree(nodes: MenuNode[]): MenuNode[] {
  return nodes.map((n) => ({
    ...n,
    children: cloneTree(n.children),
  }));
}

function findNode(
  nodes: MenuNode[],
  id: string,
): { node: MenuNode; parent: MenuNode[] | null; index: number } | null {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) {
      return { node: nodes[i], parent: nodes, index: i };
    }
    const nested = findNode(nodes[i].children, id);
    if (nested) return nested;
  }
  return null;
}

function flattenFromTree(nodes: MenuNode[], parentId: string | null = null): MenuPage[] {
  const out: MenuPage[] = [];
  nodes.forEach((n, i) => {
    out.push({
      id: n.id,
      title: n.title,
      menuTitle: n.menuTitle,
      slug: n.slug,
      parentId,
      sortOrder: i,
      isDefault: n.isDefault,
      isHidden: n.isHidden,
      inMenu: n.inMenu,
    });
    if (n.children.length) {
      out.push(...flattenFromTree(n.children, n.id));
    }
  });
  return out;
}

export function MenuBuilderClient({
  site,
  initialLanguageId,
  initialPages,
}: Props) {
  const siteId = site.id;
  const [languageId, setLanguageId] = useState(initialLanguageId);
  const [pages, setPages] = useState<MenuPage[]>(initialPages);
  const [tree, setTree] = useState<MenuNode[]>(() =>
    buildMenuTree(initialPages),
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const languages = site.languages || [];

  const load = useCallback(async (sId: string, lId: string) => {
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(
        `/api/menus?siteId=${encodeURIComponent(sId)}&languageId=${encodeURIComponent(lId)}`,
      );
      if (!res.ok) throw new Error("Failed to load menu");
      const data = await res.json();
      setPages(data.pages);
      setTree(data.tree);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  async function onLanguageChange(id: string) {
    setLanguageId(id);
    await load(siteId, id);
  }

  function updateNode(id: string, patch: Partial<MenuNode>) {
    const next = cloneTree(tree);
    const found = findNode(next, id);
    if (!found) return;
    Object.assign(found.node, patch);
    setTree(next);
    setPages(flattenFromTree(next));
    setStatus(null);
  }

  function move(id: string, direction: "up" | "down") {
    const next = cloneTree(tree);
    const found = findNode(next, id);
    if (!found?.parent) return;
    const { parent, index } = found;
    const swap = direction === "up" ? index - 1 : index + 1;
    if (swap < 0 || swap >= parent.length) return;
    [parent[index], parent[swap]] = [parent[swap], parent[index]];
    setTree(next);
    setPages(flattenFromTree(next));
    setStatus(null);
  }

  function indent(id: string) {
    // Make previous sibling the parent
    const next = cloneTree(tree);
    const found = findNode(next, id);
    if (!found?.parent || found.index === 0) return;
    const siblings = found.parent;
    const node = siblings[found.index];
    const prev = siblings[found.index - 1];
    siblings.splice(found.index, 1);
    prev.children.push(node);
    setTree(next);
    setPages(flattenFromTree(next));
    setStatus(null);
  }

  function outdent(id: string) {
    // Move node to after its parent, at grandparent level
    const next = cloneTree(tree);

    function walk(
      list: MenuNode[],
      parentList: MenuNode[] | null,
      parentIndex: number,
    ): boolean {
      for (let i = 0; i < list.length; i++) {
        if (list[i].id === id) {
          if (!parentList) return true; // already root
          const node = list[i];
          list.splice(i, 1);
          parentList.splice(parentIndex + 1, 0, node);
          return true;
        }
        if (walk(list[i].children, list, i)) return true;
      }
      return false;
    }

    walk(next, null, -1);
    setTree(next);
    setPages(flattenFromTree(next));
    setStatus(null);
  }

  function onDropOnto(targetId: string) {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    const next = cloneTree(tree);
    const source = findNode(next, dragId);
    const target = findNode(next, targetId);
    if (!source?.parent || !target) {
      setDragId(null);
      return;
    }
    // Don't drop onto own descendant
    const isDescendant = (node: MenuNode, id: string): boolean => {
      if (node.id === id) return true;
      return node.children.some((c) => isDescendant(c, id));
    };
    if (isDescendant(source.node, targetId)) {
      setDragId(null);
      return;
    }

    const [moved] = source.parent.splice(source.index, 1);
    // Drop as last child of target
    const targetFresh = findNode(next, targetId);
    if (!targetFresh) {
      setDragId(null);
      return;
    }
    targetFresh.node.children.push(moved);
    setTree(next);
    setPages(flattenFromTree(next));
    setDragId(null);
    setStatus(null);
  }

  async function onSave() {
    setSaving(true);
    setError(null);
    setStatus(null);
    const items = flattenFromTree(tree).map((p) => ({
      id: p.id,
      parentId: p.parentId,
      sortOrder: p.sortOrder,
      menuTitle: p.menuTitle,
      inMenu: p.inMenu,
    }));
    try {
      const res = await fetch("/api/menus", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, languageId, items }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === "string" ? data.error : "Save failed",
        );
      }
      const data = await res.json();
      setPages(data.pages);
      setTree(data.tree);
      setStatus("Menu saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function renderRows(nodes: MenuNode[], depth: number): ReactNode {
    return nodes.map((node) => (
      <div key={node.id}>
        <div
          draggable
          onDragStart={() => setDragId(node.id)}
          onDragEnd={() => setDragId(null)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => onDropOnto(node.id)}
          className={[
            "flex flex-wrap items-center gap-2 rounded-lg border bg-white px-3 py-2 mb-2 shadow-sm",
            dragId === node.id
              ? "border-blue-400 opacity-70"
              : "border-slate-200",
          ].join(" ")}
          style={{ marginLeft: depth * 20 }}
        >
          <span
            className="cursor-grab text-slate-400 select-none text-sm"
            title="Drag onto another page to nest"
          >
            ⋮⋮
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900 truncate">
              {node.title}
              {node.isHidden && (
                <span className="ml-2 text-xs font-normal text-amber-600">
                  page hidden
                </span>
              )}
            </p>
            <p className="text-[11px] text-slate-400 font-mono">/{node.slug}</p>
          </div>
          <label className="text-xs text-slate-500 flex items-center gap-1">
            Label
            <input
              value={node.menuTitle}
              onChange={(e) =>
                updateNode(node.id, { menuTitle: e.target.value })
              }
              className="rounded border border-slate-200 px-2 py-1 text-sm w-28 sm:w-36"
              placeholder={node.title}
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={node.inMenu}
              onChange={(e) =>
                updateNode(node.id, { inMenu: e.target.checked })
              }
            />
            In menu
          </label>
          <div className="flex gap-1">
            <button
              type="button"
              title="Move up"
              onClick={() => move(node.id, "up")}
              className="rounded border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
            >
              ↑
            </button>
            <button
              type="button"
              title="Move down"
              onClick={() => move(node.id, "down")}
              className="rounded border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
            >
              ↓
            </button>
            <button
              type="button"
              title="Indent (nest under previous)"
              onClick={() => indent(node.id)}
              className="rounded border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
            >
              →
            </button>
            <button
              type="button"
              title="Outdent"
              onClick={() => outdent(node.id)}
              className="rounded border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
            >
              ←
            </button>
          </div>
        </div>
        {node.children.length > 0 && renderRows(node.children, depth + 1)}
      </div>
    ));
  }

  if (!languages.length) {
    return (
      <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-4 py-3">
        This website has no languages yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="space-y-1 text-sm">
          <span className="text-slate-600">Language</span>
          <select
            value={languageId}
            onChange={(e) => void onLanguageChange(e.target.value)}
            className="block rounded-lg border border-slate-200 px-3 py-2 min-w-[10rem]"
          >
            {languages.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.code})
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={saving || loading}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save menu"}
        </button>
        {status && <p className="text-sm text-emerald-600">{status}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <p className="text-sm text-slate-500">
        Reorder with ↑↓, nest with → or drag onto a parent, un-nest with ←.
        Uncheck <strong>In menu</strong> to keep a page public but out of the
        nav. Labels appear as the menu link text.
      </p>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : tree.length === 0 ? (
        <p className="text-sm text-slate-500 rounded-xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
          No pages for this language. Create pages first.
        </p>
      ) : (
        <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
          {renderRows(tree, 0)}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <p className="font-medium text-slate-800 mb-2">Live structure preview</p>
        <MenuPreview tree={tree} pages={pages} />
      </div>
    </div>
  );
}

function MenuPreview({ tree }: { tree: MenuNode[]; pages: MenuPage[] }) {
  function render(nodes: MenuNode[], depth = 0): ReactNode {
    if (!nodes.length && depth === 0) {
      return <span className="text-slate-400">Nothing in menu</span>;
    }
    return (
      <ul
        className={
          depth === 0
            ? "space-y-1"
            : "ml-4 mt-1 space-y-1 border-l border-slate-200 pl-3"
        }
      >
        {nodes.map((n) => (
          <li key={n.id}>
            <span className="text-slate-700">{n.menuTitle || n.title}</span>
            <span className="text-slate-400 text-xs ml-2">/{n.slug}</span>
            {n.children.length > 0 && render(n.children, depth + 1)}
          </li>
        ))}
      </ul>
    );
  }

  const filtered: MenuNode[] = (() => {
    const filterRec = (nodes: MenuNode[]): MenuNode[] =>
      nodes
        .filter((n) => !n.isHidden && n.inMenu)
        .map((n) => ({ ...n, children: filterRec(n.children) }));
    return filterRec(tree);
  })();

  return render(filtered);
}
