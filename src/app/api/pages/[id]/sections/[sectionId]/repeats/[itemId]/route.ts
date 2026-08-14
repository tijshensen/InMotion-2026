import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { parseStoredContent, serializeContent } from "@/lib/sections";

type Ctx = {
  params: Promise<{ id: string; sectionId: string; itemId: string }>;
};

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: pageId, sectionId, itemId } = await ctx.params;
  const body = z
    .object({
      fields: z.record(z.string(), z.string()).optional(),
      isHidden: z.boolean().optional(),
      sortOrder: z.number().int().optional(),
    })
    .parse(await req.json());

  const item = await prisma.pageBlockRepeatItem.findFirst({
    where: {
      id: itemId,
      pageBlockId: sectionId,
      pageBlock: { pageId },
    },
  });
  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const parsed = parseStoredContent(item.content);
  const content = body.fields
    ? serializeContent({ fields: { ...parsed.fields, ...body.fields } })
    : item.content;

  const updated = await prisma.pageBlockRepeatItem.update({
    where: { id: item.id },
    data: {
      content,
      ...(body.isHidden !== undefined ? { isHidden: body.isHidden } : {}),
      ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: pageId, sectionId, itemId } = await ctx.params;

  const item = await prisma.pageBlockRepeatItem.findFirst({
    where: {
      id: itemId,
      pageBlockId: sectionId,
      pageBlock: { pageId },
    },
  });
  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  if (item.origin === "scraped") {
    const updated = await prisma.pageBlockRepeatItem.update({
      where: { id: item.id },
      data: { isHidden: true },
    });
    return NextResponse.json({ hidden: true, item: updated });
  }

  await prisma.pageBlockRepeatItem.delete({ where: { id: item.id } });
  return NextResponse.json({ ok: true, deleted: true });
}
