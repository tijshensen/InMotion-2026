import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { assertSiteAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { formatServerImportError } from "@/lib/import-error";
import { suggestSectionPrompts } from "@/lib/suggest-section";

export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string; sectionId: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: pageId, sectionId } = await ctx.params;
  try {
    const page = await prisma.page.findUnique({
      where: { id: pageId },
      select: { siteId: true },
    });
    if (!page) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }
    const denied = await assertSiteAccess(user, page.siteId, "EDITOR");
    if (denied) return denied;

    const result = await suggestSectionPrompts({ pageId, sectionId });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[suggest-section]", e);
    return NextResponse.json(
      { error: formatServerImportError(e) },
      { status: 400 },
    );
  }
}
