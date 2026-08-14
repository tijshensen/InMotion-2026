import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { emptyItemContent } from "@/lib/section-repeat";
import { parseStoredContent } from "@/lib/sections";

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

  const parsed = parseStoredContent(
    block.content,
    block.templateBlock?.defaultHtml || "",
  );
  const group =
    parsed.repeatGroups?.find((g) => g.key === body.groupKey) ||
    parsed.repeatGroups?.[0];
  if (!group) {
    return NextResponse.json(
      { error: "This section has no repeatable group" },
      { status: 400 },
    );
  }

  const maxOrder = block.repeatItems
    .filter((i) => i.groupKey === group.key)
    .reduce((m, i) => Math.max(m, i.sortOrder), -1);

  const item = await prisma.pageBlockRepeatItem.create({
    data: {
      pageBlockId: block.id,
      groupKey: group.key,
      sortOrder: maxOrder + 1,
      origin: "added",
      content: emptyItemContent(group.itemHtml),
    },
  });

  return NextResponse.json(item, { status: 201 });
}
