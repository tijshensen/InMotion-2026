import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { isPlatformSuperadmin, listUserOrganizations } from "@/lib/access";
import { slugifySite } from "@/lib/sites";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgs = await listUserOrganizations(user.id);
  return NextResponse.json(orgs);
}

const createSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().max(48).optional(),
  /** Make this user the owner (default: current user). Superadmin only for other users. */
  ownerUserId: z.string().optional(),
});

/** Create organization — superadmin always; any logged-in user may create their own org as OWNER. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = createSchema.parse(await req.json());
    let ownerId = user.id;
    if (body.ownerUserId && body.ownerUserId !== user.id) {
      if (!isPlatformSuperadmin(user)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      ownerId = body.ownerUserId;
    }

    const baseSlug = slugifySite(body.slug || body.name);
    if (!baseSlug) {
      return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
    }

    let slug = baseSlug;
    let n = 0;
    while (await prisma.organization.findUnique({ where: { slug } })) {
      n += 1;
      slug = `${baseSlug}-${n}`;
    }

    const org = await prisma.organization.create({
      data: {
        name: body.name.trim(),
        slug,
        members: {
          create: {
            userId: ownerId,
            role: "OWNER",
          },
        },
      },
      include: {
        members: { include: { user: { select: { id: true, email: true } } } },
        _count: { select: { sites: true, members: true } },
      },
    });

    return NextResponse.json(org, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: e.issues[0]?.message || "Invalid request" },
        { status: 400 },
      );
    }
    console.error("[organizations] create", e);
    return NextResponse.json({ error: "Could not create organization" }, { status: 500 });
  }
}
