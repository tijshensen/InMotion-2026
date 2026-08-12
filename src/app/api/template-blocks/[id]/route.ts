import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const block = await prisma.templateBlock.findUnique({
    where: { id },
    include: { template: true },
  });
  if (!block) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(block);
}

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  defaultHtml: z.string().optional(),
  isRepeatable: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    const data = updateSchema.parse(await req.json());
    const block = await prisma.templateBlock.update({
      where: { id },
      data,
    });
    return NextResponse.json(block);
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
  // Unlink page blocks but keep their content as freeform if needed
  await prisma.pageBlock.updateMany({
    where: { templateBlockId: id },
    data: { templateBlockId: null },
  });
  await prisma.templateBlock.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
