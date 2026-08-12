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
} from "@/components/editor-chrome-context";

type TemplateBlock = {
  id: string;
  name: string;
  defaultHtml: string;
  isRepeatable: boolean;
  sortOrder: number;
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
};

const AUTOSAVE_MS = 700;

export function PageEditor({
  page,
  catalog,
  siteTitle,
  siteSlug,
  shellHtml,
  menuHtml,
  inserts,
  linkPages,
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
  const [device, setDevice] = useState<CanvasDevice>("desktop");
  const [showAdd, setShowAdd] = useState(false);
  const [linksEnabled, setLinksEnabled] = useState(false);

  const skipFirstSave = useRef(true);
  const saveGen = useRef(0);

  const persist = useCallback(
    async (payload: {
      sections: PageSection[];
      title: string;
      menuTitle: string;
      slug: string;
      metaDescription: string;
      isHidden: boolean;
      isDefault: boolean;
    }) => {
      const gen = ++saveGen.current;
      setSaving(true);
      setStatus("Saving…");

      try {
        const sectionsRes = await fetch(`/api/pages/${page.id}/sections`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sections: payload.sections.map((s, i) => {
              const html = s.templateBlock?.defaultHtml || "";
              const fields = parseStoredContent(s.content, html).fields;
              return {
                id: s.id,
                sortOrder: i,
                isHidden: s.isHidden,
                css: s.css,
                fields,
              };
            }),
          }),
        });

        if (!sectionsRes.ok) {
          if (gen === saveGen.current) {
            setSaving(false);
            setStatus("Save failed");
          }
          return;
        }

        const res = await fetch(`/api/pages/${page.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: payload.title,
            menuTitle: payload.menuTitle,
            slug: payload.slug,
            metaDescription: payload.metaDescription,
            isHidden: payload.isHidden,
            isDefault: payload.isDefault,
          }),
        });

        if (gen !== saveGen.current) return;

        setSaving(false);
        if (!res.ok) {
          setStatus("Save failed");
          return;
        }
        setStatus("Saved");
      } catch {
        if (gen === saveGen.current) {
          setSaving(false);
          setStatus("Save failed");
        }
      }
    },
    [page.id],
  );

  // Debounced autosave whenever content or meta changes
  useEffect(() => {
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      void persist({
        sections,
        title,
        menuTitle,
        slug,
        metaDescription,
        isHidden,
        isDefault,
      });
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(t);
  }, [
    sections,
    title,
    menuTitle,
    slug,
    metaDescription,
    isHidden,
    isDefault,
    persist,
  ]);

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
      onDelete: () => {
        void onDelete();
      },
      onAddSection: () => setShowAdd((v) => !v),
      linksEnabled,
      setLinksEnabled,
    }),
    [device, saving, status, showMeta, showAdd, linksEnabled, onDelete],
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
          onChange={setSections}
          device={device}
          onDeviceChange={setDevice}
          chromeMode
          showAdd={showAdd}
          onShowAddChange={setShowAdd}
          linksEnabled={linksEnabled}
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
