import Link from "next/link";
import { requireUser } from "@/lib/auth";

const nav = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/pages", label: "Pages" },
  { href: "/admin/sections", label: "Sections" },
  { href: "/admin/menus", label: "Menus" },
  { href: "/admin/media", label: "Media" },
  { href: "/admin/sites", label: "Sites" },
  { href: "/admin/inserts", label: "Inserts" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 shrink-0 border-r border-slate-200 bg-slate-900 text-slate-100 flex flex-col">
        <div className="px-5 py-5 border-b border-slate-800">
          <p className="text-xs uppercase tracking-wider text-slate-400">
            CMSinMotion
          </p>
          <p className="font-semibold">Admin</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/s/demo"
            target="_blank"
            className="block rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            Preview demo ↗
          </Link>
        </nav>
        <div className="p-4 border-t border-slate-800 text-sm">
          <p className="text-slate-300 truncate">
            {user.firstName} {user.lastName}
          </p>
          <p className="text-xs text-slate-500 truncate">{user.email}</p>
          <form action="/api/auth/logout" method="post" className="mt-3">
            <LogoutButton />
          </form>
        </div>
      </aside>
      <div className="flex-1 min-w-0">
        <div className="admin-main mx-auto max-w-5xl px-6 py-8">{children}</div>
      </div>
    </div>
  );
}

function LogoutButton() {
  return (
    <button
      formAction={async () => {
        "use server";
        const { destroySession } = await import("@/lib/auth");
        const { redirect } = await import("next/navigation");
        await destroySession();
        redirect("/login");
      }}
      className="text-xs text-slate-400 hover:text-white underline-offset-2 hover:underline"
    >
      Sign out
    </button>
  );
}
