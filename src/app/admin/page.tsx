import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export default async function AdminDashboard() {
  const user = await requireUser();

  const [sites, pages, users] = await Promise.all([
    prisma.site.count(),
    prisma.page.count(),
    prisma.user.count(),
  ]);

  const recentPages = await prisma.page.findMany({
    take: 5,
    orderBy: { updatedAt: "desc" },
    include: { site: true },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Welcome, {user.firstName}
        </h1>
        <p className="text-slate-500 mt-1">
          Multi-site CMS dashboard — rewrite of MotionCMS 3.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Sites", value: sites, href: "/admin/sites" },
          { label: "Pages", value: pages, href: "/admin/pages" },
          { label: "Users", value: users, href: "/admin" },
        ].map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-blue-200"
          >
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className="text-3xl font-semibold mt-1">{card.value}</p>
          </Link>
        ))}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold">Recently updated pages</h2>
          <Link href="/admin/pages" className="text-sm text-blue-600">
            View all
          </Link>
        </div>
        <ul className="divide-y divide-slate-100">
          {recentPages.length === 0 && (
            <li className="px-5 py-6 text-sm text-slate-500">No pages yet.</li>
          )}
          {recentPages.map((p) => (
            <li key={p.id}>
              <Link
                href={`/admin/pages/${p.id}`}
                className="flex items-center justify-between px-5 py-3 hover:bg-slate-50"
              >
                <div>
                  <p className="font-medium text-slate-900">{p.title}</p>
                  <p className="text-xs text-slate-500">
                    {p.site.name} · /{p.slug}
                  </p>
                </div>
                <span className="text-xs text-slate-400">
                  {p.updatedAt.toLocaleString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
