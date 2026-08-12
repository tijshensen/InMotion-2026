import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const page = await prisma.page.findUnique({
    where: { id },
    include: {
      blocks: {
        orderBy: { sortOrder: "asc" },
        include: { templateBlock: true },
      },
      language: true,
      template: true,
      site: true,
    },
  });

  if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(page);
}

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  menuTitle: z.string().optional(),
  slug: z.string().min(1).optional(),
  metaDescription: z.string().optional(),
  isHidden: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  blocks: z
    .array(
      z.object({
        id: z.string(),
        content: z.string(),
        css: z.string().optional(),
        isHidden: z.boolean().optional(),
      }),
    )
    .optional(),
});

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;

  try {
    const data = updateSchema.parse(await req.json());

    if (data.blocks) {
      await Promise.all(
        data.blocks.map((b) =>
          prisma.pageBlock.update({
            where: { id: b.id },
            data: {
              content: b.content,
              css: b.css ?? undefined,
              isHidden: b.isHidden ?? undefined,
            },
          }),
        ),
      );
    }

    const page = await prisma.page.update({
      where: { id },
      data: {
        title: data.title,
        menuTitle: data.menuTitle,
        slug: data.slug?.toLowerCase(),
        metaDescription: data.metaDescription,
        isHidden: data.isHidden,
        isDefault: data.isDefault,
        sortOrder: data.sortOrder,
      },
      include: {
        blocks: {
          orderBy: { sortOrder: "asc" },
          include: { templateBlock: true },
        },
      },
    });

    return NextResponse.json(page);
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
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  await prisma.page.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
