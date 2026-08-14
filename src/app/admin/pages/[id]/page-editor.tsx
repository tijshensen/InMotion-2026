"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  VisualPageBuilder,
  type LinkPageOption,
  type PageSection,
} from "@/components/visual-page-builder";
import { parseStoredContent } from "@/lib/sections";
import {
  useRegisterEditorChrome,
  type CanvasDevice,
  type EditorMode,
} from "@/components/editor-chrome-context";

type TemplateBlock = {
  id: string;
  name: string;
  defaultHtml: string;
  isRepeatable: boolean;
  sortOrder: number;
  previewPath?: string;
};

type Page = {
  id: string;
  title: string;
  menuTitle: string;
  slug: string;
  metaDescription: string;
  isHidden: boolean;
  isDefault: boolean;
  siteId: string;
  templateId: string | null;
  blocks: PageSection[];
};

type Props = {
  page: Page;
  catalog: TemplateBlock[];
  siteTitle: string;
  siteSlug: string;
  shellHtml: string;
  menuHtml: string;
  inserts: { tag: string; content: string }[];
  linkPages: LinkPageOption[];
  cssFramework: string;
};

const AUTOSAVE_MS = 400;

type Snapshot = {
  sections: PageSection[];
  title: string;
  menuTitle: string;
  slug: string;
  metaDescription: string;
  isHidden: boolean;
  isDefault: boolean;
};

function snapshotPayload(snap: Snapshot) {
  return {
    title: snap.title,
    menuTitle: snap.menuTitle,
    slug: snap.slug,
    metaDescription: snap.metaDescription,
    isHidden: snap.isHidden,
    isDefault: snap.isDefault,
    sections: snap.sections.map((s, i) => {
      const html = s.templateBlock?.defaultHtml || "";
      const parsed = parseStoredContent(s.content, html);
      return {
        id: s.id,
        templateBlockId: s.templateBlockId,
        sortOrder: i,
        isHidden: s.isHidden,
        css: s.css,
        fields: parsed.fields,
        layoutHtml: parsed.layoutHtml,
      };
    }),
  };
}

export function PageEditor({
  page,
  catalog,
  siteTitle,
  siteSlug,
  shellHtml,
  menuHtml,
  inserts,
  linkPages,
  cssFramework,
}: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(page.title);
  const [menuTitle, setMenuTitle] = useState(page.menuTitle);
  const [slug, setSlug] = useState(page.slug);
  const [metaDescription, setMetaDescription] = useState(page.metaDescription);
  const [isHidden, setIsHidden] = useState(page.isHidden);
  const [isDefault, setIsDefault] = useState(page.isDefault);
  const [sections, setSections] = useState<PageSection[]>(page.blocks);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showMeta, setShowMeta] = useState(false);
  const [device, setDevice] = useState<CanvasDevice>("phone");
  const [showAdd, setShowAdd] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>(() => {
    if (typeof window === "undefined") return "content";
    try {
      const stored = sessionStorage.getItem("cms_editor_mode");
      if (
        stored === "view" ||
        stored === "content" ||
        stored === "layout"
      ) {
        return stored;
      }
    } catch {
      /* ignore */
    }
    return "content";
  });

  useEffect(() => {
    try {
      sessionStorage.setItem("cms_editor_mode", editorMode);
    } catch {
      /* ignore */
    }
  }, [editorMode]);
  const layoutModeAvailable = (cssFramework || "").toLowerCase() === "tailwind";

  const skipFirstSave = useRef(true);
  const snapRef = useRef<Snapshot>({
    sections: page.blocks,
    title: page.title,
    menuTitle: page.menuTitle,
    slug: page.slug,
    metaDescription: page.metaDescription,
    isHidden: page.isHidden,
    isDefault: page.isDefault,
  });
  snapRef.current = {
    sections,
    title,
    menuTitle,
    slug,
    metaDescription,
    isHidden,
    isDefault,
  };

  const timerRef = useRef<number | null>(null);
  const inflightRef = useRef<Promise<void> | null>(null);
  const pendingRef = useRef(false);
  const lastOkJsonRef = useRef("");

  const persistNow = useCallback(
    async (opts?: { keepalive?: boolean }) => {
      const snap = snapRef.current;
      const payload = snapshotPayload(snap);
      const encoded = JSON.stringify(payload);
      if (encoded === lastOkJsonRef.current && !opts?.keepalive) {
        pendingRef.current = false;
        return;
      }

      setSaving(true);
      setStatus("Saving…");
      try {
        const res = await fetch(`/api/pages/${page.id}/autosave`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: encoded,
          credentials: "same-origin",
          keepalive: Boolean(opts?.keepalive),
        });
        if (!res.ok) {
          setSaving(false);
          setStatus("Save failed");
          return;
        }
        lastOkJsonRef.current = encoded;
        setSaving(false);
        setStatus("Saved");
      } catch {
        setSaving(false);
        setStatus("Save failed");
      }
    },
    [page.id],
  );

  const scheduleSave = useCallback(
    (immediate = false) => {
      if (skipFirstSave.current) return;
      pendingRef.current = true;
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const run = async () => {
        if (inflightRef.current) await inflightRef.current;
        if (!pendingRef.current) return;
        pendingRef.current = false;
        const job = persistNow();
        inflightRef.current = job;
        await job;
        inflightRef.current = null;
        if (pendingRef.current) void run();
      };
      if (immediate) {
        void run();
        return;
      }
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void run();
      }, AUTOSAVE_MS);
    },
    [persistNow],
  );

  useEffect(() => {
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      lastOkJsonRef.current = JSON.stringify(
        snapshotPayload(snapRef.current),
      );
      return;
    }
    scheduleSave(false);
  }, [
    sections,
    title,
    menuTitle,
    slug,
    metaDescription,
    isHidden,
    isDefault,
    scheduleSave,
    page.id,
  ]);

  useEffect(() => {
    const flush = () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      pendingRef.current = true;
      void persistNow({ keepalive: true });
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      flush();
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [persistNow]);

  const onDelete = useCallback(async () => {
    if (!confirm("Delete this page?")) return;
    const res = await fetch(`/api/pages/${page.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/admin/pages");
      router.refresh();
    }
  }, [page.id, router]);

  const chrome = useMemo(
    () => ({
      device,
      setDevice,
      saving,
      saveStatus: status,
      showMeta,
      setShowMeta,
      showAdd,
      editorMode:
        !layoutModeAvailable && editorMode === "layout" ? "content" : editorMode,
      setEditorMode,
      layoutModeAvailable,
      onDelete: () => {
        void onDelete();
      },
      onAddSection: () => setShowAdd((v) => !v),
    }),
    [
      device,
      saving,
      status,
      showMeta,
      showAdd,
      onDelete,
      editorMode,
      layoutModeAvailable,
    ],
  );

  useRegisterEditorChrome(chrome);

  const fieldClass =
    "w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

  return (
    <div className="relative flex h-full w-full min-h-0 flex-col overflow-hidden bg-slate-300">
      <div className="relative flex-1 min-h-0 w-full overflow-hidden">
        <VisualPageBuilder
          pageId={page.id}
          siteId={page.siteId}
          siteSlug={siteSlug}
          pageTitle={title}
          siteTitle={siteTitle}
          metaDescription={metaDescription}
          shellHtml={shellHtml}
          menuHtml={menuHtml}
          inserts={inserts}
          sections={sections}
          catalog={catalog}
          linkPages={linkPages}
          onChange={(next) => {
            setSections((prev) => {
              const resolved =
                typeof next === "function" ? next(prev) : next;
              const structChanged =
                prev.length !== resolved.length ||
                prev.some((s, i) => s.id !== resolved[i]?.id);
              if (structChanged) {
                queueMicrotask(() => scheduleSave(true));
              }
              return resolved;
            });
          }}
          device={device}
          onDeviceChange={setDevice}
          chromeMode
          showAdd={showAdd}
          onShowAddChange={setShowAdd}
          editorMode={
            !layoutModeAvailable && editorMode === "layout"
              ? "content"
              : editorMode
          }
        />
      </div>

      {/* Page settings — dark slide-in from the right */}
      {showMeta && (
        <button
          type="button"
          aria-label="Close page settings"
          className="fixed inset-0 z-[56] bg-slate-900/40"
          style={{ top: "var(--admin-header-h, 56px)" }}
          onClick={() => setShowMeta(false)}
        />
      )}
      <aside
        className={[
          "fixed right-0 z-[57] flex w-full max-w-md flex-col border-l border-slate-800 bg-slate-900 text-slate-100 shadow-2xl transition-transform duration-200 ease-out",
          "bottom-0",
          showMeta ? "translate-x-0" : "translate-x-full pointer-events-none",
        ].join(" ")}
        style={{ top: "var(--admin-header-h, 56px)" }}
        aria-hidden={!showMeta}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 shrink-0">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">
              Page
            </p>
            <h2 className="font-semibold text-white">Page settings</h2>
          </div>
          <button
            type="button"
            onClick={() => setShowMeta(false)}
            className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
          >
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <label className="block space-y-1 text-sm">
            <span className="text-slate-400">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-slate-400">Menu title</span>
            <input
              value={menuTitle}
              onChange={(e) => setMenuTitle(e.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-slate-400">Slug</span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className={`${fieldClass} font-mono`}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-slate-400">Meta description</span>
            <textarea
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              rows={3}
              className={fieldClass}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="rounded border-slate-600"
            />
            Default page
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={isHidden}
              onChange={(e) => setIsHidden(e.target.checked)}
              className="rounded border-slate-600"
            />
            Hidden page
          </label>
          <p className="text-[11px] text-slate-500">
            Changes save automatically.
            {status ? ` ${status}` : ""}
          </p>
          <button
            type="button"
            onClick={() => void onDelete()}
            className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950/70"
          >
            Delete page
          </button>
        </div>
      </aside>
    </div>
  );
}
