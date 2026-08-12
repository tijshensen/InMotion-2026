import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser, hashPassword } from "@/lib/auth";
import {
  canManageOrgUsers,
  isPlatformSuperadmin,
} from "@/lib/access";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const organizationId = searchParams.get("organizationId");

  if (isPlatformSuperadmin(user) && !organizationId) {
    const users = await prisma.user.findMany({
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
            organization: { select: { id: true, name: true, slug: true } },
          },
        },
        memberships: {
          include: {
            site: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });
    return NextResponse.json(users);
  }

  if (!organizationId) {
    return NextResponse.json(
      { error: "organizationId required" },
      { status: 400 },
    );
  }

  if (!(await canManageOrgUsers(user.id, organizationId))) {
    // Allow org members to list colleagues read-only? Owners only for now.
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId, userId: user.id },
      },
    });
    if (!membership && !isPlatformSuperadmin(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const members = await prisma.organizationMember.findMany({
    where: { organizationId },
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
          memberships: {
            where: { site: { organizationId } },
            include: {
              site: { select: { id: true, name: true, slug: true } },
            },
          },
        },
      },
    },
    orderBy: { user: { lastName: "asc" } },
  });

  return NextResponse.json(
    members.map((m) => ({
      ...m.user,
      orgRole: m.role,
      organizationId: m.organizationId,
    })),
  );
}

const createSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  password: z.string().min(8).max(100),
  /** Platform role — only superadmin may set SUPERADMIN */
  role: z.enum(["SUPERADMIN", "ADMIN", "EDITOR", "VIEWER"]).optional(),
  organizationId: z.string().min(1),
  orgRole: z.enum(["OWNER", "MEMBER"]).optional(),
  /** Optional site memberships within the org */
  siteIds: z.array(z.string()).optional(),
  siteRole: z.enum(["ADMIN", "EDITOR", "VIEWER"]).optional(),
});

export async function POST(req: Request) {
  const actor = await getSessionUser();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = createSchema.parse(await req.json());

    if (!(await canManageOrgUsers(actor.id, body.organizationId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let platformRole = body.role || "EDITOR";
    if (platformRole === "SUPERADMIN" && !isPlatformSuperadmin(actor)) {
      platformRole = "EDITOR";
    }

    const existing = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase() },
    });
    if (existing) {
      return NextResponse.json(
        { error: "A user with this email already exists" },
        { status: 400 },
      );
    }

    const orgSites = await prisma.site.findMany({
      where: { organizationId: body.organizationId },
      select: { id: true },
    });
    const allowedSiteIds = new Set(orgSites.map((s) => s.id));
    const siteIds = (body.siteIds || []).filter((id) => allowedSiteIds.has(id));
    const siteRole = body.siteRole || "EDITOR";
    const orgRole = body.orgRole || "MEMBER";

    const passwordHash = await hashPassword(body.password);

    const created = await prisma.user.create({
      data: {
        email: body.email.toLowerCase(),
        firstName: body.firstName.trim(),
        lastName: body.lastName.trim(),
        passwordHash,
        role: platformRole,
        orgMemberships: {
          create: {
            organizationId: body.organizationId,
            role: orgRole,
          },
        },
        memberships:
          siteIds.length > 0
            ? {
                create: siteIds.map((siteId) => ({
                  siteId,
                  role: siteRole,
                })),
              }
            : undefined,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: e.issues[0]?.message || "Invalid request" },
        { status: 400 },
      );
    }
    console.error("[users] create", e);
    return NextResponse.json({ error: "Could not create user" }, { status: 500 });
  }
}
