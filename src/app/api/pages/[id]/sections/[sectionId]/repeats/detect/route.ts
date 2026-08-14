import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { applyExtractToContent } from "@/lib/section-repeat";
import { serializeContent } from "@/lib/sections";

type Ctx = { params: Promise<{ id: string; sectionId: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: pageId, sectionId } = await ctx.params;

  const block = await prisma.pageBlock.findFirst({
    where: { id: sectionId, pageId },
    include: {
      templateBlock: true,
      repeatItems: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!block) {
    return NextResponse.json({ error: "Section not found" }, { status: 404 });
  }

  if (block.repeatItems.length) {
    return NextResponse.json({ block, detected: false });
  }

  const templateHtml = block.templateBlock?.defaultHtml || "";
  const result = applyExtractToContent(block.content, templateHtml);
  if (!result.detected) {
    const refreshed = await prisma.pageBlock.findFirst({
      where: { id: block.id },
      include: {
        templateBlock: true,
        repeatItems: { orderBy: { sortOrder: "asc" } },
      },
    });
    return NextResponse.json({ block: refreshed, detected: false });
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.pageBlock.update({
      where: { id: block.id },
      data: { content: result.content },
    });
    if (result.items.length) {
      await tx.pageBlockRepeatItem.createMany({
        data: result.items.map((item, i) => ({
          pageBlockId: block.id,
          groupKey: item.groupKey,
          sortOrder: i,
          origin: "scraped",
          content: serializeContent({ fields: item.fields }),
        })),
      });
    }
    return tx.pageBlock.findFirst({
      where: { id: block.id },
      include: {
        templateBlock: true,
        repeatItems: { orderBy: { sortOrder: "asc" } },
      },
    });
  });

  return NextResponse.json({ block: updated, detected: true });
}
