import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { assertSiteAccess } from "@/lib/access";
import { importPageFromUrl } from "@/lib/import-page-from-url";

export const maxDuration = 180;

const bodySchema = z.object({
  siteId: z.string().min(1),
  languageId: z.string().min(1),
  templateId: z.string().optional().nullable(),
  title: z.string().optional(),
  slug: z.string().optional(),
  menuTitle: z.string().optional(),
  sourceUrl: z.string().url(),
  rewrite: z.boolean().optional(),
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

    const result = await importPageFromUrl({
      siteId: body.siteId,
      languageId: body.languageId,
      templateId: body.templateId,
      title: body.title,
      slug: body.slug,
      menuTitle: body.menuTitle,
      sourceUrl: body.sourceUrl,
      rewrite: Boolean(body.rewrite),
      creatorUserId: user.id,
    });

    return NextResponse.json(
      {
        pageId: result.page.id,
        sectionCount: result.sectionCount,
        rewritten: result.rewritten,
        sourceFramework: result.sourceFramework,
        siteFramework: result.siteFramework,
      },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: e.issues[0]?.message || "Invalid request" },
        { status: 400 },
      );
    }
    if (e instanceof Error && e.message === "FRAMEWORK_MISMATCH") {
      const preview = (e as Error & { preview?: unknown }).preview;
      return NextResponse.json(
        { error: "Framework mismatch", needsRewrite: true, preview },
        { status: 409 },
      );
    }
    const message = e instanceof Error ? e.message : "Import failed";
    console.error("[import-page-from-url]", e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
