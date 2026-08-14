import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { assertSiteAccess } from "@/lib/access";
import { undoPresetApply } from "@/lib/style-presets";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  presetId: z.string().min(1),
});

export async function POST(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: siteId } = await ctx.params;
  const denied = await assertSiteAccess(user, siteId, "EDITOR");
  if (denied) return denied;

  try {
    const body = bodySchema.parse(await req.json());
    const result = await undoPresetApply({
      siteId,
      presetId: body.presetId,
    });
    return NextResponse.json({
      ok: true,
      restored: result.restored,
      updatedPageBlocks: result.updatedPageBlocks,
      updatedTemplateBlocks: result.updatedTemplateBlocks,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: e.issues[0]?.message || "Invalid undo" },
        { status: 400 },
      );
    }
    console.error("[style-presets/undo]", e);
    return NextResponse.json({ error: "Undo failed" }, { status: 500 });
  }
}
