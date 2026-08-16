"use client";

/**
 * Page builder modelled on original MotionCMS (pages.edit.view.php):
 * - Main area = full rendered page in iframe (same HTML as public output)
 * - Click a section → slide-in panel with field editors from Templater::edit()
 *   singleline (+ link), multiline, image/video (+ alt/link/poster), file
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useRouter } from "next/navigation";
import {
  META,
  buildEditorPreviewHtml,
  parseSectionFields,
  parseStoredContent,
  renderSectionHtmlForEditor,
  repeatGroupsFromHtml,
  rewriteStoredContent,
  type FieldType,
  type SectionField,
} from "@/lib/sections";
import { matchEditorPageFromHref, type LinkablePage } from "@/lib/internal-links";
import { MediaPicker, type MediaItem } from "@/components/media-picker";
import { BlockEditor } from "@/components/block-editor";
import { TextLinkComposer } from "@/components/text-link-composer";
import { TailwindStylePanel } from "@/components/tailwind-style-panel";
import { SectionRepeatEditor } from "@/components/section-repeat-editor";
import { getClassAtNid, setClassAtNid, stampLayoutNids } from "@/lib/layout-html";
import { pickComputed, type ComputedBox } from "@/lib/tailwind-layout";
import { refreshTailwindInWindow } from "@/lib/tailwind-cdn";
import { detectVideoSource } from "@/lib/video-media";

type TemplateBlock = {
  id: string;
  name: string;
  defaultHtml: string;
  isRepeatable: boolean;
  sortOrder: number;
  previewPath?: string;
};

export type RepeatItem = {
  id: string;
  groupKey: string;
  sortOrder: number;
  origin: string;
  isHidden: boolean;
  content: string;
};

export type PageSection = {
  id: string;
  content: string;
  css: string;
  sortOrder: number;
  isHidden: boolean;
  templateBlockId: string | null;
  templateBlock: TemplateBlock | null;
  repeatItems?: RepeatItem[];
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
  editorMode?: "content" | "layout" | "view";
  cssFramework?: string;
};

function ImageVideoField({
  field: f,
  displayValues,
  onChange,
  onChangeMany,
  setLocalOverlay,
  openMedia,
  linkPages,
}: {
  field: SectionField;
  displayValues: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onChangeMany: (updates: Record<string, string>) => void;
  setLocalOverlay: Dispatch<SetStateAction<Record<string, string>>>;
  openMedia: (field: SectionField, slot?: "src" | "poster") => void;
  linkPages: LinkPageOption[];
}) {
  const [posterBusy, setPosterBusy] = useState(false);
  const src = displayValues[f.key] ?? "";
  const poster = displayValues[f.key + META.poster] ?? "";
  const video = detectVideoSource(src);

  async function fillPoster(force: boolean) {
    if (!video) return;
    if (poster && !force) return;
    if (video.kind === "youtube" && video.posterUrl) {
      const updates = { [f.key + META.poster]: video.posterUrl };
      setLocalOverlay((prev) => ({ ...prev, ...updates }));
      onChangeMany(updates);
      return;
    }
    setPosterBusy(true);
    try {
      const qs = new URLSearchParams({ url: src });
      if (force || video.kind === "file") qs.set("generate", "1");
      const res = await fetch(`/api/media/video-info?${qs.toString()}`);
      const data = (await res.json().catch(() => ({}))) as {
        posterUrl?: string;
      };
      if (data.posterUrl) {
        const updates = { [f.key + META.poster]: data.posterUrl };
        setLocalOverlay((prev) => ({ ...prev, ...updates }));
        onChangeMany(updates);
      }
    } finally {
      setPosterBusy(false);
    }
  }

  useEffect(() => {
    if (!video || poster) return;
    const t = window.setTimeout(() => {
      void fillPoster(false);
    }, 400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when src/poster change
  }, [src, poster, video?.kind]);

  return (
    <div className="space-y-2">
      <div className="flex gap-3">
        <div className="h-20 w-28 shrink-0 overflow-hidden rounded-lg border border-slate-700 bg-slate-800 flex items-center justify-center">
          <MediaFieldPreview
            src={src}
            poster={poster}
            alt={displayValues[f.key + META.alt] || f.label}
          />
        </div>
        <div className="flex-1 space-y-2 min-w-0">
          <input
            type="text"
            value={src}
            onChange={(e) => {
              const v = e.target.value;
              const next: Record<string, string> = { [f.key]: v };
              if (!detectVideoSource(v) && poster) {
                next[f.key + META.poster] = "";
              }
              setLocalOverlay((prev) => ({ ...prev, ...next }));
              if (next[f.key + META.poster] === "") {
                onChangeMany(next);
              } else {
                onChange(f.key, v);
              }
            }}
            placeholder="Image, MP4, YouTube or Vimeo URL"
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 font-mono text-xs text-white"
          />
          <button
            type="button"
            onClick={() => openMedia(f, "src")}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            Choose from media…
          </button>
        </div>
      </div>
      {video && (
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-wide text-slate-500">
            Poster / thumbnail
          </label>
          <input
            type="text"
            placeholder="Poster image URL (optional)"
            value={poster}
            onChange={(e) => {
              const v = e.target.value;
              setLocalOverlay((prev) => ({
                ...prev,
                [f.key + META.poster]: v,
              }));
              onChange(f.key + META.poster, v);
            }}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 font-mono text-xs text-white"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => openMedia(f, "poster")}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
            >
              Choose poster…
            </button>
            <button
              type="button"
              disabled={posterBusy}
              onClick={() => void fillPoster(true)}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            >
              {posterBusy ? "Generating…" : "Auto poster"}
            </button>
          </div>
        </div>
      )}
      <input
        type="text"
        placeholder={video ? "Title / alt text" : "Alt text"}
        value={displayValues[f.key + META.alt] ?? f.alt ?? ""}
        onChange={(e) => onChange(f.key + META.alt, e.target.value)}
        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-white"
      />
      {!video && (
        <TextLinkComposer
          linkPages={linkPages}
          canAdd={!displayValues[f.key + META.link]}
          existing={
            displayValues[f.key + META.link]
              ? {
                  href: displayValues[f.key + META.link],
                  title: displayValues[f.key + META.linkTitle] ?? "",
                  target: displayValues[f.key + META.linkTarget] ?? "",
                }
              : null
          }
          onApply={(draft) =>
            onChangeMany({
              [f.key + META.link]: draft.href,
              [f.key + META.linkTitle]: draft.title,
              [f.key + META.linkTarget]: draft.target,
            })
          }
          onRemove={() =>
            onChangeMany({
              [f.key + META.link]: "",
              [f.key + META.linkTitle]: "",
              [f.key + META.linkTarget]: "",
            })
          }
        />
      )}
    </div>
  );
}

function MediaFieldPreview({
  src,
  poster,
  alt,
}: {
  src: string;
  poster?: string;
  alt: string;
}) {
  const empty = !src || src === "." || src === "#";
  if (empty) {
    return <span className="text-[10px] text-slate-400">No media</span>;
  }
  const video = detectVideoSource(src);
  if (video?.kind === "file") {
    return (
      <video
        src={src}
        poster={poster || undefined}
        muted
        playsInline
        preload="metadata"
        className="max-h-full max-w-full object-contain"
      />
    );
  }
  if (video) {
    const thumb = poster || video.posterUrl;
    if (thumb) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumb}
          alt={alt}
          className="max-h-full max-w-full object-contain"
        />
      );
    }
    return (
      <span className="text-[10px] uppercase tracking-wide text-slate-400">
        {video.kind}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className="max-h-full max-w-full object-contain" />
  );
}

export function FieldEditors({
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
  const [textSel, setTextSel] = useState<{
    key: string;
    start: number;
    end: number;
  } | null>(null);
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
    slot: "src" | "poster";
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

  function openMedia(field: SectionField, slot: "src" | "poster" = "src") {
    mediaTargetRef.current = {
      sectionId,
      fieldKey: field.key,
      fieldType: field.type,
      slot,
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

    if (target?.slot === "poster") {
      const updates = { [fieldKey + META.poster]: path };
      setLocalOverlay((prev) => ({ ...prev, ...updates }));
      onChangeMany(updates);
      setMediaFor(null);
      mediaTargetRef.current = null;
      return;
    }

    const updates: Record<string, string> = {
      [fieldKey]: path,
    };
    if (field?.type === "image" || target?.fieldType === "image") {
      if (asset.alt) {
        updates[fieldKey + META.alt] = asset.alt;
      }
      if (asset.posterPath) {
        updates[fieldKey + META.poster] = asset.posterPath;
      } else if (detectVideoSource(path)?.kind === "file") {
        // leave existing poster; user can generate or pick one
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
          className="space-y-2 border-b border-slate-800 pb-5 last:border-0"
        >
          <div className="flex items-baseline justify-between gap-2">
            <label className="text-sm font-medium text-slate-100">
              {f.label}
            </label>
            <span className="text-[10px] uppercase tracking-wide text-slate-500">
              {f.type === "image" ? "image / video" : f.type}
              {f.width ? ` · ${f.width}×${f.height || "auto"}` : ""}
              {f.type === "image" &&
              f.width &&
              f.height &&
              !detectVideoSource(displayValues[f.key] || "")
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
                onSelect={(e) => {
                  const el = e.currentTarget;
                  const start = el.selectionStart ?? 0;
                  const end = el.selectionEnd ?? 0;
                  setTextSel(
                    end > start ? { key: f.key, start, end } : null,
                  );
                }}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
              />
              <TextLinkComposer
                linkPages={linkPages}
                canAdd={textSel?.key === f.key && textSel.end > textSel.start}
                existing={
                  displayValues[f.key + META.link]
                    ? {
                        href: displayValues[f.key + META.link],
                        title: displayValues[f.key + META.linkTitle] ?? "",
                        target: displayValues[f.key + META.linkTarget] ?? "",
                      }
                    : null
                }
                onApply={(draft) => {
                  onChangeMany({
                    [f.key + META.link]: draft.href,
                    [f.key + META.linkTitle]: draft.title,
                    [f.key + META.linkTarget]: draft.target,
                  });
                  setTextSel(null);
                }}
                onRemove={() =>
                  onChangeMany({
                    [f.key + META.link]: "",
                    [f.key + META.linkTitle]: "",
                    [f.key + META.linkTarget]: "",
                  })
                }
              />
            </div>
          )}

          {f.type === "multiline" && (
            <BlockEditor
              content={displayValues[f.key] ?? ""}
              siteId={siteId}
              linkPages={linkPages}
              onChange={(html) => onChange(f.key, html)}
              placeholder={`${f.label}…`}
            />
          )}

          {f.type === "image" && (
            <ImageVideoField
              field={f}
              displayValues={displayValues}
              onChange={onChange}
              onChangeMany={onChangeMany}
              setLocalOverlay={setLocalOverlay}
              openMedia={openMedia}
              linkPages={linkPages}
            />
          )}

          {f.type === "file" && (
            <div className="space-y-2">
              <input
                type="text"
                placeholder="File URL / path"
                value={displayValues[f.key] ?? ""}
                onChange={(e) => onChange(f.key, e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 font-mono text-xs text-white"
              />
              <input
                type="text"
                placeholder="Link label"
                value={displayValues[f.key + META.fileLabel] ?? f.defaultValue}
                onChange={(e) =>
                  onChange(f.key + META.fileLabel, e.target.value)
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-white"
              />
              <button
                type="button"
                onClick={() => openMedia(f)}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
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
          acceptKinds={
            mediaTargetRef.current?.slot === "poster" ? "image" : "all"
          }
          targetWidth={
            mediaTargetRef.current?.slot !== "poster" &&
            mediaField?.type === "image" &&
            Number.isFinite(cropW) &&
            cropW > 0
              ? cropW
              : null
          }
          targetHeight={
            mediaTargetRef.current?.slot !== "poster" &&
            mediaField?.type === "image" &&
            Number.isFinite(cropH) &&
            cropH > 0
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
  editorMode = "content",
  cssFramework = "",
}: Props) {
  const router = useRouter();
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    null,
  );

  const [layoutHit, setLayoutHit] = useState<{
    sectionId: string;
    nid: string;
    tag: string;
    className: string;
    parentNid: string | null;
    computed: ComputedBox | null;
    parentComputed: ComputedBox | null;
  } | null>(null);
  const [showAddInternal, setShowAddInternal] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const confirmRemoveRef = useRef<(id: string) => Promise<void>>(async () => {});
  const [deviceInternal, setDeviceInternal] = useState<CanvasDevice>("phone");
  const device = deviceProp ?? deviceInternal;
  const setDevice = onDeviceChange ?? setDeviceInternal;
  const showAdd = showAddProp ?? showAddInternal;
  const setShowAdd = onShowAddChange ?? setShowAddInternal;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  /** Last known iframe scroll — restored only after rare full srcDoc reloads */
  const scrollRestore = useRef(0);
  /** Last content/css we painted into each section (skip no-op writes) */
  const paintedContentRef = useRef<Map<string, string>>(new Map());
  const layoutHitRef = useRef(layoutHit);
  layoutHitRef.current = layoutHit;
  const stampedNidsRef = useRef(false);
  const detectedRepeatsRef = useRef<Set<string>>(new Set());
  const skipAutoLayoutRef = useRef(false);

  const ordered = useMemo(
    () => [...sections].sort((a, b) => a.sortOrder - b.sortOrder),
    [sections],
  );

  const selected = ordered.find((s) => s.id === selectedSectionId) || null;
  const selectedHtml = selected?.templateBlock?.defaultHtml || "";
  const selectedParsed = selected
    ? parseStoredContent(selected.content, selectedHtml)
    : null;
  const selectedFields = parseSectionFields(
    selectedParsed?.layoutHtml || selectedHtml,
  );
  const selectedValues = selectedParsed?.fields || {};
  const selectedRepeatGroups =
    selectedParsed?.repeatGroups?.length
      ? selectedParsed.repeatGroups
      : repeatGroupsFromHtml(selectedParsed?.layoutHtml || selectedHtml);

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
        cssFramework,
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
      cssFramework,
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
        cssFramework,
        sections: ordered.map((s) => ({
          id: s.id,
          templateHtml: s.templateBlock?.defaultHtml || "",
          content: s.content,
          css: s.css,
          isHidden: s.isHidden,
          name: s.templateBlock?.name,
          repeatItems: s.repeatItems,
        })),
      }),
    // structureKey encodes structural deps; ordered content is snapshotted at rebuild time
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [structureKey, linkPages, editorOrigin],
  );

  function layoutHitFromElement(el: HTMLElement, sectionId: string) {
    const nid = el.getAttribute("data-cms-nid") || "";
    const className = (el.getAttribute("class") || "")
      .replace(/\bis-layout-selected\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const body = el.closest(".cms-edit-body");
    let parent = el.parentElement;
    while (
      parent &&
      parent !== body &&
      !parent.getAttribute("data-cms-nid")
    ) {
      parent = parent.parentElement;
    }
    if (parent === body) parent = null;
    const view = el.ownerDocument.defaultView;
    return {
      sectionId,
      nid,
      tag: el.tagName.toLowerCase(),
      className,
      parentNid: parent?.getAttribute("data-cms-nid") || null,
      computed: view ? pickComputed(view.getComputedStyle(el)) : null,
      parentComputed:
        view && parent ? pickComputed(view.getComputedStyle(parent)) : null,
    };
  }

  function activateLayoutInSection(sectionId: string | null) {
    const doc = iframeRef.current?.contentDocument;
    if (!doc || !sectionId) return false;
    const hit = layoutHitRef.current;
    let el: HTMLElement | null = null;
    if (hit?.nid && hit.sectionId === sectionId) {
      el = doc.querySelector(
        `[data-cms-nid="${hit.nid}"]`,
      ) as HTMLElement | null;
    }
    if (!el) {
      const wrap = doc.querySelector(sectionSelector(sectionId));
      el = wrap?.querySelector("[data-cms-nid]") as HTMLElement | null;
    }
    if (!el) return false;
    doc.querySelectorAll(".is-layout-selected").forEach((node) => {
      node.classList.remove("is-layout-selected");
    });
    el.classList.add("is-layout-selected");
    setLayoutHit(layoutHitFromElement(el, sectionId));
    return true;
  }

  useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    doc.documentElement.setAttribute("data-cms-mode", editorMode);
    if (editorMode !== "layout") {
      doc.querySelectorAll(".is-layout-selected").forEach((el) => {
        el.classList.remove("is-layout-selected");
      });
      skipAutoLayoutRef.current = false;
      return;
    }
    if (skipAutoLayoutRef.current) return;
    activateLayoutInSection(selectedSectionId);
    // Keep the last layout hit when toggling back so the slide-in stays open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorMode, documentHtml, selectedSectionId]);

  // Persist stable nids on the class-string HTML the first time Layout is opened.
  useEffect(() => {
    if (editorMode !== "layout" || stampedNidsRef.current) return;
    stampedNidsRef.current = true;
    onChange((prev) => {
      let changed = false;
      const next = prev.map((s) => {
        const base = s.templateBlock?.defaultHtml || "";
        const parsed = parseStoredContent(s.content, base);
        const source = parsed.layoutHtml || base;
        const stamped = stampLayoutNids(source);
        if (stamped === parsed.layoutHtml) return s;
        changed = true;
        return {
          ...s,
          content: rewriteStoredContent(s.content, base, {
            layoutHtml: stamped,
          }),
        };
      });
      return changed ? next : prev;
    });
  }, [editorMode, onChange]);

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

      const paintKey = `${s.content}\n/*css*/\n${s.css}\n/*hidden*/\n${s.isHidden}\n/*rep*/\n${(s.repeatItems || [])
        .map((i) => `${i.id}:${i.isHidden}:${i.content}`)
        .join("|")}`;
      if (paintedContentRef.current.get(s.id) === paintKey) {
        return true;
      }

      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const html = renderSectionHtmlForEditor(
        s.templateBlock?.defaultHtml || "",
        s.content,
        s.css,
        {
          siteSlug,
          linkPages,
          origin,
          repeatItems: s.repeatItems,
        },
      );

      // Preserve scroll: only replace the section body, never the document
      body.innerHTML = html || "";
      wrap.classList.toggle("is-hidden", Boolean(s.isHidden));
      paintedContentRef.current.set(s.id, paintKey);
      const hit = layoutHitRef.current;
      if (hit && hit.sectionId === s.id && hit.nid) {
        const el = body.querySelector(
          `[data-cms-nid="${hit.nid}"]`,
        ) as HTMLElement | null;
        el?.classList.add("is-layout-selected");
      }
      refreshTailwindInWindow(doc.defaultView);
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
      const paintKey = `${s.content}\n/*css*/\n${s.css}\n/*hidden*/\n${s.isHidden}\n/*rep*/\n${(s.repeatItems || [])
        .map((i) => `${i.id}:${i.isHidden}:${i.content}`)
        .join("|")}`;
      paintedContentRef.current.set(s.id, paintKey);
    }
    restoreIframeScroll();
    applySelectionInIframe(selectedSectionId);
    iframeRef.current?.contentDocument?.documentElement.setAttribute(
      "data-cms-mode",
      editorMode,
    );
    refreshTailwindInWindow(win);
  }, [
    ordered,
    restoreIframeScroll,
    applySelectionInIframe,
    selectedSectionId,
    editorMode,
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

  // Detect similar sibling blocks inside a section (once per section).
  useEffect(() => {
    if (!selectedSectionId || editorMode !== "content") return;
    const section = ordered.find((s) => s.id === selectedSectionId);
    if (!section) return;
    if (detectedRepeatsRef.current.has(section.id)) return;
    detectedRepeatsRef.current.add(section.id);
    void fetch(`/api/pages/${pageId}/sections/${section.id}/repeats/detect`, {
      method: "POST",
      credentials: "same-origin",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.block) return;
        onChange((prev) =>
          prev.map((s) =>
            s.id === data.block.id
              ? {
                  ...s,
                  content: data.block.content,
                  repeatItems: data.block.repeatItems || [],
                  templateBlock: data.block.templateBlock || s.templateBlock,
                }
              : s,
          ),
        );
      })
      .catch(() => {});
  }, [selectedSectionId, editorMode, ordered, pageId, onChange]);

  // Selection highlight without reloading the iframe
  useEffect(() => {
    applySelectionInIframe(selectedSectionId);
  }, [selectedSectionId, applySelectionInIframe]);

  // In-canvas delete overlay on the target section
  useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    doc.querySelectorAll(".cms-edit-delete-mask").forEach((el) => {
      el.parentElement?.classList.remove("is-delete-pending");
      el.remove();
    });
    if (!pendingDeleteId) return;
    const wrap = doc.querySelector(
      sectionSelector(pendingDeleteId),
    ) as HTMLElement | null;
    if (!wrap) return;
    wrap.classList.add("is-delete-pending");
    const mask = doc.createElement("div");
    mask.className = "cms-edit-delete-mask";
    mask.innerHTML =
      '<div class="cms-edit-delete-card">' +
      "<p>Remove this section from the page?</p>" +
      '<div class="cms-edit-delete-actions">' +
      '<button type="button" class="cms-edit-delete-cancel" data-act="cancel">Cancel</button>' +
      '<button type="button" class="cms-edit-delete-confirm" data-act="confirm">Confirm</button>' +
      "</div></div>";
    wrap.appendChild(mask);
    wrap.scrollIntoView({ block: "center", behavior: "smooth" });
    const onCancel = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      setPendingDeleteId(null);
    };
    const onConfirm = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      void confirmRemoveRef.current(pendingDeleteId);
    };
    mask
      .querySelector('[data-act="cancel"]')
      ?.addEventListener("click", onCancel);
    mask
      .querySelector('[data-act="confirm"]')
      ?.addEventListener("click", onConfirm);
    return () => {
      mask
        .querySelector('[data-act="cancel"]')
        ?.removeEventListener("click", onCancel);
      mask
        .querySelector('[data-act="confirm"]')
        ?.removeEventListener("click", onConfirm);
    };
  }, [pendingDeleteId, documentHtml, sectionSelector]);

  // Listen for section / layout clicks from iframe
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const data = ev.data;
      if (!data) return;
      if (data.type === "cms-select-element") {
        const win = iframeRef.current?.contentWindow;
        if (win) scrollRestore.current = win.scrollY || 0;
        setSelectedSectionId(data.sectionId);
        setLayoutHit({
          sectionId: String(data.sectionId || ""),
          nid: String(data.nid || ""),
          tag: String(data.tag || "div"),
          className: String(data.className || ""),
          parentNid: data.parentNid ? String(data.parentNid) : null,
          computed: data.computed || null,
          parentComputed: data.parentComputed || null,
        });
        return;
      }
      if (data.type === "cms-view-navigate") {
        const href = String(data.href || "");
        const resolved = String(data.resolved || href);
        const nextId =
          matchEditorPageFromHref(href, siteSlug, linkPages) ||
          matchEditorPageFromHref(resolved, siteSlug, linkPages);
        if (nextId && nextId !== pageId) {
          router.push(`/admin/pages/${nextId}`);
          return;
        }
        if (nextId && nextId === pageId) return;
        if (resolved && !resolved.startsWith("#")) {
          try {
            window.open(resolved, "_blank", "noopener");
          } catch {
            /* ignore */
          }
        }
        return;
      }
      if (data.type !== "cms-select-section") return;
      if (typeof data.sectionId !== "string") return;
      const win = iframeRef.current?.contentWindow;
      if (win) scrollRestore.current = win.scrollY || 0;
      setSelectedSectionId(data.sectionId);
      setLayoutHit(null);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [linkPages, pageId, router, siteSlug]);

  function applyLayoutClass(nextClass: string) {
    if (!layoutHit) return;
    const { sectionId, nid } = layoutHit;
    const cleaned = nextClass
      .replace(/\bis-layout-selected\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
    onChange((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        const base = s.templateBlock?.defaultHtml || "";
        const parsed = parseStoredContent(s.content, base);
        const stamped = stampLayoutNids(parsed.layoutHtml || base);
        const layoutHtml = setClassAtNid(stamped, nid, cleaned);
        return {
          ...s,
          content: rewriteStoredContent(s.content, base, { layoutHtml }),
        };
      }),
    );
    const doc = iframeRef.current?.contentDocument;
    const el = doc?.querySelector(`[data-cms-nid="${nid}"]`) as HTMLElement | null;
    if (el) {
      el.className = `${cleaned}${cleaned ? " " : ""}is-layout-selected`;
      const view = el.ownerDocument.defaultView;
      const parentEl = layoutHit.parentNid
        ? (doc?.querySelector(
            `[data-cms-nid="${layoutHit.parentNid}"]`,
          ) as HTMLElement | null)
        : null;
      setLayoutHit((h) =>
        h
          ? {
              ...h,
              className: cleaned,
              computed: view ? pickComputed(view.getComputedStyle(el)) : h.computed,
              parentComputed:
                view && parentEl
                  ? pickComputed(view.getComputedStyle(parentEl))
                  : h.parentComputed,
            }
          : h,
      );
    } else {
      setLayoutHit((h) => (h ? { ...h, className: cleaned } : h));
    }
  }

  function jumpLayoutParent() {
    if (!layoutHit?.parentNid) return;
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const el = doc.querySelector(
      `[data-cms-nid="${layoutHit.parentNid}"]`,
    ) as HTMLElement | null;
    if (!el) return;
    el.click();
  }

  function applyPresetReplacements(payload: {
    updatedPageBlocks: { id: string; content: string }[];
    updatedTemplateBlocks: { id: string; defaultHtml: string }[];
  }) {
    onChange((prev) =>
      prev.map((s) => {
        const pageHit = payload.updatedPageBlocks.find((b) => b.id === s.id);
        const tplHit = s.templateBlockId
          ? payload.updatedTemplateBlocks.find(
              (b) => b.id === s.templateBlockId,
            )
          : undefined;
        if (!pageHit && !tplHit) return s;
        return {
          ...s,
          content: pageHit ? pageHit.content : s.content,
          templateBlock:
            tplHit && s.templateBlock
              ? { ...s.templateBlock, defaultHtml: tplHit.defaultHtml }
              : s.templateBlock,
        };
      }),
    );
    if (!layoutHit) return;
    const pageHit = payload.updatedPageBlocks.find(
      (b) => b.id === layoutHit.sectionId,
    );
    if (!pageHit) return;
    const parsed = parseStoredContent(pageHit.content);
    const cls = getClassAtNid(parsed.layoutHtml || "", layoutHit.nid);
    if (cls) setLayoutHit((h) => (h ? { ...h, className: cls } : h));
  }

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
        const parsed = parseStoredContent(s.content, html);
        const fields = { ...parsed.fields, ...updates };
        return {
          ...s,
          content: rewriteStoredContent(s.content, html, { fields }),
        };
      }),
    );
  }

  function move(id: string, dir: -1 | 1) {
    onChange((prev) => {
      const list = [...prev].sort((a, b) => a.sortOrder - b.sortOrder);
      const idx = list.findIndex((s) => s.id === id);
      const swap = idx + dir;
      if (idx < 0 || swap < 0 || swap >= list.length) return prev;
      [list[idx], list[swap]] = [list[swap], list[idx]];
      return list.map((s, i) => ({ ...s, sortOrder: i }));
    });
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
      onChange((prev) => [...prev, block]);
      // Keep the Add section slide open so several layouts can be added
      // in a row. Edit a section by clicking it on the canvas.
    } finally {
      setAdding(false);
    }
  }

  async function confirmRemoveSection(id: string) {
    const res = await fetch(`/api/pages/${pageId}/sections/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setPendingDeleteId(null);
      return;
    }
    setPendingDeleteId(null);
    onChange((prev) =>
      prev
        .filter((s) => s.id !== id)
        .map((s, i) => ({ ...s, sortOrder: i })),
    );
    if (selectedSectionId === id) setSelectedSectionId(null);
  }
  confirmRemoveRef.current = confirmRemoveSection;

  const deviceWidth =
    device === "desktop" ? "100%" : device === "tablet" ? "768px" : "390px";
  const panelOpen =
    editorMode === "view"
      ? false
      : editorMode === "layout"
        ? Boolean(layoutHit) ||
          (Boolean(selected) && !skipAutoLayoutRef.current)
        : Boolean(selected);

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
                ["phone", "Mobile"],
                ["tablet", "Tablet"],
                ["desktop", "Desktop"],
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
              sandbox="allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox"
            />
          )}
        </div>
      </div>

      {/* Section editor — always below measured top bar */}
      <aside
        className={[
          "cms-editor-panel fixed right-0 z-[55] flex w-full max-w-md flex-col border-l border-slate-800 bg-slate-900 text-slate-100 shadow-2xl transition-transform duration-200 ease-out",
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
        {editorMode === "layout" && layoutHit && (
          <>
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">
                  Layout
                </p>
                <h2 className="truncate font-semibold text-white">
                  &lt;{layoutHit.tag}&gt;
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  skipAutoLayoutRef.current = true;
                  setLayoutHit(null);
                }}
                className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <TailwindStylePanel
                tag={layoutHit.tag}
                className={layoutHit.className}
                device={device}
                computed={layoutHit.computed}
                parentComputed={layoutHit.parentComputed}
                parentNid={layoutHit.parentNid}
                siteId={siteId}
                pageBlockId={layoutHit.sectionId}
                nid={layoutHit.nid}
                onChange={applyLayoutClass}
                onJumpParent={jumpLayoutParent}
                onPresetReplaced={applyPresetReplacements}
              />
            </div>
          </>
        )}
        {(editorMode !== "layout" || !layoutHit) && selected && (
          <>
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">
                  Edit section
                </p>
                <h2 className="truncate font-semibold text-white">
                  {selected.templateBlock?.name || "Section"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSectionId(null)}
                className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              <FieldEditors
                fields={selectedFields}
                values={selectedValues}
                siteId={siteId}
                sectionId={selected.id}
                linkPages={linkPages}
                onChange={setField}
                onChangeMany={setFields}
              />
              {selectedRepeatGroups.length ? (
                <SectionRepeatEditor
                  pageId={pageId}
                  sectionId={selected.id}
                  groups={selectedRepeatGroups}
                  items={selected.repeatItems || []}
                  onChangeItems={(next) =>
                    onChange((prev) =>
                      prev.map((s) =>
                        s.id === selected.id
                          ? { ...s, repeatItems: next }
                          : s,
                      ),
                    )
                  }
                  renderFields={({
                    item,
                    fields,
                    values,
                    onChange: onItemField,
                    onChangeMany,
                  }) => (
                    <FieldEditors
                      fields={fields}
                      values={values}
                      siteId={siteId}
                      sectionId={`${selected.id}:${item.id}`}
                      linkPages={linkPages}
                      onChange={onItemField}
                      onChangeMany={onChangeMany}
                    />
                  )}
                />
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2 border-t border-slate-800 px-4 py-3">
              <button
                type="button"
                onClick={() => move(selected.id, -1)}
                className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
              >
                ↑ Up
              </button>
              <button
                type="button"
                onClick={() => move(selected.id, 1)}
                className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
              >
                ↓ Down
              </button>
              <label className="flex items-center gap-1.5 text-xs text-slate-300 px-1">
                <input
                  type="checkbox"
                  checked={selected.isHidden}
                  onChange={(e) =>
                    onChange((prev) =>
                      prev.map((s) =>
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
                onClick={() => setPendingDeleteId(selected.id)}
                className="ml-auto rounded-lg border border-red-900/60 bg-red-950/40 px-2.5 py-1.5 text-xs text-red-300 hover:bg-red-950/70"
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
                <div className="w-full overflow-hidden bg-zinc-200">
                  {tb.previewPath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`${tb.previewPath}?v=4`}
                      alt=""
                      className="block h-auto w-full"
                    />
                  ) : (
                    <div className="flex h-16 items-center justify-center text-[11px] text-slate-500">
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
