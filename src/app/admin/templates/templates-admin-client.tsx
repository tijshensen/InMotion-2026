"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { HtmlCodeEditor } from "@/components/html-code-editor";

type TemplateRow = {
  id: string;
  name: string;
  coreHtml: string;
  menuHtml: string;
  submenuHtml: string;
  templateSetId: string;
  templateSet: { id: string; name: string };
  _count: { blocks: number; pages: number };
};

type Props = {
  siteId: string;
  siteName: string;
  cssFramework: string;
};

export function TemplatesAdminClient({
  siteId,
  siteName,
  cssFramework,
}: Props) {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [coreHtml, setCoreHtml] = useState("");
  const [menuHtml, setMenuHtml] = useState("");
  const [submenuHtml, setSubmenuHtml] = useState("");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"shell" | "menu">("shell");

  const selected = templates.find((t) => t.id === selectedId) || null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/templates?siteId=${encodeURIComponent(siteId)}`,
      );
      if (!res.ok) throw new Error("Failed to load templates");
      const data = (await res.json()) as TemplateRow[];
      setTemplates(data);
      if (data.length && !selectedId) {
        select(data[0]);
      } else if (selectedId) {
        const still = data.find((t) => t.id === selectedId);
        if (still) select(still);
        else if (data[0]) select(data[0]);
        else clearForm();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  useEffect(() => {
    void load();
  }, [load]);

  function clearForm() {
    setSelectedId(null);
    setName("");
    setCoreHtml("");
    setMenuHtml("");
    setSubmenuHtml("");
  }

  function select(t: TemplateRow) {
    setSelectedId(t.id);
    setName(t.name);
    setCoreHtml(t.coreHtml || "");
    setMenuHtml(t.menuHtml || "");
    setSubmenuHtml(t.submenuHtml || "");
    setStatus(null);
    setError(null);
    setTab("shell");
  }

  async function onSave(e?: FormEvent) {
    e?.preventDefault();
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/templates/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, coreHtml, menuHtml, submenuHtml }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Save failed");
      }
      const updated = (await res.json()) as TemplateRow;
      setTemplates((prev) =>
        prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)),
      );
      setStatus("Saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onCreate() {
    const n = prompt("Template name", "New page template");
    if (!n?.trim()) return;
    const defaultShell =
      cssFramework === "bootstrap"
        ? "bootstrap-minimal"
        : cssFramework === "tailwind"
          ? "tailwind"
          : "empty";
    setError(null);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          name: n.trim(),
          shell: defaultShell,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === "string" ? data.error : "Create failed",
        );
      }
      const created = (await res.json()) as TemplateRow;
      setTemplates((prev) =>
        [...prev, created].sort((a, b) => a.name.localeCompare(b.name)),
      );
      select(created);
      setStatus("Created");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  }

  async function onDelete() {
    if (!selectedId || !selected) return;
    if (selected._count.pages > 0) {
      alert(
        `Cannot delete: ${selected._count.pages} page(s) still use this template.`,
      );
      return;
    }
    if (
      !confirm(
        `Delete template “${selected.name}” and its ${selected._count.blocks} section layout(s)?`,
      )
    ) {
      return;
    }
    setError(null);
    const res = await fetch(`/api/templates/${selectedId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(
        typeof data.error === "string" ? data.error : "Delete failed",
      );
      return;
    }
    const next = templates.filter((t) => t.id !== selectedId);
    setTemplates(next);
    if (next[0]) select(next[0]);
    else clearForm();
    setStatus("Deleted");
  }

  async function onDuplicate() {
    if (!selected) return;
    const n = prompt("Name for copy", `${selected.name} (copy)`);
    if (!n?.trim()) return;
    setError(null);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          name: n.trim(),
          coreHtml: selected.coreHtml,
        }),
      });
      if (!res.ok) throw new Error("Duplicate failed");
      const created = (await res.json()) as TemplateRow;
      // copy menu fields
      await fetch(`/api/templates/${created.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          menuHtml: selected.menuHtml,
          submenuHtml: selected.submenuHtml,
        }),
      });
      await load();
      setSelectedId(created.id);
      setStatus("Duplicated (section layouts are not copied — recreate under Sections)");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Duplicate failed");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void onCreate()}
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + New template
        </button>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
        >
          Refresh
        </button>
        <p className="text-sm text-slate-500">
          {siteName} · framework: {cssFramework}
        </p>
      </div>

      {(error || status) && (
        <p
          className={
            error
              ? "text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2"
              : "text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2"
          }
        >
          {error || status}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="grid lg:grid-cols-[260px_1fr] gap-4">
          <ul className="rounded-xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
            {templates.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => select(t)}
                  className={[
                    "w-full text-left px-3 py-3 text-sm",
                    selectedId === t.id
                      ? "bg-blue-50 text-blue-900"
                      : "hover:bg-slate-50",
                  ].join(" ")}
                >
                  <span className="font-medium block">{t.name}</span>
                  <span className="text-[11px] text-slate-400">
                    {t._count.blocks} section(s) · {t._count.pages} page(s)
                  </span>
                </button>
              </li>
            ))}
            {!templates.length && (
              <li className="px-3 py-8 text-center text-sm text-slate-500">
                No page templates yet.
              </li>
            )}
          </ul>

          {selected ? (
            <form
              onSubmit={(e) => void onSave(e)}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4"
            >
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-sm space-y-1 flex-1 min-w-[12rem]">
                  <span className="text-slate-600">Name</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2"
                    required
                  />
                </label>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save template"}
                </button>
                <button
                  type="button"
                  onClick={() => void onDuplicate()}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  onClick={() => void onDelete()}
                  className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
                <Link
                  href="/admin/sections"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
                >
                  Section layouts →
                </Link>
              </div>

              <div className="flex border-b border-slate-100 text-sm">
                <button
                  type="button"
                  onClick={() => setTab("shell")}
                  className={[
                    "px-4 py-2 font-medium",
                    tab === "shell"
                      ? "border-b-2 border-blue-600 text-blue-700"
                      : "text-slate-500",
                  ].join(" ")}
                >
                  HTML shell
                </button>
                <button
                  type="button"
                  onClick={() => setTab("menu")}
                  className={[
                    "px-4 py-2 font-medium",
                    tab === "menu"
                      ? "border-b-2 border-blue-600 text-blue-700"
                      : "text-slate-500",
                  ].join(" ")}
                >
                  Menu snippets
                </button>
              </div>

              {tab === "shell" && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500">
                    Full page HTML. Must include{" "}
                    <code className="bg-slate-100 px-1 rounded">
                      {"{{sections}}"}
                    </code>{" "}
                    (page content) and typically{" "}
                    <code className="bg-slate-100 px-1 rounded">
                      {"{{menu}}"}
                    </code>
                    .
                  </p>
                  <HtmlCodeEditor
                    value={coreHtml}
                    onChange={setCoreHtml}
                    minHeight="420px"
                    placeholder="<!DOCTYPE html>…"
                  />
                </div>
              )}

              {tab === "menu" && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-500">
                    Optional legacy menu/submenu HTML stored with the template
                    (original MotionCMS fields). The live site usually injects
                    the menu tree via {"{{menu}}"} in the shell.
                  </p>
                  <label className="block space-y-1 text-sm">
                    <span className="text-slate-600">Menu HTML</span>
                    <HtmlCodeEditor
                      value={menuHtml}
                      onChange={setMenuHtml}
                      minHeight="160px"
                      placeholder="<!-- optional menu snippet -->"
                    />
                  </label>
                  <label className="block space-y-1 text-sm">
                    <span className="text-slate-600">Submenu HTML</span>
                    <HtmlCodeEditor
                      value={submenuHtml}
                      onChange={setSubmenuHtml}
                      minHeight="120px"
                      placeholder="<!-- optional submenu snippet -->"
                    />
                  </label>
                </div>
              )}
            </form>
          ) : (
            <p className="text-sm text-slate-500 py-8">
              Select or create a page template.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
