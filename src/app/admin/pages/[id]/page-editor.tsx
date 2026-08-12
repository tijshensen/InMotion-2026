"use client";

import { FormEvent, useCallback, useMemo, useState } from "react";
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
  const [loading, setLoading] = useState(false);
  const [showMeta, setShowMeta] = useState(false);
  const [device, setDevice] = useState<CanvasDevice>("desktop");
  const [showAdd, setShowAdd] = useState(false);

  const onSubmit = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      setLoading(true);
      setStatus(null);

      const sectionsRes = await fetch(`/api/pages/${page.id}/sections`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sections: sections.map((s, i) => {
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
        setLoading(false);
        setStatus("Failed to save sections");
        return;
      }

      const res = await fetch(`/api/pages/${page.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          menuTitle,
          slug,
          metaDescription,
          isHidden,
          isDefault,
        }),
      });
      setLoading(false);
      if (!res.ok) {
        setStatus("Failed to save page settings");
        return;
      }
      setStatus("Saved");
      router.refresh();
    },
    [
      page.id,
      sections,
      title,
      menuTitle,
      slug,
      metaDescription,
      isHidden,
      isDefault,
      router,
    ],
  );

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
      onSave: () => {
        void onSubmit();
      },
      saving: loading,
      saveStatus: status,
      showMeta,
      setShowMeta,
      onDelete: () => {
        void onDelete();
      },
      onAddSection: () => setShowAdd(true),
    }),
    [device, onSubmit, loading, status, showMeta, onDelete],
  );

  useRegisterEditorChrome(chrome);

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
        />
      </div>

      {/* Page settings — slide in from the right (below top bar) */}
      {showMeta && (
        <button
          type="button"
          aria-label="Close page settings"
          className="fixed inset-0 z-[56] bg-slate-900/30"
          style={{ top: "var(--admin-header-h, 56px)" }}
          onClick={() => setShowMeta(false)}
        />
      )}
      <aside
        className={[
          "fixed right-0 z-[57] flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-200 ease-out",
          "bottom-0",
          showMeta ? "translate-x-0" : "translate-x-full pointer-events-none",
        ].join(" ")}
        style={{ top: "var(--admin-header-h, 56px)" }}
        aria-hidden={!showMeta}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 shrink-0">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-400">
              Page
            </p>
            <h2 className="font-semibold text-slate-900">Page settings</h2>
          </div>
          <button
            type="button"
            onClick={() => setShowMeta(false)}
            className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <label className="block space-y-1 text-sm">
            <span className="text-slate-600">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-slate-600">Menu title</span>
            <input
              value={menuTitle}
              onChange={(e) => setMenuTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-slate-600">Slug</span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-slate-600">Meta description</span>
            <textarea
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
            Default page
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isHidden}
              onChange={(e) => setIsHidden(e.target.checked)}
            />
            Hidden page
          </label>
          <button
            type="button"
            onClick={() => void onDelete()}
            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
          >
            Delete page
          </button>
        </div>
        <div className="shrink-0 border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            disabled={loading}
            onClick={() => void onSubmit()}
            className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Saving…" : "Save page"}
          </button>
        </div>
      </aside>
    </div>
  );
}
