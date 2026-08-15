import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { emptyItemContent } from "@/lib/section-repeat";
import { parseRepeatableBlocks, parseStoredContent } from "@/lib/sections";

type Ctx = { params: Promise<{ id: string; sectionId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: pageId, sectionId } = await ctx.params;
  const body = z
    .object({
      groupKey: z.string().min(1).optional(),
    })
    .parse(await req.json().catch(() => ({})));

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

  const templateHtml = block.templateBlock?.defaultHtml || "";
  const parsed = parseStoredContent(block.content, templateHtml);
  const source = parsed.layoutHtml || templateHtml;
  const wraps = parseRepeatableBlocks(source);
  const group =
    parsed.repeatGroups?.find((g) => g.key === body.groupKey) ||
    parsed.repeatGroups?.[0] ||
    (wraps.length
      ? {
          key: wraps[0].name,
          itemHtml: wraps[0].itemHtml,
        }
      : undefined);
  if (!group) {
    return NextResponse.json(
      { error: "This section has no repeatable group" },
      { status: 400 },
    );
  }

  const wrapInner =
    wraps.find((w) => w.name === group.key)?.itemHtml || group.itemHtml;

  const maxOrder = block.repeatItems
    .filter((i) => i.groupKey === group.key)
    .reduce((m, i) => Math.max(m, i.sortOrder), -1);

  const item = await prisma.pageBlockRepeatItem.create({
    data: {
      pageBlockId: block.id,
      groupKey: group.key,
      sortOrder: maxOrder + 1,
      origin: "added",
      content: emptyItemContent(wrapInner),
    },
  });

  return NextResponse.json(item, { status: 201 });
}
