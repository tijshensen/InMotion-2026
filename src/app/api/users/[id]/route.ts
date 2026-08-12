import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser, hashPassword } from "@/lib/auth";
import {
  canManageOrgUsers,
  isPlatformSuperadmin,
} from "@/lib/access";

type Ctx = { params: Promise<{ id: string }> };

async function actorCanEditUser(actorId: string, targetUserId: string) {
  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { role: true },
  });
  if (actor?.role === "SUPERADMIN") return true;
  if (actorId === targetUserId) return true; // self (limited fields enforced in PATCH)

  const targetOrgs = await prisma.organizationMember.findMany({
    where: { userId: targetUserId },
    select: { organizationId: true },
  });
  for (const o of targetOrgs) {
    if (await canManageOrgUsers(actorId, o.organizationId)) return true;
  }
  return false;
}

export async function PATCH(req: Request, ctx: Ctx) {
  const actor = await getSessionUser();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!(await actorCanEditUser(actor.id, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = z
      .object({
        firstName: z.string().min(1).max(80).optional(),
        lastName: z.string().min(1).max(80).optional(),
        email: z.string().email().optional(),
        password: z.string().min(8).max(100).optional(),
        role: z.enum(["SUPERADMIN", "ADMIN", "EDITOR", "VIEWER"]).optional(),
        isActive: z.boolean().optional(),
        orgRole: z.enum(["OWNER", "MEMBER"]).optional(),
        organizationId: z.string().optional(),
      })
      .parse(await req.json());

    const isSelf = actor.id === id;
    const isSuper = isPlatformSuperadmin(actor);

    const data: {
      firstName?: string;
      lastName?: string;
      email?: string;
      passwordHash?: string;
      role?: "SUPERADMIN" | "ADMIN" | "EDITOR" | "VIEWER";
      isActive?: boolean;
    } = {};

    if (body.firstName) data.firstName = body.firstName.trim();
    if (body.lastName) data.lastName = body.lastName.trim();
    if (body.password) data.passwordHash = await hashPassword(body.password);

    if (body.email && (isSuper || !isSelf)) {
      data.email = body.email.toLowerCase();
    }

    if (body.role !== undefined) {
      if (!isSuper) {
        return NextResponse.json(
          { error: "Only superadmins can change platform roles" },
          { status: 403 },
        );
      }
      data.role = body.role;
    }

    if (body.isActive !== undefined) {
      if (isSelf) {
        return NextResponse.json(
          { error: "Cannot deactivate yourself" },
          { status: 400 },
        );
      }
      if (!isSuper) {
        // Org owners can deactivate members of their org
        const ok = body.organizationId
          ? await canManageOrgUsers(actor.id, body.organizationId)
          : false;
        if (!ok) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      }
      data.isActive = body.isActive;
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
      },
    });

    if (body.orgRole && body.organizationId) {
      if (!(await canManageOrgUsers(actor.id, body.organizationId))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      await prisma.organizationMember.updateMany({
        where: { organizationId: body.organizationId, userId: id },
        data: { role: body.orgRole },
      });
    }

    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: e.issues[0]?.message || "Invalid request" },
        { status: 400 },
      );
    }
    console.error("[users] patch", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
