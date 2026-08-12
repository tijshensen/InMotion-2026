"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type PageRow = {
  id: string;
  title: string;
  slug: string;
  isHidden: boolean;
  isDefault: boolean;
  siteId: string;
  site: { id: string; name: string; slug: string };
  _count: { blocks: number };
};

type SiteOpt = { id: string; name: string; slug: string };

export function PagesTable({
  pages,
  sites,
  defaultSiteId,
}: {
  pages: PageRow[];
  sites: SiteOpt[];
  defaultSiteId?: string;
}) {
  const preferred =
    defaultSiteId ||
    sites.find((s) => s.slug === "kiekeboe")?.id ||
    sites[0]?.id ||
    "";
  const [siteId, setSiteId] = useState(preferred);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    return pages.filter((p) => {
      if (siteId && p.siteId !== siteId) return false;
      if (!q.trim()) return true;
      const needle = q.toLowerCase();
      return (
        p.title.toLowerCase().includes(needle) ||
        p.slug.toLowerCase().includes(needle)
      );
    });
  }, [pages, siteId, q]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 items-end">
        <label className="text-sm space-y-1">
          <span className="text-slate-600">Site</span>
          <select
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="block rounded-lg border border-slate-200 px-3 py-2 min-w-[14rem]"
          >
            <option value="">All sites</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm space-y-1 flex-1 min-w-[12rem]">
          <span className="text-slate-600">Search</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Title or slug…"
            className="block w-full rounded-lg border border-slate-200 px-3 py-2"
          />
        </label>
        <p className="text-sm text-slate-500 pb-2">
          {filtered.length} page{filtered.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Site</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">Blocks</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Edit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/pages/${p.id}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {p.title || "(untitled)"}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{p.site.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">
                  /{p.slug}
                </td>
                <td className="px-4 py-3">
                  {p._count.blocks > 0 ? (
                    <span className="text-emerald-600">{p._count.blocks}</span>
                  ) : (
                    <span className="text-amber-600">0</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {p.isHidden ? (
                    <span className="text-amber-600">Hidden</span>
                  ) : p.isDefault ? (
                    <span className="text-emerald-600">Default</span>
                  ) : (
                    <span className="text-slate-400">Published</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/pages/${p.id}`}
                    className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
                  >
                    Builder
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  No pages match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
