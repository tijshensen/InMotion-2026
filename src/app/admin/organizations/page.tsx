import { requireUser } from "@/lib/auth";
import {
  isPlatformSuperadmin,
  listOrganizationsForAdmin,
} from "@/lib/access";
import { OrganizationsAdminClient } from "./organizations-admin-client";

export default async function OrganizationsAdminPage() {
  const user = await requireUser();
  const superadmin = isPlatformSuperadmin(user);
  const orgs = await listOrganizationsForAdmin(user.id);

  return (
    <OrganizationsAdminClient
      currentUserId={user.id}
      isSuperadmin={superadmin}
      // Anyone logged in may create their own workspace; superadmin always.
      canCreate={true}
      initialOrgs={orgs.map((o) => {
        const myRole =
          "myRole" in o && typeof o.myRole === "string"
            ? o.myRole
            : superadmin
              ? "OWNER"
              : "MEMBER";
        const canManage = superadmin || myRole === "OWNER";
        return {
          id: o.id,
          name: o.name,
          slug: o.slug,
          isActive: o.isActive,
          createdAt: o.createdAt.toISOString(),
          siteCount: o._count.sites,
          memberCount: o._count.members,
          myRole,
          canManage,
          owners: o.members.map((m) => ({
            id: m.user.id,
            email: m.user.email,
            name: `${m.user.firstName} ${m.user.lastName}`.trim(),
          })),
          sites: o.sites.map((s) => ({
            id: s.id,
            name: s.name,
            slug: s.slug,
          })),
        };
      })}
    />
  );
}
