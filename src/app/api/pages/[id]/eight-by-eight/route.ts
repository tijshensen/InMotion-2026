import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { assertSiteAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { scoreEightByEight } from "@/lib/eight-by-eight";

type Ctx = { params: Promise<{ id: string }> };

export const maxDuration = 60;

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const page = await prisma.page.findUnique({
    where: { id },
    select: {
      siteId: true,
      eightByEightScore: true,
      eightByEightBreakdown: true,
      eightByEightScoredAt: true,
      eightByEightVersion: true,
    },
  });
  if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const denied = await assertSiteAccess(user, page.siteId, "VIEWER");
  if (denied) return denied;

  let breakdown = null;
  if (page.eightByEightBreakdown) {
    try {
      breakdown = JSON.parse(page.eightByEightBreakdown);
    } catch {
      breakdown = null;
    }
  }
  return NextResponse.json({
    total: page.eightByEightScore,
    scoredAt: page.eightByEightScoredAt,
    version: page.eightByEightVersion,
    breakdown,
  });
}

export async function POST(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const page = await prisma.page.findUnique({
    where: { id },
    include: {
      template: { select: { coreHtml: true } },
      blocks: {
        orderBy: { sortOrder: "asc" },
        include: {
          templateBlock: { select: { name: true, defaultHtml: true } },
          repeatItems: {
            where: { isHidden: false },
            select: { isHidden: true, content: true },
          },
        },
      },
    },
  });
  if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const denied = await assertSiteAccess(user, page.siteId, "EDITOR");
  if (denied) return denied;

  const result = await scoreEightByEight({
    title: page.title,
    slug: page.slug,
    metaDescription: page.metaDescription,
    shellHtml: page.template?.coreHtml || "",
    blocks: page.blocks,
  });

  await prisma.page.update({
    where: { id },
    data: {
      eightByEightScore: result.total,
      eightByEightBreakdown: JSON.stringify(result),
      eightByEightScoredAt: new Date(),
      eightByEightVersion: result.version,
    },
  });

  return NextResponse.json(result);
}
