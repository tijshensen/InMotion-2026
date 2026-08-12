"use client";

import { useMemo, useState } from "react";
import {
  parseSectionFields,
  parseStoredContent,
  type SectionField,
} from "@/lib/sections";
import { BlockEditor } from "@/components/block-editor";
import { MediaPicker, type MediaItem } from "@/components/media-picker";

type TemplateBlock = {
  id: string;
  name: string;
  defaultHtml: string;
  isRepeatable: boolean;
  sortOrder: number;
};

type PageSection = {
  id: string;
  content: string;
  css: string;
  sortOrder: number;
  isHidden: boolean;
  templateBlockId: string | null;
  templateBlock: TemplateBlock | null;
};

type Props = {
  pageId: string;
  siteId: string;
  sections: PageSection[];
  catalog: TemplateBlock[];
  onChange: (sections: PageSection[]) => void;
};

function SectionFieldsEditor({
  fields,
  values,
  siteId,
  onChange,
}: {
  fields: SectionField[];
  values: Record<string, string>;
  siteId: string;
  onChange: (key: string, value: string) => void;
}) {
  const [mediaFor, setMediaFor] = useState<string | null>(null);
  const mediaField = mediaFor
    ? fields.find((x) => x.key === mediaFor) ?? null
    : null;
  const cropW = mediaField?.width ? parseInt(mediaField.width, 10) : NaN;
  const cropH = mediaField?.height ? parseInt(mediaField.height, 10) : NaN;

  if (!fields.length) {
    return (
      <p className="text-sm text-slate-500">
        This section has no editable fields (static HTML only).
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {fields.map((f) => (
        <div key={f.key} className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">
            {f.label}
            <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-400">
              {f.type}
              {f.type === "image" && f.width
                ? ` · ${f.width}×${f.height || "auto"}`
                : ""}
            </span>
          </label>
          {f.type === "singleline" && (
            <input
              type="text"
              value={values[f.key] ?? ""}
              onChange={(e) => onChange(f.key, e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          )}
          {f.type === "multiline" && (
            <BlockEditor
              content={values[f.key] ?? ""}
              siteId={siteId}
              onChange={(html) => onChange(f.key, html)}
              placeholder={`${f.label}…`}
            />
          )}
          {f.type === "image" && (
            <div className="flex flex-wrap items-start gap-3">
              <div className="h-24 w-32 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center">
                {values[f.key] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={values[f.key]}
                    alt={f.label}
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-slate-400">No image</span>
                )}
              </div>
              <div className="flex-1 space-y-2 min-w-[12rem]">
                <input
                  type="text"
                  value={values[f.key] ?? ""}
                  onChange={(e) => onChange(f.key, e.target.value)}
                  placeholder="Image URL"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
                />
                <button
                  type="button"
                  onClick={() => setMediaFor(f.key)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs hover:bg-slate-50"
                >
                  Choose from media…
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
      {mediaFor && (
        <MediaPicker
          open
          siteId={siteId}
          targetWidth={
            mediaField?.type === "image" && Number.isFinite(cropW) && cropW > 0
              ? cropW
              : null
          }
          targetHeight={
            mediaField?.type === "image" && Number.isFinite(cropH) && cropH > 0
              ? cropH
              : null
          }
          onClose={() => setMediaFor(null)}
          onSelect={(asset: MediaItem) => {
            onChange(mediaFor, asset.path);
            setMediaFor(null);
          }}
        />
      )}
    </div>
  );
}

export function SectionBuilder({
  pageId,
  siteId,
  sections,
  catalog,
  onChange,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(
    sections[0]?.id ?? null,
  );
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);

  const ordered = useMemo(
    () => [...sections].sort((a, b) => a.sortOrder - b.sortOrder),
    [sections],
  );

  function updateSection(id: string, patch: Partial<PageSection>) {
    onChange(
      sections.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  }

  function setField(section: PageSection, key: string, value: string) {
    const html = section.templateBlock?.defaultHtml || "";
    const parsed = parseStoredContent(section.content, html);
    parsed.fields[key] = value;
    updateSection(section.id, {
      content: JSON.stringify(parsed),
    });
  }

  function move(id: string, dir: -1 | 1) {
    const list = [...ordered];
    const idx = list.findIndex((s) => s.id === id);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= list.length) return;
    [list[idx], list[swap]] = [list[swap], list[idx]];
    onChange(
      list.map((s, i) => ({
        ...s,
        sortOrder: i,
      })),
    );
  }

  async function addSection(templateBlockId: string) {
    setAdding(true);
    try {
      const res = await fetch(`/api/pages/${pageId}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateBlockId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Could not add section");
        return;
      }
      const block = await res.json();
      onChange([...sections, block]);
      setOpenId(block.id);
      setShowAdd(false);
    } finally {
      setAdding(false);
    }
  }

  async function removeSection(id: string) {
    if (!confirm("Remove this section from the page?")) return;
    const res = await fetch(`/api/pages/${pageId}/sections/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      alert("Delete failed");
      return;
    }
    const next = sections
      .filter((s) => s.id !== id)
      .map((s, i) => ({ ...s, sortOrder: i }));
    onChange(next);
    if (openId === id) setOpenId(next[0]?.id ?? null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-lg">Page sections</h2>
          <p className="text-sm text-slate-500">
            Each section is a preformatted layout (HTML/CSS) with fields —
            same model as the original MotionCMS builder.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          {showAdd ? "Close catalog" : "+ Add section"}
        </button>
      </div>

      {showAdd && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-slate-800 mb-3">
            Choose a section type
          </p>
          {catalog.length === 0 ? (
            <p className="text-sm text-slate-500">
              No section types on this template. Re-import the site or assign a
              template with blocks.
            </p>
          ) : (
            <ul className="grid sm:grid-cols-2 gap-2">
              {catalog.map((tb) => {
                const fieldCount = parseSectionFields(tb.defaultHtml).length;
                return (
                  <li key={tb.id}>
                    <button
                      type="button"
                      disabled={adding}
                      onClick={() => void addSection(tb.id)}
                      className="w-full text-left rounded-lg border border-slate-200 px-3 py-3 hover:border-blue-300 hover:bg-blue-50/40 disabled:opacity-50"
                    >
                      <span className="font-medium text-sm text-slate-900">
                        {tb.name}
                      </span>
                      <span className="block text-xs text-slate-500 mt-0.5">
                        {fieldCount} editable field
                        {fieldCount === 1 ? "" : "s"}
                        {tb.isRepeatable ? " · repeatable" : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {ordered.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
          No sections yet. Add a section from the catalog.
        </p>
      )}

      <ul className="space-y-3">
        {ordered.map((section, idx) => {
          const html = section.templateBlock?.defaultHtml || "";
          const fields = parseSectionFields(html);
          const values = parseStoredContent(section.content, html).fields;
          const open = openId === section.id;

          return (
            <li
              key={section.id}
              className={[
                "rounded-xl border bg-white shadow-sm overflow-hidden",
                section.isHidden
                  ? "border-amber-200 opacity-80"
                  : "border-slate-200",
              ].join(" ")}
            >
              <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50/80">
                <button
                  type="button"
                  className="text-left flex-1 min-w-[8rem]"
                  onClick={() =>
                    setOpenId(open ? null : section.id)
                  }
                >
                  <span className="text-xs text-slate-400 mr-2">
                    #{idx + 1}
                  </span>
                  <span className="font-medium text-slate-900">
                    {section.templateBlock?.name || "Section"}
                  </span>
                  {section.isHidden && (
                    <span className="ml-2 text-xs text-amber-600">hidden</span>
                  )}
                </button>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    title="Move up"
                    onClick={() => move(section.id, -1)}
                    className="rounded border border-slate-200 px-2 py-1 text-xs hover:bg-white"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    title="Move down"
                    onClick={() => move(section.id, 1)}
                    className="rounded border border-slate-200 px-2 py-1 text-xs hover:bg-white"
                  >
                    ↓
                  </button>
                  <label className="flex items-center gap-1 text-xs text-slate-600 px-2">
                    <input
                      type="checkbox"
                      checked={section.isHidden}
                      onChange={(e) =>
                        updateSection(section.id, {
                          isHidden: e.target.checked,
                        })
                      }
                    />
                    Hide
                  </label>
                  <button
                    type="button"
                    onClick={() => void removeSection(section.id)}
                    className="rounded border border-red-100 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setOpenId(open ? null : section.id)
                    }
                    className="rounded border border-slate-200 px-2 py-1 text-xs hover:bg-white"
                  >
                    {open ? "Collapse" : "Edit"}
                  </button>
                </div>
              </div>

              {open && (
                <div className="p-4 space-y-4">
                  <SectionFieldsEditor
                    fields={fields}
                    values={values}
                    siteId={siteId}
                    onChange={(key, value) =>
                      setField(section, key, value)
                    }
                  />
                  <details className="text-xs">
                    <summary className="cursor-pointer text-slate-500">
                      Section CSS (optional)
                    </summary>
                    <textarea
                      value={section.css}
                      onChange={(e) =>
                        updateSection(section.id, { css: e.target.value })
                      }
                      rows={3}
                      className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs"
                      placeholder=".section { ... }"
                    />
                  </details>
                  <details className="text-xs">
                    <summary className="cursor-pointer text-slate-500">
                      Layout HTML (read-only template)
                    </summary>
                    <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-slate-900 text-slate-100 p-3 text-[10px] leading-relaxed">
                      {html.slice(0, 4000)}
                    </pre>
                  </details>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
