import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  /** Optional destination site (defaults to same site) */
  siteId: z.string().optional(),
  /** Optional new tag (defaults to tag-copy / tag-copy-2 …) */
  tag: z.string().optional(),
});

async function uniqueTag(siteId: string, base: string) {
  let candidate = base;
  let n = 2;
  while (
    await prisma.insert.findUnique({
      where: { siteId_tag: { siteId, tag: candidate } },
    })
  ) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}

export async function POST(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  try {
    const body = bodySchema.parse(await req.json().catch(() => ({})));
    const source = await prisma.insert.findUnique({ where: { id } });
    if (!source) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const siteId = body.siteId || source.siteId;
    const site = await prisma.site.findUnique({ where: { id: siteId } });
    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    const baseTag = (body.tag || `${source.tag}-copy`)
      .replace(/^\{\{\s*insert:/i, "")
      .replace(/\s*\}\}$/, "")
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70);

    const tag = await uniqueTag(siteId, baseTag || "insert-copy");

    const insert = await prisma.insert.create({
      data: {
        siteId,
        tag,
        content: source.content,
        onlyInRender: source.onlyInRender,
      },
      include: { site: { select: { id: true, name: true, slug: true } } },
    });

    return NextResponse.json(insert, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error("[inserts] copy", e);
    return NextResponse.json({ error: "Copy failed" }, { status: 500 });
  }
}
