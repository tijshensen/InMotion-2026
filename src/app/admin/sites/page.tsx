import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import Link from "next/link";

export default async function SitesAdminPage() {
  await requireUser();

  const sites = await prisma.site.findMany({
    include: {
      languages: true,
      _count: { select: { pages: true, members: true, inserts: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">All websites</h1>
        <p className="text-slate-500 mt-1">
          Each site has its own CSS framework (Bootstrap, Tailwind, or custom),
          templates, pages, and theme assets. Use the top selector to focus the
          admin on one website.
        </p>
      </div>

      <div className="grid gap-4">
        {sites.map((site) => (
          <div
            key={site.id}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex flex-wrap items-center justify-between gap-4"
          >
            <div>
              <h2 className="font-semibold text-lg">{site.name}</h2>
              <p className="text-sm text-slate-500">
                slug: <code className="text-xs">{site.slug}</code>
                {site.domain ? ` · ${site.domain}` : ""}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Framework:{" "}
                <strong className="text-slate-600">
                  {site.cssFramework || "none"}
                </strong>
                {" · "}
                theme:{" "}
                <code className="text-xs">
                  /theme/{site.themeSlug || site.slug}/
                </code>
                {site.lastGeneratedAt
                  ? ` · generated ${site.lastGeneratedAt.toLocaleString()}`
                  : " · not generated yet"}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {site._count.pages} pages · {site._count.members} members ·{" "}
                {site.languages.map((l) => l.code).join(", ")} ·{" "}
                {site._count.inserts} inserts
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/s/${site.slug}`}
                target="_blank"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
              >
                Live ↗
              </Link>
              {site.lastGeneratedAt && (
                <Link
                  href={`/sites/${site.slug}`}
                  target="_blank"
                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 hover:bg-emerald-100"
                >
                  Generated ↗
                </Link>
              )}
              <Link
                href="/admin/pages"
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
              >
                Manage pages
              </Link>
            </div>
          </div>
        ))}
        {sites.length === 0 && (
          <p className="text-slate-500 text-sm">
            No sites. Run <code>npm run db:seed</code>.
          </p>
        )}
      </div>
    </div>
  );
}
