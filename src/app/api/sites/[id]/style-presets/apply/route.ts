import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { assertSiteAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { applyPresetHits } from "@/lib/style-presets";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  presetId: z.string().min(1),
  hits: z
    .array(
      z.object({
        kind: z.enum(["pageBlock", "templateBlock", "shell"]),
        targetId: z.string().min(1),
        nid: z.string().min(1),
      }),
    )
    .min(1)
    .max(80),
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
    const preset = await prisma.stylePreset.findFirst({
      where: { id: body.presetId, siteId },
    });
    if (!preset) {
      return NextResponse.json({ error: "Preset not found" }, { status: 404 });
    }

    const result = await applyPresetHits({
      siteId,
      presetId: preset.id,
      className: preset.className,
      hits: body.hits,
    });

    return NextResponse.json({
      ok: true,
      replaced: body.hits.length,
      updatedPageBlocks: result.updatedPageBlocks,
      updatedTemplateBlocks: result.updatedTemplateBlocks,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: e.issues[0]?.message || "Invalid apply" },
        { status: 400 },
      );
    }
    console.error("[style-presets/apply]", e);
    return NextResponse.json({ error: "Replace failed" }, { status: 500 });
  }
}
