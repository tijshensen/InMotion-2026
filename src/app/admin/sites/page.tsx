import { requireUser } from "@/lib/auth";
import {
  canCreateAnySite,
  isPlatformSuperadmin,
  listAccessibleSiteIds,
  listOwnedOrganizations,
} from "@/lib/access";
import { prisma } from "@/lib/db";
import { getImportPrompt } from "@/lib/import-from-url";
import { getActiveSiteId } from "@/lib/site-context";
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
            languages: {
              select: { id: true, name: true, code: true, isDefault: true },
              orderBy: { name: "asc" },
            },
            _count: { select: { pages: true, members: true, inserts: true } },
          },
        })
      : ids.length
        ? await prisma.site.findMany({
            where: { id: { in: ids } },
            orderBy: { name: "asc" },
            include: {
              organization: { select: { name: true } },
              languages: {
              select: { id: true, name: true, code: true, isDefault: true },
              orderBy: { name: "asc" },
            },
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
  const activeSiteId = (await getActiveSiteId()) || sites[0]?.id || "";

  return (
    <SitesAdminClient
      canCreate={canCreate}
      isSuperadmin={isPlatformSuperadmin(user)}
      importPrompt={importPrompt}
      hasXaiKey={Boolean(process.env.XAI_API_KEY)}
      activeSiteId={activeSiteId}
      organizations={organizations.map((o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
      }))}
      sites={sites.map((site) => ({
        id: site.id,
        name: site.name,
        siteTitle: site.siteTitle || site.name,
        logoPath: site.logoPath || "",
        slug: site.slug,
        domain: site.domain,
        cssFramework: site.cssFramework || "none",
        themeSlug: site.themeSlug || site.slug,
        lastGeneratedAt: site.lastGeneratedAt?.toISOString() ?? null,
        cloudflareProject: site.cloudflareProject || "",
        cloudflareUrl: site.cloudflareUrl || "",
        organizationName: site.organization?.name ?? null,
        pageCount: site._count.pages,
        memberCount: site._count.members,
        insertCount: site._count.inserts,
        multiLanguage: site.multiLanguage,
        languages: site.languages,
      }))}
    />
  );
}
