import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string; sectionId: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: pageId, sectionId } = await ctx.params;
  await prisma.pageBlock.deleteMany({
    where: { id: sectionId, pageId },
  });
  return NextResponse.json({ ok: true });
}
