"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  VisualPageBuilder,
  type LinkPageOption,
  type PageSection,
} from "@/components/visual-page-builder";
import { parseStoredContent } from "@/lib/sections";

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

  async function onSubmit(e?: FormEvent) {
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
  }

  async function onDelete() {
    if (!confirm("Delete this page?")) return;
    const res = await fetch(`/api/pages/${page.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/admin/pages");
      router.refresh();
    }
  }

  return (
    <div className="space-y-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-white px-4 py-2">
        <button
          type="button"
          onClick={() => void onSubmit()}
          disabled={loading}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? "Saving…" : "Save page"}
        </button>
        <button
          type="button"
          onClick={() => setShowMeta((v) => !v)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          {showMeta ? "Hide settings" : "Page settings"}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
        >
          Delete
        </button>
        {status && <span className="text-sm text-slate-500">{status}</span>}
      </div>

      {showMeta && (
        <div className="mx-4 my-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm grid sm:grid-cols-2 gap-4">
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="text-slate-600">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-slate-600">Menu title</span>
            <input
              value={menuTitle}
              onChange={(e) => setMenuTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-slate-600">Slug</span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
            />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="text-slate-600">Meta description</span>
            <textarea
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              rows={2}
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
        </div>
      )}

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
      />
    </div>
  );
}
