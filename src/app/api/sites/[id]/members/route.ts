import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { canAccessSite, canManageOrgUsers, isPlatformSuperadmin } from "@/lib/access";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: siteId } = await ctx.params;

  if (!(await canAccessSite(user.id, siteId, "VIEWER"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const members = await prisma.siteMember.findMany({
    where: { siteId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          isActive: true,
        },
      },
    },
  });

  return NextResponse.json(members);
}

const bodySchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["ADMIN", "EDITOR", "VIEWER"]).default("EDITOR"),
});

/** Assign or update a user's role on this site. */
export async function POST(req: Request, ctx: Ctx) {
  const actor = await getSessionUser();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: siteId } = await ctx.params;

  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const allowed =
    isPlatformSuperadmin(actor) ||
    (site.organizationId
      ? await canManageOrgUsers(actor.id, site.organizationId)
      : false) ||
    (await canAccessSite(actor.id, siteId, "ADMIN"));

  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = bodySchema.parse(await req.json());

    const member = await prisma.siteMember.upsert({
      where: {
        siteId_userId: { siteId, userId: body.userId },
      },
      create: {
        siteId,
        userId: body.userId,
        role: body.role,
      },
      update: { role: body.role },
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
    });

    // Ensure they belong to the org as MEMBER if not already
    if (site.organizationId) {
      await prisma.organizationMember.upsert({
        where: {
          organizationId_userId: {
            organizationId: site.organizationId,
            userId: body.userId,
          },
        },
        create: {
          organizationId: site.organizationId,
          userId: body.userId,
          role: "MEMBER",
        },
        update: {},
      });
    }

    return NextResponse.json(member, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: e.issues[0]?.message || "Invalid request" },
        { status: 400 },
      );
    }
    console.error("[site members]", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const actor = await getSessionUser();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: siteId } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const allowed =
    isPlatformSuperadmin(actor) ||
    (site.organizationId
      ? await canManageOrgUsers(actor.id, site.organizationId)
      : false) ||
    (await canAccessSite(actor.id, siteId, "ADMIN"));

  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.siteMember.deleteMany({ where: { siteId, userId } });
  return NextResponse.json({ ok: true });
}
