import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { assertSiteAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { sanitizePagesProjectName } from "@/lib/cloudflare-pages";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  cloudflareProject: z.string().max(58).optional(),
  domain: z.string().max(200).optional().nullable(),
  name: z.string().min(1).max(120).optional(),
});

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const denied = await assertSiteAccess(user, id, "ADMIN");
  if (denied) return denied;

  try {
    const body = patchSchema.parse(await req.json());
    const data: {
      cloudflareProject?: string;
      domain?: string | null;
      name?: string;
    } = {};
    if (body.cloudflareProject !== undefined) {
      data.cloudflareProject = body.cloudflareProject.trim()
        ? sanitizePagesProjectName(body.cloudflareProject)
        : "";
    }
    if (body.domain !== undefined) data.domain = body.domain;
    if (body.name !== undefined) data.name = body.name;

    const site = await prisma.site.update({
      where: { id },
      data,
    });
    return NextResponse.json(site);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: e.issues[0]?.message || "Invalid request" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Update failed" },
      { status: 400 },
    );
  }
}
