import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { assertSiteAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { normalizeClass, scanSimilarClasses } from "@/lib/style-presets";

type Ctx = { params: Promise<{ id: string }> };

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  className: z.string().trim().min(1).max(4000),
  tag: z.string().trim().max(40).optional(),
  exclude: z
    .object({
      pageBlockId: z.string().optional(),
      nid: z.string().optional(),
    })
    .optional(),
});

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: siteId } = await ctx.params;
  const denied = await assertSiteAccess(user, siteId, "VIEWER");
  if (denied) return denied;

  const presets = await prisma.stylePreset.findMany({
    where: { siteId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      className: true,
      tag: true,
      updatedAt: true,
    },
  });
  return NextResponse.json({ presets });
}

export async function POST(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: siteId } = await ctx.params;
  const denied = await assertSiteAccess(user, siteId, "EDITOR");
  if (denied) return denied;

  try {
    const body = createSchema.parse(await req.json());
    const className = normalizeClass(body.className);
    const tag = (body.tag || "").toLowerCase();

    const preset = await prisma.stylePreset.create({
      data: {
        siteId,
        name: body.name,
        className,
        tag,
      },
    });

    const matches = await scanSimilarClasses({
      siteId,
      className,
      tag,
      exclude: body.exclude,
    });

    return NextResponse.json({
      preset: {
        id: preset.id,
        name: preset.name,
        className: preset.className,
        tag: preset.tag,
      },
      matches,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: e.issues[0]?.message || "Invalid preset" },
        { status: 400 },
      );
    }
    console.error("[style-presets]", e);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
}
