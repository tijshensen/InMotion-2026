"use client";

/**
 * Page builder modelled on original MotionCMS (pages.edit.view.php):
 * - Main area = full rendered page in iframe (same HTML as public output)
 * - Click a section → slide-in panel with field editors from Templater::edit()
 *   singleline (+ link), multiline, image (+ alt/link), file, style CSS
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  META,
  buildEditorPreviewHtml,
  parseSectionFields,
  parseStoredContent,
  serializeFields,
  type SectionField,
} from "@/lib/sections";
import {
  encodeInternalLink,
  isInternalLinkRef,
  parseInternalLinkRef,
  type LinkablePage,
} from "@/lib/internal-links";
import { MediaPicker, type MediaItem } from "@/components/media-picker";
import { HtmlCodeEditor } from "@/components/html-code-editor";

type TemplateBlock = {
  id: string;
  name: string;
  defaultHtml: string;
  isRepeatable: boolean;
  sortOrder: number;
};

export type PageSection = {
  id: string;
  content: string;
  css: string;
  sortOrder: number;
  isHidden: boolean;
  templateBlockId: string | null;
  templateBlock: TemplateBlock | null;
};

type InsertLite = { tag: string; content: string };

export type LinkPageOption = LinkablePage & {
  title: string;
  menuTitle: string;
};

type Props = {
  pageId: string;
  siteId: string;
  siteSlug: string;
  pageTitle: string;
  siteTitle: string;
  metaDescription?: string;
  shellHtml: string;
  menuHtml: string;
  inserts: InsertLite[];
  sections: PageSection[];
  catalog: TemplateBlock[];
  linkPages: LinkPageOption[];
  onChange: (sections: PageSection[]) => void;
};

/**
 * Link editor matching original addTextLink / addPicLink modal:
 * external URL, title, target, OR pick an internal page → #internalURI{id}
 */
function FieldLinkEditor({
  label,
  href,
  target,
  title,
  linkPages,
  onChangeHref,
  onChangeTarget,
  onChangeTitle,
}: {
  label: string;
  href: string;
  target: string;
  title: string;
  linkPages: LinkPageOption[];
  onChangeHref: (v: string) => void;
  onChangeTarget: (v: string) => void;
  onChangeTitle: (v: string) => void;
}) {
  const parsed = parseInternalLinkRef(href || "");
  const selectedPageId = parsed
    ? parsed.kind === "page"
      ? parsed.id
      : linkPages.find((p) => p.legacyId === parsed.id)?.id || ""
    : "";
  const mode: "none" | "internal" | "external" = !href
    ? "none"
    : isInternalLinkRef(href) || selectedPageId
      ? "internal"
      : "external";

  const open = Boolean(href);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-700">{label}</p>
        {href && (
          <button
            type="button"
            onClick={() => {
              onChangeHref("");
              onChangeTarget("");
              onChangeTitle("");
            }}
            className="text-[11px] text-red-600 hover:underline"
          >
            Remove link
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1 text-[11px]">
        <button
          type="button"
          onClick={() => {
            onChangeHref("");
            onChangeTarget("");
          }}
          className={[
            "rounded-md px-2 py-1 border",
            mode === "none"
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-200 bg-white text-slate-600",
          ].join(" ")}
        >
          No link
        </button>
        <button
          type="button"
          onClick={() => {
            if (mode !== "internal") {
              const first = linkPages[0];
              onChangeHref(first ? encodeInternalLink(first) : "");
            }
          }}
          className={[
            "rounded-md px-2 py-1 border",
            mode === "internal"
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-slate-200 bg-white text-slate-600",
          ].join(" ")}
        >
          Internal page
        </button>
        <button
          type="button"
          onClick={() => {
            if (mode !== "external") {
              onChangeHref(
                href && !isInternalLinkRef(href) ? href : "https://",
              );
            }
          }}
          className={[
            "rounded-md px-2 py-1 border",
            mode === "external"
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-slate-200 bg-white text-slate-600",
          ].join(" ")}
        >
          External URL
        </button>
      </div>

      {mode === "internal" && (
        <label className="block space-y-1 text-xs">
          <span className="text-slate-600">Page</span>
          <select
            value={selectedPageId}
            onChange={(e) => {
              const page = linkPages.find((p) => p.id === e.target.value);
              if (page) onChangeHref(encodeInternalLink(page));
            }}
            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
          >
            <option value="">Select a page…</option>
            {linkPages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.menuTitle || p.title}
                {p.legacyId != null ? ` (#${p.legacyId})` : ""}
              </option>
            ))}
          </select>
          {href && (
            <p className="font-mono text-[10px] text-slate-400 break-all">
              stores as {href}
            </p>
          )}
        </label>
      )}

      {mode === "external" && (
        <label className="block space-y-1 text-xs">
          <span className="text-slate-600">URL</span>
          <input
            type="text"
            placeholder="https://example.com"
            value={href}
            onChange={(e) => onChangeHref(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs"
          />
        </label>
      )}

      {(mode === "internal" || mode === "external" || open) && mode !== "none" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1 text-xs">
            <span className="text-slate-600">Target</span>
            <select
              value={target || ""}
              onChange={(e) => onChangeTarget(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
            >
              <option value="">Same window</option>
              <option value="_blank">New window (_blank)</option>
              <option value="_self">_self</option>
            </select>
          </label>
          <label className="block space-y-1 text-xs">
            <span className="text-slate-600">Title</span>
            <input
              type="text"
              placeholder="Link title"
              value={title}
              onChange={(e) => onChangeTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
            />
          </label>
        </div>
      )}
    </div>
  );
}

function FieldEditors({
  fields,
  values,
  siteId,
  linkPages,
  onChange,
}: {
  fields: SectionField[];
  values: Record<string, string>;
  siteId: string;
  linkPages: LinkPageOption[];
  onChange: (key: string, value: string) => void;
}) {
  const [mediaFor, setMediaFor] = useState<string | null>(null);

  if (!fields.length) {
    return (
      <p className="text-sm text-slate-500">
        This section has no editable markers. Edit the layout under Sections.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {fields.map((f) => (
        <div
          key={f.key}
          className="space-y-2 border-b border-slate-100 pb-5 last:border-0"
        >
          <div className="flex items-baseline justify-between gap-2">
            <label className="text-sm font-medium text-slate-800">
              {f.label}
            </label>
            <span className="text-[10px] uppercase tracking-wide text-slate-400">
              {f.type}
              {f.width ? ` · ${f.width}×${f.height || "auto"}` : ""}
            </span>
          </div>

          {f.type === "singleline" && (
            <div className="space-y-2">
              <input
                type="text"
                value={values[f.key] ?? ""}
                onChange={(e) => onChange(f.key, e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <FieldLinkEditor
                label="Add link (text)"
                href={values[f.key + META.link] ?? ""}
                target={values[f.key + META.linkTarget] ?? ""}
                title={values[f.key + META.linkTitle] ?? ""}
                linkPages={linkPages}
                onChangeHref={(v) => onChange(f.key + META.link, v)}
                onChangeTarget={(v) => onChange(f.key + META.linkTarget, v)}
                onChangeTitle={(v) => onChange(f.key + META.linkTitle, v)}
              />
            </div>
          )}

          {f.type === "multiline" && (
            <div className="space-y-2">
              <HtmlCodeEditor
                value={values[f.key] ?? ""}
                onChange={(html) => onChange(f.key, html)}
                minHeight="180px"
                placeholder={'<p>HTML… use <a href="#internalURI194"> for internal pages</a></p>'}
              />
              <p className="text-[11px] text-slate-500">
                Inline links: use an external URL or{" "}
                <code className="rounded bg-slate-100 px-1">
                  #internalURI{"{pageId}"}
                </code>{" "}
                (pick id from the list below).
              </p>
              <details className="text-xs">
                <summary className="cursor-pointer text-slate-500">
                  Internal page ids for multiline HTML
                </summary>
                <ul className="mt-2 max-h-40 overflow-y-auto space-y-0.5 rounded-lg border border-slate-200 bg-white p-2">
                  {linkPages.map((p) => (
                    <li key={p.id} className="font-mono text-[10px] text-slate-600">
                      <button
                        type="button"
                        className="hover:text-blue-600 text-left w-full"
                        onClick={() => {
                          const ref = encodeInternalLink(p);
                          void navigator.clipboard?.writeText(ref);
                        }}
                        title="Copy link ref"
                      >
                        {encodeInternalLink(p)} — {p.menuTitle || p.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          )}

          {f.type === "image" && (
            <div className="space-y-2">
              <div className="flex gap-3">
                <div className="h-20 w-28 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center">
                  {values[f.key] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={values[f.key]}
                      alt={values[f.key + META.alt] || f.label}
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <span className="text-[10px] text-slate-400">No image</span>
                  )}
                </div>
                <div className="flex-1 space-y-2 min-w-0">
                  <input
                    type="text"
                    value={values[f.key] ?? ""}
                    onChange={(e) => onChange(f.key, e.target.value)}
                    placeholder="Image URL"
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setMediaFor(f.key)}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                  >
                    Choose from media…
                  </button>
                </div>
              </div>
              <input
                type="text"
                placeholder="Alt text"
                value={values[f.key + META.alt] ?? f.alt ?? ""}
                onChange={(e) => onChange(f.key + META.alt, e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
              />
              <FieldLinkEditor
                label="Add link (image)"
                href={values[f.key + META.link] ?? ""}
                target={values[f.key + META.linkTarget] ?? ""}
                title={values[f.key + META.linkTitle] ?? ""}
                linkPages={linkPages}
                onChangeHref={(v) => onChange(f.key + META.link, v)}
                onChangeTarget={(v) => onChange(f.key + META.linkTarget, v)}
                onChangeTitle={(v) => onChange(f.key + META.linkTitle, v)}
              />
            </div>
          )}

          {f.type === "file" && (
            <div className="space-y-2">
              <input
                type="text"
                placeholder="File URL / path"
                value={values[f.key] ?? ""}
                onChange={(e) => onChange(f.key, e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-xs"
              />
              <input
                type="text"
                placeholder="Link label"
                value={values[f.key + META.fileLabel] ?? f.defaultValue}
                onChange={(e) =>
                  onChange(f.key + META.fileLabel, e.target.value)
                }
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
              />
              <button
                type="button"
                onClick={() => setMediaFor(f.key)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs hover:bg-slate-50"
              >
                Pick from media…
              </button>
            </div>
          )}
        </div>
      ))}

      {mediaFor && (
        <MediaPicker
          open
          siteId={siteId}
          onClose={() => setMediaFor(null)}
          onSelect={(asset: MediaItem) => {
            onChange(mediaFor, asset.path);
            const field = fields.find((x) => x.key === mediaFor);
            if (field?.type === "image" && asset.alt) {
              onChange(mediaFor + META.alt, asset.alt);
            }
            if (field?.type === "file") {
              onChange(
                mediaFor + META.fileLabel,
                asset.filename || asset.alt || "Download",
              );
            }
            setMediaFor(null);
          }}
        />
      )}
    </div>
  );
}

export function VisualPageBuilder({
  pageId,
  siteId,
  siteSlug,
  pageTitle,
  siteTitle,
  metaDescription = "",
  shellHtml,
  menuHtml,
  inserts,
  sections,
  catalog,
  linkPages,
  onChange,
}: Props) {
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    null,
  );
  const [panelTab, setPanelTab] = useState<"content" | "style">("content");
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [device, setDevice] = useState<"desktop" | "tablet" | "phone">(
    "desktop",
  );
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const scrollRestore = useRef(0);

  const ordered = useMemo(
    () => [...sections].sort((a, b) => a.sortOrder - b.sortOrder),
    [sections],
  );

  const selected = ordered.find((s) => s.id === selectedSectionId) || null;
  const selectedHtml = selected?.templateBlock?.defaultHtml || "";
  const selectedFields = parseSectionFields(selectedHtml);
  const selectedValues = selected
    ? parseStoredContent(selected.content, selectedHtml).fields
    : {};

  const previewHtml = useMemo(
    () =>
      buildEditorPreviewHtml({
        shellHtml,
        pageTitle,
        siteTitle,
        metaDescription,
        menuHtml,
        inserts,
        selectedSectionId,
        siteSlug,
        linkPages,
        sections: ordered.map((s) => ({
          id: s.id,
          templateHtml: s.templateBlock?.defaultHtml || "",
          content: s.content,
          css: s.css,
          isHidden: s.isHidden,
          name: s.templateBlock?.name,
        })),
      }),
    [
      shellHtml,
      pageTitle,
      siteTitle,
      metaDescription,
      menuHtml,
      inserts,
      selectedSectionId,
      ordered,
      siteSlug,
      linkPages,
    ],
  );

  // Preserve iframe scroll when srcDoc rewrites (live field edits)
  const onIframeLoad = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (win && scrollRestore.current > 0) {
      win.scrollTo(0, scrollRestore.current);
    }
  }, []);

  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (win) scrollRestore.current = win.scrollY || 0;
  }, [previewHtml]);

  // Listen for section clicks from iframe (original: parent.openSidebar)
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const data = ev.data;
      if (!data || data.type !== "cms-select-section") return;
      if (typeof data.sectionId !== "string") return;
      setSelectedSectionId(data.sectionId);
      setPanelTab("content");
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  function setField(key: string, value: string) {
    if (!selected) return;
    const fields = {
      ...parseStoredContent(selected.content, selectedHtml).fields,
      [key]: value,
    };
    onChange(
      sections.map((s) =>
        s.id === selected.id
          ? { ...s, content: serializeFields(fields) }
          : s,
      ),
    );
  }

  function move(id: string, dir: -1 | 1) {
    const list = [...ordered];
    const idx = list.findIndex((s) => s.id === id);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= list.length) return;
    [list[idx], list[swap]] = [list[swap], list[idx]];
    onChange(list.map((s, i) => ({ ...s, sortOrder: i })));
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
      setSelectedSectionId(block.id);
      setPanelTab("content");
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
    if (selectedSectionId === id) setSelectedSectionId(null);
  }

  const deviceWidth =
    device === "desktop" ? "100%" : device === "tablet" ? "768px" : "390px";
  const panelOpen = Boolean(selected);

  return (
    <div className="relative min-h-[calc(100vh-5.5rem)]">
      {/* Toolbar */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur">
        <span className="text-xs font-medium text-slate-500">
          Page canvas
        </span>
        <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs">
          {(
            [
              ["desktop", "Desktop"],
              ["tablet", "Tablet"],
              ["phone", "Phone"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setDevice(id)}
              className={[
                "rounded-md px-2.5 py-1",
                device === id
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-50",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
        >
          + Add section
        </button>
        <p className="text-[11px] text-slate-400 ml-auto hidden sm:block">
          Looks like the live page · click a section to edit fields
        </p>
      </div>

      {/* Canvas: full public-style render in iframe (original contentFrame) */}
      <div
        className={[
          "bg-slate-300/60 p-3 sm:p-6 transition-[padding] duration-200",
          panelOpen ? "lg:pr-[calc(24rem+1.5rem)]" : "",
        ].join(" ")}
      >
        <div
          className="mx-auto overflow-hidden rounded-lg bg-white shadow-2xl transition-all duration-200"
          style={{
            width: deviceWidth,
            maxWidth: "100%",
            height: "calc(100vh - 8rem)",
            minHeight: "480px",
          }}
        >
          {ordered.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <p className="text-slate-400 text-sm mb-3">
                This page has no sections yet.
              </p>
              <button
                type="button"
                onClick={() => setShowAdd(true)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white"
              >
                Add first section
              </button>
            </div>
          ) : (
            <iframe
              ref={iframeRef}
              title="Page preview"
              className="h-full w-full border-0 bg-white"
              srcDoc={previewHtml}
              onLoad={onIframeLoad}
              sandbox="allow-same-origin allow-scripts"
            />
          )}
        </div>
      </div>

      {/* Slide-in panel (original #sidebar with Content / Style tabs) */}
      <aside
        className={[
          "fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-200 ease-out",
          panelOpen ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
        aria-hidden={!panelOpen}
      >
        {selected && (
          <>
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">
                  Edit section
                </p>
                <h2 className="truncate font-semibold text-slate-900">
                  {selected.templateBlock?.name || "Section"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSectionId(null)}
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="flex border-b border-slate-100 text-sm">
              <button
                type="button"
                onClick={() => setPanelTab("content")}
                className={[
                  "flex-1 py-2.5 font-medium",
                  panelTab === "content"
                    ? "border-b-2 border-blue-600 text-blue-700"
                    : "text-slate-500 hover:text-slate-800",
                ].join(" ")}
              >
                Content
              </button>
              <button
                type="button"
                onClick={() => setPanelTab("style")}
                className={[
                  "flex-1 py-2.5 font-medium",
                  panelTab === "style"
                    ? "border-b-2 border-blue-600 text-blue-700"
                    : "text-slate-500 hover:text-slate-800",
                ].join(" ")}
              >
                Style
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {panelTab === "content" && (
                <FieldEditors
                  fields={selectedFields}
                  values={selectedValues}
                  siteId={siteId}
                  linkPages={linkPages}
                  onChange={setField}
                />
              )}
              {panelTab === "style" && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500">
                    Optional CSS applied only to this section instance (original
                    Style tab).
                  </p>
                  <HtmlCodeEditor
                    value={selected.css}
                    onChange={(css) =>
                      onChange(
                        sections.map((s) =>
                          s.id === selected.id ? { ...s, css } : s,
                        ),
                      )
                    }
                    minHeight="220px"
                    placeholder={".section { padding: 1rem; }"}
                  />
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-3">
              <button
                type="button"
                onClick={() => move(selected.id, -1)}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs hover:bg-slate-50"
              >
                ↑ Up
              </button>
              <button
                type="button"
                onClick={() => move(selected.id, 1)}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs hover:bg-slate-50"
              >
                ↓ Down
              </button>
              <label className="flex items-center gap-1.5 text-xs text-slate-600 px-1">
                <input
                  type="checkbox"
                  checked={selected.isHidden}
                  onChange={(e) =>
                    onChange(
                      sections.map((s) =>
                        s.id === selected.id
                          ? { ...s, isHidden: e.target.checked }
                          : s,
                      ),
                    )
                  }
                />
                Hide
              </label>
              <button
                type="button"
                onClick={() => void removeSection(selected.id)}
                className="ml-auto rounded-lg border border-red-100 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50"
              >
                Remove
              </button>
            </div>
          </>
        )}
      </aside>

      {panelOpen && (
        <button
          type="button"
          aria-label="Close panel"
          className="fixed inset-0 z-30 bg-slate-900/20 lg:hidden"
          onClick={() => setSelectedSectionId(null)}
        />
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h3 className="font-semibold">Add section</h3>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="text-sm text-slate-500"
              >
                Close
              </button>
            </div>
            <ul className="overflow-y-auto p-3 space-y-1">
              {catalog.map((tb) => (
                <li key={tb.id}>
                  <button
                    type="button"
                    disabled={adding}
                    onClick={() => void addSection(tb.id)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-3 text-left text-sm hover:border-blue-300 hover:bg-blue-50/40 disabled:opacity-50"
                  >
                    <span className="font-medium">{tb.name}</span>
                    <span className="mt-0.5 block text-[11px] text-slate-400">
                      {parseSectionFields(tb.defaultHtml).length} editable field
                      (s)
                    </span>
                  </button>
                </li>
              ))}
              {catalog.length === 0 && (
                <li className="px-2 py-8 text-center text-sm text-slate-500">
                  No section layouts. Create them under{" "}
                  <a href="/admin/sections" className="text-blue-600 underline">
                    Sections
                  </a>
                  .
                </li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
