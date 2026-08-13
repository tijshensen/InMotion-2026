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
  renderSectionHtmlForEditor,
  serializeFields,
  type FieldType,
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
import { BlockEditor } from "@/components/block-editor";

type TemplateBlock = {
  id: string;
  name: string;
  defaultHtml: string;
  isRepeatable: boolean;
  sortOrder: number;
  previewPath?: string;
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

type CanvasDevice = "desktop" | "tablet" | "phone";

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
  /** Supports functional updates so async media/crop always applies on latest state */
  onChange: (
    sections: PageSection[] | ((prev: PageSection[]) => PageSection[]),
  ) => void;
  /** Controlled device (from top bar) */
  device?: CanvasDevice;
  onDeviceChange?: (d: CanvasDevice) => void;
  /** Hide local device toolbar; fill parent height (admin canvas mode) */
  chromeMode?: boolean;
  /** Controlled add-section dialog (top bar when chromeMode) */
  showAdd?: boolean;
  onShowAddChange?: (open: boolean) => void;
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
  sectionId,
  linkPages,
  onChange,
  onChangeMany,
}: {
  fields: SectionField[];
  values: Record<string, string>;
  siteId: string;
  sectionId: string;
  linkPages: LinkPageOption[];
  onChange: (key: string, value: string) => void;
  /** Batch field updates (avoids stale overwrite when setting path + alt). */
  onChangeMany: (updates: Record<string, string>) => void;
}) {
  const [mediaFor, setMediaFor] = useState<string | null>(null);
  /**
   * Optimistic overlay so the URL input / thumb update immediately after
   * media pick, even if a parent re-render races with async crop.
   */
  const [localOverlay, setLocalOverlay] = useState<Record<string, string>>({});
  /** Stable target for async crop completion (field key at open time). */
  const mediaTargetRef = useRef<{
    sectionId: string;
    fieldKey: string;
    fieldType: FieldType;
  } | null>(null);

  const displayValues = { ...values, ...localOverlay };

  // Drop overlay entries once parent values catch up
  useEffect(() => {
    setLocalOverlay((prev) => {
      const keys = Object.keys(prev);
      if (!keys.length) return prev;
      let changed = false;
      const next = { ...prev };
      for (const k of keys) {
        if (values[k] === prev[k]) {
          delete next[k];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [values]);

  // Clear overlay when switching sections
  useEffect(() => {
    setLocalOverlay({});
    setMediaFor(null);
    mediaTargetRef.current = null;
  }, [sectionId]);

  const mediaField = mediaFor
    ? fields.find((x) => x.key === mediaFor) ?? null
    : null;
  const cropW = mediaField?.width ? parseInt(mediaField.width, 10) : NaN;
  const cropH = mediaField?.height ? parseInt(mediaField.height, 10) : NaN;

  function openMedia(field: SectionField) {
    mediaTargetRef.current = {
      sectionId,
      fieldKey: field.key,
      fieldType: field.type,
    };
    setMediaFor(field.key);
  }

  function applyMediaAsset(asset: MediaItem) {
    const target = mediaTargetRef.current;
    const fieldKey = target?.fieldKey || mediaFor;
    if (!fieldKey) return;

    const field =
      fields.find((x) => x.key === fieldKey) ||
      (target
        ? ({ key: fieldKey, type: target.fieldType } as SectionField)
        : null);

    const path = (asset.path || "").trim();
    if (!path) {
      console.error("[media] selected asset has empty path", asset);
      return;
    }

    const updates: Record<string, string> = {
      [fieldKey]: path,
    };
    if (field?.type === "image" || target?.fieldType === "image") {
      if (asset.alt) {
        updates[fieldKey + META.alt] = asset.alt;
      }
    }
    if (field?.type === "file" || target?.fieldType === "file") {
      updates[fieldKey + META.fileLabel] =
        asset.filename || asset.alt || "Download";
    }

    // Optimistic UI first, then push into section content
    setLocalOverlay((prev) => ({ ...prev, ...updates }));
    onChangeMany(updates);
    setMediaFor(null);
    mediaTargetRef.current = null;
  }

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
              {f.type === "image" && f.width && f.height
                ? " · crop"
                : ""}
            </span>
          </div>

          {f.type === "singleline" && (
            <div className="space-y-2">
              <input
                type="text"
                value={displayValues[f.key] ?? ""}
                onChange={(e) => onChange(f.key, e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <FieldLinkEditor
                label="Add link (text)"
                href={displayValues[f.key + META.link] ?? ""}
                target={displayValues[f.key + META.linkTarget] ?? ""}
                title={displayValues[f.key + META.linkTitle] ?? ""}
                linkPages={linkPages}
                onChangeHref={(v) => onChange(f.key + META.link, v)}
                onChangeTarget={(v) => onChange(f.key + META.linkTarget, v)}
                onChangeTitle={(v) => onChange(f.key + META.linkTitle, v)}
              />
            </div>
          )}

          {f.type === "multiline" && (
            <div className="space-y-2">
              <BlockEditor
                content={displayValues[f.key] ?? ""}
                siteId={siteId}
                onChange={(html) => onChange(f.key, html)}
                placeholder={`${f.label}…`}
              />
              <details className="text-xs">
                <summary className="cursor-pointer text-slate-500">
                  Internal page links (copy into Link tool)
                </summary>
                <p className="mt-1 text-[11px] text-slate-500">
                  Select text → Link in the toolbar, paste a ref like{" "}
                  <code className="rounded bg-slate-100 px-1">
                    #internalURI194
                  </code>
                  .
                </p>
                <ul className="mt-2 max-h-36 overflow-y-auto space-y-0.5 rounded-lg border border-slate-200 bg-white p-2">
                  {linkPages.map((p) => (
                    <li
                      key={p.id}
                      className="font-mono text-[10px] text-slate-600"
                    >
                      <button
                        type="button"
                        className="w-full text-left hover:text-blue-600"
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
                  {displayValues[f.key] &&
                  displayValues[f.key] !== "." &&
                  displayValues[f.key] !== "#" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={displayValues[f.key]}
                      src={displayValues[f.key]}
                      alt={displayValues[f.key + META.alt] || f.label}
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <span className="text-[10px] text-slate-400">No image</span>
                  )}
                </div>
                <div className="flex-1 space-y-2 min-w-0">
                  <input
                    type="text"
                    value={displayValues[f.key] ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setLocalOverlay((prev) => ({ ...prev, [f.key]: v }));
                      onChange(f.key, v);
                    }}
                    placeholder="Image URL"
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => openMedia(f)}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                  >
                    Choose from media…
                  </button>
                </div>
              </div>
              <input
                type="text"
                placeholder="Alt text"
                value={displayValues[f.key + META.alt] ?? f.alt ?? ""}
                onChange={(e) => onChange(f.key + META.alt, e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
              />
              <FieldLinkEditor
                label="Add link (image)"
                href={displayValues[f.key + META.link] ?? ""}
                target={displayValues[f.key + META.linkTarget] ?? ""}
                title={displayValues[f.key + META.linkTitle] ?? ""}
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
                value={displayValues[f.key] ?? ""}
                onChange={(e) => onChange(f.key, e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-xs"
              />
              <input
                type="text"
                placeholder="Link label"
                value={displayValues[f.key + META.fileLabel] ?? f.defaultValue}
                onChange={(e) =>
                  onChange(f.key + META.fileLabel, e.target.value)
                }
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
              />
              <button
                type="button"
                onClick={() => openMedia(f)}
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
          onClose={() => {
            setMediaFor(null);
            mediaTargetRef.current = null;
          }}
          onSelect={(asset: MediaItem) => {
            applyMediaAsset(asset);
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
  device: deviceProp,
  onDeviceChange,
  chromeMode = false,
  showAdd: showAddProp,
  onShowAddChange,
}: Props) {
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    null,
  );
  const [panelTab, setPanelTab] = useState<"content" | "style">("content");
  const [showAddInternal, setShowAddInternal] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deviceInternal, setDeviceInternal] = useState<CanvasDevice>("desktop");
  const device = deviceProp ?? deviceInternal;
  const setDevice = onDeviceChange ?? setDeviceInternal;
  const showAdd = showAddProp ?? showAddInternal;
  const setShowAdd = onShowAddChange ?? setShowAddInternal;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  /** Last known iframe scroll — restored only after rare full srcDoc reloads */
  const scrollRestore = useRef(0);
  /** Last content/css we painted into each section (skip no-op writes) */
  const paintedContentRef = useRef<Map<string, string>>(new Map());

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

  /**
   * Full iframe document only rebuilds when page structure changes
   * (add/remove/reorder sections, shell, menu, page meta).
   * Field value edits do NOT change this key — those patch the iframe DOM.
   */
  const structureKey = useMemo(
    () =>
      [
        shellHtml,
        pageTitle,
        siteTitle,
        metaDescription,
        menuHtml,
        siteSlug,
        inserts.map((i) => `${i.tag}:${i.content}`).join("||"),
        ordered
          .map(
            (s) =>
              `${s.id}:${s.templateBlockId ?? ""}:${s.sortOrder}:${s.templateBlock?.defaultHtml?.length ?? 0}`,
          )
          .join("|"),
      ].join("###"),
    [
      shellHtml,
      pageTitle,
      siteTitle,
      metaDescription,
      menuHtml,
      siteSlug,
      inserts,
      ordered,
    ],
  );

  const editorOrigin =
    typeof window !== "undefined" ? window.location.origin : "";

  const documentHtml = useMemo(
    () =>
      buildEditorPreviewHtml({
        shellHtml,
        pageTitle,
        siteTitle,
        metaDescription,
        menuHtml,
        inserts,
        selectedSectionId: null,
        siteSlug,
        linkPages,
        origin: editorOrigin,
        sections: ordered.map((s) => ({
          id: s.id,
          templateHtml: s.templateBlock?.defaultHtml || "",
          content: s.content,
          css: s.css,
          isHidden: s.isHidden,
          name: s.templateBlock?.name,
        })),
      }),
    // structureKey encodes structural deps; ordered content is snapshotted at rebuild time
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [structureKey, linkPages, editorOrigin],
  );

  const sectionSelector = useCallback((sectionId: string) => {
    const safe =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(sectionId)
        : sectionId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `.cms-edit-section[data-section-id="${safe}"]`;
  }, []);

  const applySelectionInIframe = useCallback(
    (sectionId: string | null) => {
      const doc = iframeRef.current?.contentDocument;
      if (!doc) return;
      doc.querySelectorAll(".cms-edit-section.is-selected").forEach((el) => {
        el.classList.remove("is-selected");
      });
      if (!sectionId) return;
      const el = doc.querySelector(sectionSelector(sectionId));
      if (el) el.classList.add("is-selected");
    },
    [sectionSelector],
  );

  /** Patch one section's body in the live iframe without reloading srcDoc. */
  const paintSectionInIframe = useCallback(
    (s: PageSection) => {
      const doc = iframeRef.current?.contentDocument;
      if (!doc) return false;
      const wrap = doc.querySelector(sectionSelector(s.id));
      if (!wrap) return false;
      const body = wrap.querySelector(".cms-edit-body");
      if (!body) return false;

      const paintKey = `${s.content}\n/*css*/\n${s.css}\n/*hidden*/\n${s.isHidden}`;
      if (paintedContentRef.current.get(s.id) === paintKey) {
        return true;
      }

      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const html = renderSectionHtmlForEditor(
        s.templateBlock?.defaultHtml || "",
        s.content,
        s.css,
        { siteSlug, linkPages, origin },
      );

      // Preserve scroll: only replace the section body, never the document
      body.innerHTML = html || "";
      wrap.classList.toggle("is-hidden", Boolean(s.isHidden));
      paintedContentRef.current.set(s.id, paintKey);
      return true;
    },
    [sectionSelector, siteSlug, linkPages],
  );

  const paintAllSectionsInIframe = useCallback(() => {
    for (const s of ordered) {
      paintSectionInIframe(s);
    }
    applySelectionInIframe(selectedSectionId);
  }, [ordered, paintSectionInIframe, applySelectionInIframe, selectedSectionId]);

  const restoreIframeScroll = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    const y = scrollRestore.current;
    if (y <= 0) return;
    win.scrollTo(0, y);
    requestAnimationFrame(() => {
      win.scrollTo(0, y);
      requestAnimationFrame(() => win.scrollTo(0, y));
    });
  }, []);

  const onIframeLoad = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (win) {
      const onScroll = () => {
        scrollRestore.current = win.scrollY || 0;
      };
      win.addEventListener("scroll", onScroll, { passive: true });
      (win as unknown as { __cmsScrollOff?: () => void }).__cmsScrollOff = () =>
        win.removeEventListener("scroll", onScroll);
    }
    // Full document just loaded — content is already correct from documentHtml.
    // Seed paint cache so we don't rewrite immediately.
    paintedContentRef.current.clear();
    for (const s of ordered) {
      const paintKey = `${s.content}\n/*css*/\n${s.css}\n/*hidden*/\n${s.isHidden}`;
      paintedContentRef.current.set(s.id, paintKey);
    }
    restoreIframeScroll();
    applySelectionInIframe(selectedSectionId);
  }, [
    ordered,
    restoreIframeScroll,
    applySelectionInIframe,
    selectedSectionId,
  ]);

  // Capture scroll before rare full reloads (structure change only)
  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (win) {
      const y = win.scrollY || 0;
      if (y > 0) scrollRestore.current = y;
    }
    paintedContentRef.current.clear();
  }, [structureKey]);

  // Field / CSS / hide edits: patch only the changed section body
  useEffect(() => {
    paintAllSectionsInIframe();
  }, [paintAllSectionsInIframe]);

  // Selection highlight without reloading the iframe
  useEffect(() => {
    applySelectionInIframe(selectedSectionId);
  }, [selectedSectionId, applySelectionInIframe]);

  // Listen for section clicks from iframe (original: parent.openSidebar)
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const data = ev.data;
      if (!data || data.type !== "cms-select-section") return;
      if (typeof data.sectionId !== "string") return;
      const win = iframeRef.current?.contentWindow;
      if (win) scrollRestore.current = win.scrollY || 0;
      setSelectedSectionId(data.sectionId);
      setPanelTab("content");
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  function setField(key: string, value: string) {
    setFields({ [key]: value });
  }

  /**
   * Always merge into the *latest* section content via functional setState.
   * Async media crop used to close over a stale `sections` / `selected` snapshot,
   * so the new image URL never replaced the old one.
   */
  function setFields(updates: Record<string, string>) {
    const sectionId = selectedSectionId;
    if (!sectionId) return;
    onChange((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        const html = s.templateBlock?.defaultHtml || "";
        const fields = {
          ...parseStoredContent(s.content, html).fields,
          ...updates,
        };
        return { ...s, content: serializeFields(fields) };
      }),
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
    <div
      className={[
        "flex flex-col",
        chromeMode
          ? "h-full w-full min-h-0 overflow-hidden"
          : "relative min-h-[calc(100vh-5.5rem)]",
      ].join(" ")}
    >
      {/* Local toolbar only outside admin chrome mode */}
      {!chromeMode && (
        <div className="shrink-0 z-20 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white/95 px-4 py-1.5 backdrop-blur">
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
        </div>
      )}

      {/* Canvas — explicit flex-1 + min-h-0 so iframe gets remaining viewport height */}
      <div
        className={[
          "min-h-0 w-full bg-slate-400/40",
          chromeMode ? "flex-1" : "flex-1 p-3 sm:p-6",
          panelOpen ? "lg:pr-[28rem]" : "",
        ].join(" ")}
        style={
          chromeMode
            ? { height: "100%", minHeight: 0 }
            : undefined
        }
      >
        <div
          className={[
            "mx-auto bg-white overflow-hidden transition-all duration-200",
            chromeMode
              ? "h-full w-full shadow-none rounded-none"
              : "min-h-[480px] h-full rounded-lg shadow-2xl",
          ].join(" ")}
          style={{
            width: chromeMode && device === "desktop" ? "100%" : deviceWidth,
            maxWidth: "100%",
            height: "100%",
          }}
        >
          {ordered.length === 0 ? (
            <div className="flex h-full min-h-[320px] flex-col items-center justify-center px-6 text-center">
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
              className="block h-full w-full border-0 bg-white"
              style={{ height: "100%", minHeight: "100%" }}
              srcDoc={documentHtml}
              onLoad={onIframeLoad}
              sandbox="allow-same-origin allow-scripts"
            />
          )}
        </div>
      </div>

      {/* Section editor — always below measured top bar */}
      <aside
        className={[
          "fixed right-0 z-[55] flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-200 ease-out",
          "bottom-0",
          panelOpen ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
        style={{
          top: chromeMode
            ? "var(--admin-header-h, 56px)"
            : 0,
        }}
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
                  sectionId={selected.id}
                  linkPages={linkPages}
                  onChange={setField}
                  onChangeMany={setFields}
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

      {/* Add section — slide in from the left (below top bar), like main nav */}
      {showAdd && (
        <button
          type="button"
          aria-label="Close add section"
          className="fixed inset-0 z-[56] bg-slate-900/30"
          style={
            chromeMode
              ? { top: "var(--admin-header-h, 56px)" }
              : undefined
          }
          onClick={() => setShowAdd(false)}
        />
      )}
      <aside
        className={[
          "fixed left-0 z-[57] flex w-full max-w-sm flex-col border-r border-slate-200 bg-slate-900 text-slate-100 shadow-2xl transition-transform duration-200 ease-out",
          "bottom-0",
          showAdd ? "translate-x-0" : "-translate-x-full pointer-events-none",
        ].join(" ")}
        style={{
          top: chromeMode ? "var(--admin-header-h, 56px)" : 0,
        }}
        aria-hidden={!showAdd}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 shrink-0">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">
              Layouts
            </p>
            <h3 className="font-semibold text-white">Add section</h3>
          </div>
          <button
            type="button"
            onClick={() => setShowAdd(false)}
            className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
          >
            Close
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto p-3 space-y-2">
          {catalog.map((tb) => (
            <li key={tb.id}>
              <button
                type="button"
                disabled={adding}
                onClick={() => void addSection(tb.id)}
                className="w-full overflow-hidden rounded-lg border border-slate-700 bg-slate-800/60 text-left text-sm hover:border-blue-500/50 hover:bg-slate-800 disabled:opacity-50"
              >
                <div className="aspect-[16/8] w-full overflow-hidden bg-slate-950">
                  {tb.previewPath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={tb.previewPath}
                      alt=""
                      className="h-full w-full object-cover object-top"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[11px] text-slate-500">
                      Preview pending
                    </div>
                  )}
                </div>
                <span className="block px-3 py-2">
                  <span className="font-medium text-white">{tb.name}</span>
                  <span className="mt-0.5 block text-[11px] text-slate-400">
                    {parseSectionFields(tb.defaultHtml).length} editable field(s)
                  </span>
                </span>
              </button>
            </li>
          ))}
          {catalog.length === 0 && (
            <li className="px-2 py-8 text-center text-sm text-slate-400">
              No section layouts. Create them under{" "}
              <a href="/admin/sections" className="text-blue-400 underline">
                Sections
              </a>
              .
            </li>
          )}
        </ul>
      </aside>
    </div>
  );
}
