"use client";

/**
 * Sections admin — client-fetched block HTML (no large RSC payload).
 * Uses HtmlCodeEditor only (no CodeMirror / dynamic chunks).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  parseSectionFields,
  SECTION_LAYOUT_EXAMPLES,
  renderSectionHtml,
  serializeFields,
  emptyFieldsFromTemplate,
  formatSectionHtmlForEditor,
} from "@/lib/sections";
import { HtmlCodeEditor } from "@/components/html-code-editor";

type TemplateBlock = {
  id: string;
  name: string;
  defaultHtml: string;
  isRepeatable: boolean;
  sortOrder: number;
  templateId?: string;
};

type TemplateLite = {
  id: string;
  name: string;
  _count: { blocks: number };
};

type SiteLite = {
  id: string;
  name: string;
  slug: string;
  templateSets: {
    id: string;
    name: string;
    templates: TemplateLite[];
  }[];
};

type Props = {
  site: SiteLite;
};

export function SectionsAdminClient({ site }: Props) {
  const templates = useMemo(
    () => site.templateSets.flatMap((ts) => ts.templates) || [],
    [site],
  );
  const [templateId, setTemplateId] = useState(templates[0]?.id || "");
  const template =
    templates.find((t) => t.id === templateId) || templates[0] || null;

  const [blocks, setBlocks] = useState<TemplateBlock[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = blocks.find((b) => b.id === selectedId) || null;

  const [name, setName] = useState("");
  const [html, setHtml] = useState("");
  const [repeatable, setRepeatable] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadBlocks = useCallback(async (tid: string) => {
    if (!tid) {
      setBlocks([]);
      setSelectedId(null);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/template-blocks?templateId=${encodeURIComponent(tid)}`,
      );
      if (!res.ok) {
        setLoadError("Failed to load sections");
        setBlocks([]);
        return;
      }
      const data = (await res.json()) as TemplateBlock[];
      setBlocks(data);
      if (data[0]) {
        setSelectedId(data[0].id);
        setName(data[0].name);
        setHtml(formatSectionHtmlForEditor(data[0].defaultHtml));
        setRepeatable(data[0].isRepeatable);
      } else {
        setSelectedId(null);
        setName("");
        setHtml(SECTION_LAYOUT_EXAMPLES.fullWidth);
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Load failed");
      setBlocks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (template?.id) void loadBlocks(template.id);
  }, [template?.id, loadBlocks]);

  function selectBlock(b: TemplateBlock) {
    setSelectedId(b.id);
    setName(b.name);
    setHtml(formatSectionHtmlForEditor(b.defaultHtml));
    setRepeatable(b.isRepeatable);
    setStatus(null);
  }

  function onTemplateChange(id: string) {
    setTemplateId(id);
    setSelectedId(null);
    setStatus(null);
  }

  const fields = parseSectionFields(html);
  const preview = renderSectionHtml(
    html,
    serializeFields(emptyFieldsFromTemplate(html)),
  );

  async function save() {
    if (!selectedId) return;
    setSaving(true);
    setStatus(null);
    const res = await fetch(`/api/template-blocks/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        defaultHtml: html,
        isRepeatable: repeatable,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setStatus("Save failed");
      return;
    }
    const updated = (await res.json()) as TemplateBlock;
    setBlocks((prev) =>
      prev.map((b) => (b.id === updated.id ? { ...b, ...updated } : b)),
    );
    setStatus("Saved layout");
  }

  async function create(example?: keyof typeof SECTION_LAYOUT_EXAMPLES) {
    if (!template) return;
    const n = prompt("Section name", "New section");
    if (!n) return;
    const res = await fetch("/api/template-blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId: template.id,
        name: n,
        example: example || "fullWidth",
        isRepeatable: true,
      }),
    });
    if (!res.ok) {
      alert("Create failed");
      return;
    }
    const block = (await res.json()) as TemplateBlock;
    setBlocks((prev) => [...prev, block]);
    selectBlock(block);
    setStatus("Created");
  }

  async function remove() {
    if (!selectedId || !confirm("Delete this section layout?")) return;
    const res = await fetch(`/api/template-blocks/${selectedId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      alert("Delete failed");
      return;
    }
    const next = blocks.filter((b) => b.id !== selectedId);
    setBlocks(next);
    if (next[0]) selectBlock(next[0]);
    else {
      setSelectedId(null);
      setName("");
      setHtml(SECTION_LAYOUT_EXAMPLES.fullWidth);
    }
    setStatus("Deleted");
  }

  if (!templates.length) {
    return (
      <p className="text-sm text-slate-500">
        No page templates on this website yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <label className="text-sm space-y-1">
          <span className="text-slate-600">Page template</span>
          <select
            value={template?.id || ""}
            onChange={(e) => onTemplateChange(e.target.value)}
            className="block rounded-lg border border-slate-200 px-3 py-2 min-w-[12rem]"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t._count.blocks} sections)
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void create("fullWidth")}
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white"
        >
          + New section
        </button>
        <div className="flex gap-1 text-xs">
          <button
            type="button"
            onClick={() => void create("textImage")}
            className="rounded border border-slate-200 px-2 py-1 hover:bg-slate-50"
          >
            From: text+image
          </button>
          <button
            type="button"
            onClick={() => void create("threeImages")}
            className="rounded border border-slate-200 px-2 py-1 hover:bg-slate-50"
          >
            From: 3 images
          </button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {loadError}
        </div>
      )}

      <div className="grid lg:grid-cols-[240px_1fr] gap-4">
        <ul className="rounded-xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
          {loading && (
            <li className="px-3 py-6 text-sm text-slate-500 text-center">
              Loading…
            </li>
          )}
          {!loading &&
            blocks.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => selectBlock(b)}
                  className={[
                    "w-full text-left px-3 py-2.5 text-sm",
                    selectedId === b.id
                      ? "bg-blue-50 text-blue-900"
                      : "hover:bg-slate-50",
                  ].join(" ")}
                >
                  {b.name}
                  <span className="block text-[11px] text-slate-400">
                    {parseSectionFields(b.defaultHtml).length} fields
                  </span>
                </button>
              </li>
            ))}
          {!loading && !blocks.length && (
            <li className="px-3 py-6 text-sm text-slate-500 text-center">
              No sections on this template.
            </li>
          )}
        </ul>

        {selected ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
              <div className="flex flex-wrap gap-3 items-end">
                <label className="text-sm space-y-1 flex-1 min-w-[10rem]">
                  <span className="text-slate-600">Name</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm pb-2">
                  <input
                    type="checkbox"
                    checked={repeatable}
                    onChange={(e) => setRepeatable(e.target.checked)}
                  />
                  Repeatable on pages
                </label>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void save()}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save layout"}
                </button>
                <button
                  type="button"
                  onClick={() => void remove()}
                  className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600"
                >
                  Delete
                </button>
                {status && (
                  <span className="text-sm text-slate-500 pb-2">{status}</span>
                )}
              </div>

              <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-xs text-slate-600 space-y-1">
                <p className="font-medium text-slate-800">Layout markers</p>
                <p>
                  <code>
                    &lt;singleline name=&quot;Title&quot;&gt;…&lt;/singleline&gt;
                  </code>{" "}
                  — one-line text
                </p>
                <p>
                  <code>
                    &lt;multiline name=&quot;Body&quot;&gt;…&lt;/multiline&gt;
                  </code>{" "}
                  — rich text
                </p>
                <p>
                  <code>
                    &lt;img editable=&quot;true&quot; name=&quot;Photo&quot;
                    width=&quot;365&quot; height=&quot;200&quot; src=&quot;&quot;
                    /&gt;
                  </code>{" "}
                  — image with size
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-sm text-slate-600">Section HTML layout</span>
                <HtmlCodeEditor
                  value={html}
                  onChange={setHtml}
                  minHeight="320px"
                  placeholder="<!-- section layout HTML -->"
                />
              </div>

              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">
                  Detected fields ({fields.length})
                </p>
                <ul className="flex flex-wrap gap-2">
                  {fields.map((f) => (
                    <li
                      key={f.key}
                      className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700"
                    >
                      {f.label}{" "}
                      <span className="text-slate-400">{f.type}</span>
                      {f.width && (
                        <span className="text-slate-400">
                          {" "}
                          · {f.width}×{f.height || "auto"}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-medium text-slate-700 mb-3">
                Layout preview (defaults)
              </p>
              <div
                className="border border-slate-100 rounded-lg p-4 bg-slate-50 overflow-auto"
                dangerouslySetInnerHTML={{ __html: preview }}
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500 py-8">
            {loading
              ? "Loading sections…"
              : "Select or create a section layout."}
          </p>
        )}
      </div>
    </div>
  );
}
