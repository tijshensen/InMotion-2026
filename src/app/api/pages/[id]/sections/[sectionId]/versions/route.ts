import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { assertSiteAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { listSectionVersions } from "@/lib/improve-section";

type Ctx = { params: Promise<{ id: string; sectionId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: pageId, sectionId } = await ctx.params;
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    select: { siteId: true },
  });
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });
  const denied = await assertSiteAccess(user, page.siteId, "EDITOR");
  if (denied) return denied;

  const block = await prisma.pageBlock.findFirst({
    where: { id: sectionId, pageId },
    select: { id: true },
  });
  if (!block) {
    return NextResponse.json({ error: "Section not found" }, { status: 404 });
  }
  const versions = await listSectionVersions(block.id);
  return NextResponse.json({ versions });
}
