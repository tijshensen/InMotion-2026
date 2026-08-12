import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

function normalizeTag(tag: string) {
  return tag
    .replace(/^\{\{\s*insert:/i, "")
    .replace(/\s*\}\}$/, "")
    .trim()
    .slice(0, 80);
}

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const insert = await prisma.insert.findUnique({
    where: { id },
    include: { site: { select: { id: true, name: true, slug: true } } },
  });
  if (!insert) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(insert);
}

const updateSchema = z.object({
  tag: z.string().min(1).optional(),
  content: z.string().optional(),
  onlyInRender: z.boolean().optional(),
  siteId: z.string().optional(),
});

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  try {
    const body = updateSchema.parse(await req.json());
    const current = await prisma.insert.findUnique({ where: { id } });
    if (!current) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const nextSiteId = body.siteId ?? current.siteId;
    const nextTag = body.tag !== undefined ? normalizeTag(body.tag) : current.tag;

    if (!nextTag) {
      return NextResponse.json({ error: "Invalid tag" }, { status: 400 });
    }

    if (nextTag !== current.tag || nextSiteId !== current.siteId) {
      const clash = await prisma.insert.findUnique({
        where: { siteId_tag: { siteId: nextSiteId, tag: nextTag } },
      });
      if (clash && clash.id !== id) {
        return NextResponse.json(
          { error: `Tag "{{insert:${nextTag}}}" already exists on this site` },
          { status: 409 },
        );
      }
    }

    const insert = await prisma.insert.update({
      where: { id },
      data: {
        tag: nextTag,
        siteId: nextSiteId,
        ...(body.content !== undefined ? { content: body.content } : {}),
        ...(body.onlyInRender !== undefined
          ? { onlyInRender: body.onlyInRender }
          : {}),
      },
      include: { site: { select: { id: true, name: true, slug: true } } },
    });

    return NextResponse.json(insert);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error("[inserts] update", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  await prisma.insert.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
