import { requireUser } from "@/lib/auth";
import {
  canCreateAnySite,
  isPlatformSuperadmin,
  listAccessibleSiteIds,
  listOwnedOrganizations,
} from "@/lib/access";
import { prisma } from "@/lib/db";
import { getImportPrompt } from "@/lib/import-from-url";
import { SitesAdminClient } from "./sites-admin-client";

export default async function SitesAdminPage() {
  const user = await requireUser();

  const ids = await listAccessibleSiteIds(user.id);
  const sites =
    ids === "all"
      ? await prisma.site.findMany({
          orderBy: { name: "asc" },
          include: {
            organization: { select: { name: true } },
            languages: { select: { code: true } },
            _count: { select: { pages: true, members: true, inserts: true } },
          },
        })
      : ids.length
        ? await prisma.site.findMany({
            where: { id: { in: ids } },
            orderBy: { name: "asc" },
            include: {
              organization: { select: { name: true } },
              languages: { select: { code: true } },
              _count: {
                select: { pages: true, members: true, inserts: true },
              },
            },
          })
        : [];

  const canCreate = await canCreateAnySite(user.id);
  const organizations = canCreate
    ? await listOwnedOrganizations(user.id)
    : [];
  const importPrompt = await getImportPrompt();

  return (
    <SitesAdminClient
      canCreate={canCreate}
      isSuperadmin={isPlatformSuperadmin(user)}
      importPrompt={importPrompt}
      hasXaiKey={Boolean(process.env.XAI_API_KEY)}
      organizations={organizations.map((o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
      }))}
      sites={sites.map((site) => ({
        id: site.id,
        name: site.name,
        slug: site.slug,
        domain: site.domain,
        cssFramework: site.cssFramework || "none",
        themeSlug: site.themeSlug || site.slug,
        lastGeneratedAt: site.lastGeneratedAt?.toISOString() ?? null,
        organizationName: site.organization?.name ?? null,
        pageCount: site._count.pages,
        memberCount: site._count.members,
        insertCount: site._count.inserts,
        languages: site.languages.map((l) => l.code).join(", "),
      }))}
    />
  );
}
