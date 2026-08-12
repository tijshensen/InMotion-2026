/**
 * Multi-tenant access control:
 * - SUPERADMIN (platform) → all orgs & sites
 * - Organization OWNER → all sites in that org + create sites
 * - SiteMember → role on specific site (ADMIN / EDITOR / VIEWER)
 * - Org MEMBER without SiteMember → no site access until assigned
 */

import { NextResponse } from "next/server";
import type { OrgRole, Role, Site, User } from "@prisma/client";
import { prisma } from "./db";
import type { SessionUser } from "./auth";

export type SiteAccessRole = Role; // ADMIN | EDITOR | VIEWER (+ SUPERADMIN for bypass)

const ROLE_RANK: Record<Role, number> = {
  VIEWER: 1,
  EDITOR: 2,
  ADMIN: 3,
  SUPERADMIN: 4,
};

export function roleAtLeast(have: Role, need: Role): boolean {
  return ROLE_RANK[have] >= ROLE_RANK[need];
}

export function isPlatformSuperadmin(user: Pick<User, "role"> | SessionUser) {
  return user.role === "SUPERADMIN";
}

/** Sites the user may open in the admin switcher / work on. */
export async function listAccessibleSiteIds(userId: string): Promise<string[] | "all"> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });
  if (!user || !user.isActive) return [];
  if (user.role === "SUPERADMIN") return "all";

  const ownedOrgs = await prisma.organizationMember.findMany({
    where: { userId, role: "OWNER", organization: { isActive: true } },
    select: { organizationId: true },
  });
  const ownedOrgIds = ownedOrgs.map((o) => o.organizationId);

  const fromOwned =
    ownedOrgIds.length > 0
      ? await prisma.site.findMany({
          where: { organizationId: { in: ownedOrgIds }, isActive: true },
          select: { id: true },
        })
      : [];

  const memberships = await prisma.siteMember.findMany({
    where: { userId, site: { isActive: true } },
    select: { siteId: true },
  });

  return [...new Set([...fromOwned.map((s) => s.id), ...memberships.map((m) => m.siteId)])];
}

export async function listAccessibleSites(userId: string) {
  const ids = await listAccessibleSiteIds(userId);
  if (ids === "all") {
    return prisma.site.findMany({
      orderBy: { name: "asc" },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
      },
    });
  }
  if (!ids.length) return [];
  return prisma.site.findMany({
    where: { id: { in: ids } },
    orderBy: { name: "asc" },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
    },
  });
}

/**
 * Highest role the user has on a site, or null if no access.
 * SUPERADMIN → SUPERADMIN; org OWNER → ADMIN; else SiteMember.role.
 */
export async function getSiteAccess(
  userId: string,
  siteId: string,
): Promise<Role | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });
  if (!user || !user.isActive) return null;
  if (user.role === "SUPERADMIN") return "SUPERADMIN";

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { id: true, organizationId: true, isActive: true },
  });
  if (!site || !site.isActive) return null;

  if (site.organizationId) {
    const orgMem = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: site.organizationId,
          userId,
        },
      },
    });
    if (orgMem?.role === "OWNER") return "ADMIN";
  }

  const mem = await prisma.siteMember.findUnique({
    where: { siteId_userId: { siteId, userId } },
  });
  return mem?.role ?? null;
}

export async function canAccessSite(
  userId: string,
  siteId: string,
  minRole: Role = "VIEWER",
): Promise<boolean> {
  const role = await getSiteAccess(userId, siteId);
  if (!role) return false;
  return roleAtLeast(role, minRole);
}

/** Org OWNER or SUPERADMIN may create sites in that organization. */
export async function canCreateSiteInOrg(
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });
  if (!user || !user.isActive) return false;
  if (user.role === "SUPERADMIN") return true;

  const mem = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId, userId },
    },
  });
  return mem?.role === "OWNER";
}

/** True if user can create a site somewhere (any owned org, or superadmin). */
export async function canCreateAnySite(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });
  if (!user || !user.isActive) return false;
  if (user.role === "SUPERADMIN") return true;

  const owned = await prisma.organizationMember.count({
    where: { userId, role: "OWNER", organization: { isActive: true } },
  });
  return owned > 0;
}

export async function listOwnedOrganizations(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (user?.role === "SUPERADMIN") {
    return prisma.organization.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
  }
  const memberships = await prisma.organizationMember.findMany({
    where: { userId, role: "OWNER", organization: { isActive: true } },
    include: { organization: true },
    orderBy: { organization: { name: "asc" } },
  });
  return memberships.map((m) => m.organization);
}

/** Organizations the user belongs to (any role). Superadmin → all. */
export async function listUserOrganizations(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (user?.role === "SUPERADMIN") {
    return prisma.organization.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { sites: true, members: true } },
      },
    });
  }
  const memberships = await prisma.organizationMember.findMany({
    where: { userId, organization: { isActive: true } },
    include: {
      organization: {
        include: {
          _count: { select: { sites: true, members: true } },
        },
      },
    },
  });
  return memberships.map((m) => ({
    ...m.organization,
    myRole: m.role as OrgRole,
  }));
}

/**
 * Whether the actor may manage users in an organization
 * (invite, change roles, assign sites).
 */
export async function canManageOrgUsers(
  actorId: string,
  organizationId: string,
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: actorId },
    select: { role: true, isActive: true },
  });
  if (!user || !user.isActive) return false;
  if (user.role === "SUPERADMIN") return true;

  const mem = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId, userId: actorId },
    },
  });
  return mem?.role === "OWNER";
}

/** Edit org name/slug/active or delete (same as manage users: owner or superadmin). */
export async function canManageOrganization(
  actorId: string,
  organizationId: string,
): Promise<boolean> {
  return canManageOrgUsers(actorId, organizationId);
}

/** Detailed org list for admin Organizations UI. */
export async function listOrganizationsForAdmin(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });
  if (!user || !user.isActive) return [];

  if (user.role === "SUPERADMIN") {
    return prisma.organization.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { sites: true, members: true } },
        members: {
          where: { role: "OWNER" },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
          take: 5,
        },
        sites: {
          select: { id: true, name: true, slug: true },
          orderBy: { name: "asc" },
          take: 20,
        },
      },
    });
  }

  const memberships = await prisma.organizationMember.findMany({
    where: { userId },
    select: { organizationId: true, role: true },
  });
  if (!memberships.length) return [];

  const orgs = await prisma.organization.findMany({
    where: { id: { in: memberships.map((m) => m.organizationId) } },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { sites: true, members: true } },
      members: {
        where: { role: "OWNER" },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        take: 5,
      },
      sites: {
        select: { id: true, name: true, slug: true },
        orderBy: { name: "asc" },
        take: 20,
      },
    },
  });

  const roleByOrg = new Map(memberships.map((m) => [m.organizationId, m.role]));
  return orgs.map((o) => ({
    ...o,
    myRole: roleByOrg.get(o.id) ?? "MEMBER",
  }));
}

/** API helper: 401 / 403 / null when OK. */
export async function assertSiteAccess(
  user: SessionUser | null,
  siteId: string,
  minRole: Role = "VIEWER",
): Promise<NextResponse | null> {
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ok = await canAccessSite(user.id, siteId, minRole);
  if (!ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function assertCanCreateSite(
  user: SessionUser | null,
  organizationId: string,
): Promise<NextResponse | null> {
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ok = await canCreateSiteInOrg(user.id, organizationId);
  if (!ok) {
    return NextResponse.json(
      { error: "Only organization owners can create sites" },
      { status: 403 },
    );
  }
  return null;
}

export type { Site };
