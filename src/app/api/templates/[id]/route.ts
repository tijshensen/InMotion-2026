import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const template = await prisma.template.findUnique({
    where: { id },
    include: {
      templateSet: { select: { id: true, name: true, siteId: true } },
      blocks: { orderBy: { sortOrder: "asc" } },
      _count: { select: { blocks: true, pages: true } },
    },
  });
  if (!template) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(template);
}

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  coreHtml: z.string().optional(),
  menuHtml: z.string().optional(),
  submenuHtml: z.string().optional(),
});

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  try {
    const data = patchSchema.parse(await req.json());
    const template = await prisma.template.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.coreHtml !== undefined ? { coreHtml: data.coreHtml } : {}),
        ...(data.menuHtml !== undefined ? { menuHtml: data.menuHtml } : {}),
        ...(data.submenuHtml !== undefined
          ? { submenuHtml: data.submenuHtml }
          : {}),
      },
      include: {
        templateSet: { select: { id: true, name: true, siteId: true } },
        _count: { select: { blocks: true, pages: true } },
      },
    });
    return NextResponse.json(template);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const pages = await prisma.page.count({ where: { templateId: id } });
  if (pages > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete: ${pages} page(s) still use this template. Reassign pages first.`,
      },
      { status: 400 },
    );
  }

  // Detach page blocks that reference template blocks, then delete blocks + template
  const blocks = await prisma.templateBlock.findMany({
    where: { templateId: id },
    select: { id: true },
  });
  const blockIds = blocks.map((b) => b.id);
  if (blockIds.length) {
    await prisma.pageBlock.updateMany({
      where: { templateBlockId: { in: blockIds } },
      data: { templateBlockId: null },
    });
    await prisma.templateBlock.deleteMany({
      where: { templateId: id },
    });
  }
  await prisma.template.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
