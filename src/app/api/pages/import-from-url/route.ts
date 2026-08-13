import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { assertSiteAccess } from "@/lib/access";
import { importPageFromUrl } from "@/lib/import-from-url";

export const maxDuration = 180;

const bodySchema = z.object({
  siteId: z.string().min(1),
  languageId: z.string().min(1),
  sourceUrl: z.string().url(),
  title: z.string().optional(),
  slug: z.string().optional(),
  menuTitle: z.string().optional(),
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
      sourceUrl: body.sourceUrl,
      title: body.title,
      slug: body.slug,
      menuTitle: body.menuTitle,
      creatorUserId: user.id,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: e.issues[0]?.message || "Invalid request" },
        { status: 400 },
      );
    }
    const message = e instanceof Error ? e.message : "Import failed";
    console.error("[import-from-url]", e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
