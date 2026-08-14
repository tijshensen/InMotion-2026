import { requireUser } from "@/lib/auth";
import {
  isPlatformSuperadmin,
  listOrganizationsForAdmin,
  listUserOrganizations,
} from "@/lib/access";
import { prisma } from "@/lib/db";
import { UsersAdminClient } from "./users-admin-client";

export default async function UsersAdminPage() {
  const user = await requireUser();
  const superadmin = isPlatformSuperadmin(user);

  const orgs = await listUserOrganizations(user.id);
  const ownedOrgIds = superadmin
    ? orgs.map((o) => o.id)
    : (
        await prisma.organizationMember.findMany({
          where: { userId: user.id, role: "OWNER" },
          select: { organizationId: true },
        })
      ).map((m) => m.organizationId);

  const canManage = superadmin || ownedOrgIds.length > 0;
  if (!canManage) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-slate-500 text-sm">
          Only organization owners and platform superadmins can manage users.
        </p>
      </div>
    );
  }

  const organizations = superadmin
    ? await prisma.organization.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        include: {
          sites: { select: { id: true, name: true, slug: true }, orderBy: { name: "asc" } },
          _count: { select: { members: true, sites: true } },
        },
      })
    : await prisma.organization.findMany({
        where: { id: { in: ownedOrgIds }, isActive: true },
        orderBy: { name: "asc" },
        include: {
          sites: { select: { id: true, name: true, slug: true }, orderBy: { name: "asc" } },
          _count: { select: { members: true, sites: true } },
        },
      });

  const users = superadmin
    ? await prisma.user.findMany({
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          createdAt: true,
          orgMemberships: {
            include: {
              organization: { select: { id: true, name: true } },
            },
          },
          memberships: {
            include: {
              site: { select: { id: true, name: true, slug: true } },
            },
          },
        },
      })
    : (
        await prisma.organizationMember.findMany({
          where: { organizationId: { in: ownedOrgIds } },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
                isActive: true,
                createdAt: true,
                orgMemberships: {
                  where: { organizationId: { in: ownedOrgIds } },
                  include: {
                    organization: { select: { id: true, name: true } },
                  },
                },
                memberships: {
                  where: { site: { organizationId: { in: ownedOrgIds } } },
                  include: {
                    site: { select: { id: true, name: true, slug: true } },
                  },
                },
              },
            },
          },
        })
      ).map((m) => m.user);

  // Dedupe users for non-superadmin multi-org owners
  const seen = new Set<string>();
  const uniqueUsers = users.filter((u) => {
    if (seen.has(u.id)) return false;
    seen.add(u.id);
    return true;
  });

  const adminOrgs = await listOrganizationsForAdmin(user.id);

  return (
    <UsersAdminClient
      currentUserId={user.id}
      isSuperadmin={superadmin}
      canCreateOrg={true}
      organizations={organizations.map((o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        sites: o.sites,
        memberCount: o._count.members,
        siteCount: o._count.sites,
      }))}
      initialOrgs={adminOrgs.map((o) => {
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
      initialUsers={uniqueUsers.map((u) => ({
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        isActive: u.isActive,
        createdAt: u.createdAt.toISOString(),
        orgs: u.orgMemberships.map((m) => ({
          id: m.organization.id,
          name: m.organization.name,
          role: m.role,
        })),
        sites: u.memberships.map((m) => ({
          id: m.site.id,
          name: m.site.name,
          slug: m.site.slug,
          role: m.role,
        })),
      }))}
    />
  );
}
