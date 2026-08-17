"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { HtmlCodeEditor } from "@/components/html-code-editor";
import { type MenuPage } from "@/lib/menu";
import {
  renderMenuFromSnippets,
  renderSubmenuFromSnippets,
} from "@/lib/menu-snippets";
import { errorFromResponse, formatCaughtError } from "@/lib/import-error";

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
  siteSlug: string;
  cssFramework: string;
  importPrompt: string;
  hasXaiKey: boolean;
  isSuperadmin: boolean;
  menuPages: MenuPage[];
};

export function TemplatesAdminClient({
  siteId,
  siteName,
  siteSlug,
  cssFramework,
  importPrompt,
  hasXaiKey,
  isSuperadmin,
  menuPages,
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
  const [saveAsSetDefault, setSaveAsSetDefault] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [importName, setImportName] = useState("");
  const [grokPrompt, setGrokPrompt] = useState(importPrompt);
  const [savePrompt, setSavePrompt] = useState(false);
  const [importing, setImporting] = useState(false);

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
    setSaveAsSetDefault(false);
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
        body: JSON.stringify({
          name,
          coreHtml,
          menuHtml,
          submenuHtml,
          saveAsSetDefault,
        }),
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

  async function onImport(e: FormEvent) {
    e.preventDefault();
    setImporting(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/templates/import-from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          sourceUrl,
          name: importName || undefined,
          prompt: grokPrompt,
          savePromptAsDefault: savePrompt,
        }),
      });
      if (!res.ok) {
        throw new Error(await errorFromResponse(res, "Could not import template"));
      }
      const data = (await res.json()) as {
        templateId?: string;
        sectionCount?: number;
      };
      setShowImport(false);
      setSourceUrl("");
      setImportName("");
      const listRes = await fetch(
        `/api/templates?siteId=${encodeURIComponent(siteId)}`,
      );
      const list = (await listRes.json()) as TemplateRow[];
      setTemplates(list);
      const created = list.find((t) => t.id === data.templateId);
      if (created) select(created);
      setStatus(
        `Imported template with ${data.sectionCount ?? 0} section layout(s)`,
      );
    } catch (err) {
      setError(formatCaughtError(err, "Could not import template"));
    } finally {
      setImporting(false);
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
          onClick={() => {
            setShowImport((v) => !v);
            setError(null);
          }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
        >
          {showImport ? "Cancel" : "Import from URL"}
        </button>
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

      {showImport && (
        <form
          onSubmit={(e) => void onImport(e)}
          className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 shadow-sm"
        >
          <div>
            <h2 className="font-semibold">Import from a website</h2>
            <p className="text-xs text-slate-500 mt-1">
              Same as Websites → Import from URL. Grok builds a Tailwind
              template (header/footer) and named editable section layouts.
            </p>
          </div>
          {!hasXaiKey && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Set <code className="text-xs">XAI_API_KEY</code> in{" "}
              <code className="text-xs">.env</code> (from{" "}
              <a
                href="https://console.x.ai"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                console.x.ai
              </a>
              ) then restart the server.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="text-slate-600">Website URL</span>
              <input
                required
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
                placeholder="https://example.com"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Template name (optional)</span>
              <input
                value={importName}
                onChange={(e) => setImportName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                placeholder="Taken from the source title if empty"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-slate-600">Prompt</span>
              <textarea
                required
                value={grokPrompt}
                onChange={(e) => setGrokPrompt(e.target.value)}
                rows={4}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
          </div>
          {isSuperadmin && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={savePrompt}
                onChange={(e) => setSavePrompt(e.target.checked)}
              />
              Save this as the default prompt for next imports
            </label>
          )}
          <button
            type="submit"
            disabled={importing || !hasXaiKey}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {importing
              ? "Reading page and generating with Grok…"
              : "Generate template with Grok"}
          </button>
        </form>
      )}

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
                <MenuSnippetsEditor
                  menuHtml={menuHtml}
                  submenuHtml={submenuHtml}
                  onMenuHtml={setMenuHtml}
                  onSubmenuHtml={setSubmenuHtml}
                  saveAsSetDefault={saveAsSetDefault}
                  onSaveAsSetDefault={setSaveAsSetDefault}
                  siteSlug={siteSlug}
                  menuPages={menuPages}
                />
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

function MenuSnippetsEditor({
  menuHtml,
  submenuHtml,
  onMenuHtml,
  onSubmenuHtml,
  saveAsSetDefault,
  onSaveAsSetDefault,
  siteSlug,
  menuPages,
}: {
  menuHtml: string;
  submenuHtml: string;
  onMenuHtml: (v: string) => void;
  onSubmenuHtml: (v: string) => void;
  saveAsSetDefault: boolean;
  onSaveAsSetDefault: (v: boolean) => void;
  siteSlug: string;
  menuPages: MenuPage[];
}) {
  const preview = useMemo(
    () =>
      renderMenuFromSnippets(
        { menuHtml, submenuHtml },
        siteSlug,
        menuPages,
        menuPages.find((p) => p.isDefault)?.id,
      ),
    [menuHtml, submenuHtml, siteSlug, menuPages],
  );
  const subPreview = useMemo(
    () =>
      renderSubmenuFromSnippets(
        { menuHtml, submenuHtml },
        siteSlug,
        menuPages,
        menuPages.find((p) => p.isDefault)?.id,
      ),
    [menuHtml, submenuHtml, siteSlug, menuPages],
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 space-y-1">
        <p>
          These snippets are the <strong>item patterns</strong> for{" "}
          <code className="bg-white px-1 rounded">{"{{menu}}"}</code> and{" "}
          <code className="bg-white px-1 rounded">{"{{submenu}}"}</code>. The
          live page tree from the Menu builder is filled into them.
        </p>
        <p>
          Repeat blocks:{" "}
          <code className="bg-white px-1 rounded">{'<menu type="head">'}</code>{" "}
          (top-level),{" "}
          <code className="bg-white px-1 rounded">
            {'<menu type="head-with-dropdown">'}
          </code>
          ,{" "}
          <code className="bg-white px-1 rounded">
            {'<menuitem type="dropdown">'}
          </code>
          ,{" "}
          <code className="bg-white px-1 rounded">
            {'<menuitem type="submenu">'}
          </code>
          .
        </p>
        <p>
          Tokens:{" "}
          <code className="bg-white px-1 rounded">{"[[href]]"}</code>{" "}
          <code className="bg-white px-1 rounded">{"[[title]]"}</code>{" "}
          <code className="bg-white px-1 rounded">
            {"[[currentindicator]]"}
          </code>{" "}
          (becomes <code className="bg-white px-1 rounded">active</code> on the
          current page).
        </p>
      </div>
      <label className="block space-y-1 text-sm">
        <span className="text-slate-600">Menu HTML</span>
        <HtmlCodeEditor
          value={menuHtml}
          onChange={onMenuHtml}
          minHeight="200px"
          placeholder={'<ul class="nav navbar-nav">\n  <menu type="head">…</menu>\n</ul>'}
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-slate-600">Submenu HTML</span>
        <HtmlCodeEditor
          value={submenuHtml}
          onChange={onSubmenuHtml}
          minHeight="120px"
          placeholder={'<ul>\n  <menuitem type="submenu">…</menuitem>\n</ul>'}
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={saveAsSetDefault}
          onChange={(e) => onSaveAsSetDefault(e.target.checked)}
        />
        Also use as the default for other templates in this set
      </label>
      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-600">
          Preview with the current menu tree
        </p>
        {preview ? (
          <div
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm overflow-x-auto"
            dangerouslySetInnerHTML={{ __html: preview }}
          />
        ) : (
          <p className="text-xs text-slate-400">
            Empty snippet — the site will fall back to the built-in Bootstrap
            or Tailwind nav.
          </p>
        )}
        {subPreview && (
          <div
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm overflow-x-auto"
            dangerouslySetInnerHTML={{ __html: subPreview }}
          />
        )}
      </div>
    </div>
  );
}
