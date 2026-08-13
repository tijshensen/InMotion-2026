import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { assertCanCreateSite } from "@/lib/access";
import { setActiveSiteId } from "@/lib/site-context";
import {
  getImportPrompt,
  importSiteFromUrl,
  saveImportPrompt,
} from "@/lib/import-from-url";

export const maxDuration = 180;

const bodySchema = z.object({
  organizationId: z.string().min(1),
  sourceUrl: z.string().url(),
  name: z.string().max(120).optional(),
  prompt: z.string().min(1).max(4000).optional(),
  savePromptAsDefault: z.boolean().optional(),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = bodySchema.parse(await req.json());
    const denied = await assertCanCreateSite(user, body.organizationId);
    if (denied) return denied;

    const prompt = (body.prompt || (await getImportPrompt())).trim();
    if (body.savePromptAsDefault) {
      await saveImportPrompt(prompt);
    }

    const result = await importSiteFromUrl({
      organizationId: body.organizationId,
      name: body.name,
      sourceUrl: body.sourceUrl,
      prompt,
      creatorUserId: user.id,
    });

    await setActiveSiteId(result.site.id);

    return NextResponse.json(
      {
        siteId: result.site.id,
        siteSlug: result.site.slug,
        pageId: result.pageId,
        templateId: result.templateId,
        sectionCount: result.sectionCount,
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
    const message = e instanceof Error ? e.message : "Import failed";
    console.error("[import-from-url]", e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
