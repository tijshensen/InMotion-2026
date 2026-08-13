import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { assertSiteAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { previewPageImport } from "@/lib/import-page-from-url";

export const maxDuration = 30;

const bodySchema = z.object({
  siteId: z.string().min(1),
  sourceUrl: z.string().url(),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = bodySchema.parse(await req.json());
    const denied = await assertSiteAccess(user, body.siteId, "EDITOR");
    if (denied) return denied;

    const site = await prisma.site.findUnique({
      where: { id: body.siteId },
      select: { cssFramework: true },
    });
    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    const pageCount = await prisma.page.count({
      where: { siteId: body.siteId },
    });

    const preview = await previewPageImport({
      sourceUrl: body.sourceUrl,
      siteFramework: site.cssFramework,
      isFirstPage: pageCount === 0,
    });
    return NextResponse.json(preview);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: e.issues[0]?.message || "Invalid request" },
        { status: 400 },
      );
    }
    const message = e instanceof Error ? e.message : "Could not check URL";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
