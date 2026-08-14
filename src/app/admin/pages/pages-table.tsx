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

export function PagesTable({ pages }: { pages: PageRow[] }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    return pages.filter((p) => {
      if (!q.trim()) return true;
      const needle = q.toLowerCase();
      return (
        p.title.toLowerCase().includes(needle) ||
        p.slug.toLowerCase().includes(needle)
      );
    });
  }, [pages, q]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 items-end">
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
                    prefetch={false}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {p.title || "(untitled)"}
                  </Link>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">
                  {p.slug}
                </td>
                <td className="px-4 py-3 text-slate-600">{p._count.blocks}</td>
                <td className="px-4 py-3">
                  {p.isDefault && (
                    <span className="mr-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">
                      default
                    </span>
                  )}
                  {p.isHidden && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">
                      hidden
                    </span>
                  )}
                  {!p.isDefault && !p.isHidden && (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/pages/${p.id}`}
                    prefetch={false}
                    className="text-blue-600 hover:underline"
                  >
                    Builder
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No pages match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
