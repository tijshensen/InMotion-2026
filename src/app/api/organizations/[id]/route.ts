import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import {
  canManageOrganization,
  isPlatformSuperadmin,
} from "@/lib/access";
import { slugifySite } from "@/lib/sites";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const org = await prisma.organization.findUnique({
    where: { id },
    include: {
      _count: { select: { sites: true, members: true } },
      sites: {
        select: { id: true, name: true, slug: true },
        orderBy: { name: "asc" },
      },
      members: {
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
      },
    },
  });

  if (!org) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!(await canManageOrganization(user.id, id)) && !isPlatformSuperadmin(user)) {
    // Members may read basic org info if they belong
    const mem = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId: id, userId: user.id },
      },
    });
    if (!mem) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  return NextResponse.json(org);
}

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  slug: z.string().min(1).max(48).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!(await canManageOrganization(user.id, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = patchSchema.parse(await req.json());
    const data: { name?: string; slug?: string; isActive?: boolean } = {};

    if (body.name !== undefined) data.name = body.name.trim();
    if (body.isActive !== undefined) data.isActive = body.isActive;

    if (body.slug !== undefined) {
      const slug = slugifySite(body.slug);
      if (!slug) {
        return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
      }
      const clash = await prisma.organization.findFirst({
        where: { slug, NOT: { id } },
      });
      if (clash) {
        return NextResponse.json(
          { error: "Another organization already uses this slug" },
          { status: 400 },
        );
      }
      data.slug = slug;
    }

    const org = await prisma.organization.update({
      where: { id },
      data,
      include: {
        _count: { select: { sites: true, members: true } },
      },
    });

    return NextResponse.json(org);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: e.issues[0]?.message || "Invalid request" },
        { status: 400 },
      );
    }
    console.error("[organizations] patch", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

/**
 * Delete organization.
 * - Refuses if the org still has websites (detach or delete sites first).
 * - Superadmin or org OWNER only.
 */
export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!(await canManageOrganization(user.id, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const org = await prisma.organization.findUnique({
    where: { id },
    include: { _count: { select: { sites: true } } },
  });
  if (!org) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (org._count.sites > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete: ${org._count.sites} website(s) still belong to this organization. Move or delete those sites first.`,
        siteCount: org._count.sites,
      },
      { status: 400 },
    );
  }

  await prisma.organization.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
