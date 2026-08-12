import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getActiveSite } from "@/lib/site-context";
import { siteHasUnpublishedChanges } from "@/lib/publish-status";
import { AdminShell } from "@/components/admin-shell";

const nav = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/pages", label: "Pages" },
  { href: "/admin/templates", label: "Page templates" },
  { href: "/admin/sections", label: "Sections" },
  { href: "/admin/menus", label: "Menus" },
  { href: "/admin/media", label: "Media" },
  { href: "/admin/inserts", label: "Inserts" },
  { href: "/admin/sites", label: "Websites" },
  { href: "/admin/organizations", label: "Organizations" },
  { href: "/admin/users", label: "Users" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const active = await getActiveSite();

  const pages = active
    ? await prisma.page.findMany({
        where: { siteId: active.id },
        orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
        select: {
          id: true,
          title: true,
          menuTitle: true,
          slug: true,
          isHidden: true,
          isDefault: true,
        },
      })
    : [];

  const publish = active
    ? await siteHasUnpublishedChanges(active.id)
    : { hasChanges: false, lastGeneratedAt: null, lastContentAt: null };

  return (
    <AdminShell
      user={{
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
      }}
      activeSite={
        active
          ? {
              id: active.id,
              name: active.name,
              slug: active.slug,
              cssFramework: active.cssFramework,
              lastGeneratedAt: active.lastGeneratedAt?.toISOString() ?? null,
            }
          : null
      }
      pages={pages}
      hasUnpublishedChanges={publish.hasChanges}
      nav={nav}
    >
      {children}
    </AdminShell>
  );
}
