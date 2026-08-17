import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { assertSiteAccess } from "@/lib/access";
import {
  getImportPrompt,
  importTemplateFromUrl,
  saveImportPrompt,
} from "@/lib/import-from-url";
import { formatServerImportError } from "@/lib/import-error";

export const maxDuration = 180;

const bodySchema = z.object({
  siteId: z.string().min(1),
  sourceUrl: z.string().url(),
  name: z.string().max(200).optional(),
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
    const denied = await assertSiteAccess(user, body.siteId, "EDITOR");
    if (denied) return denied;

    const prompt = (body.prompt || (await getImportPrompt())).trim();
    if (body.savePromptAsDefault && user.role === "SUPERADMIN") {
      await saveImportPrompt(prompt);
    }

    const result = await importTemplateFromUrl({
      siteId: body.siteId,
      sourceUrl: body.sourceUrl,
      prompt,
      name: body.name,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: e.issues[0]?.message || "Invalid request" },
        { status: 400 },
      );
    }
    const message = formatServerImportError(e);
    console.error("[import-from-url]", e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
