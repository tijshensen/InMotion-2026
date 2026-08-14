import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { assertSiteAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { pagesProjectError } from "@/lib/pages-project-name";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  cloudflareProject: z.string().max(58).optional(),
  domain: z.string().max(200).optional().nullable(),
  name: z.string().min(1).max(120).optional(),
  siteTitle: z.string().max(200).optional(),
  logoPath: z.string().max(500).optional(),
  multiLanguage: z.boolean().optional(),
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
      siteTitle?: string;
      logoPath?: string;
      multiLanguage?: boolean;
    } = {};
    if (body.cloudflareProject !== undefined) {
      const project = body.cloudflareProject.trim().toLowerCase();
      const invalid = pagesProjectError(project);
      if (invalid) {
        return NextResponse.json({ error: invalid }, { status: 400 });
      }
      data.cloudflareProject = project;
    }
    if (body.domain !== undefined) data.domain = body.domain;
    if (body.name !== undefined) data.name = body.name.trim();
    if (body.siteTitle !== undefined) data.siteTitle = body.siteTitle.trim();
    if (body.multiLanguage !== undefined) data.multiLanguage = body.multiLanguage;
    if (body.logoPath !== undefined) {
      const logo = body.logoPath.trim();
      if (logo && !logo.startsWith("/uploads/") && !/^https?:\/\//i.test(logo)) {
        return NextResponse.json(
          { error: "Logo must be an uploaded file or URL" },
          { status: 400 },
        );
      }
      data.logoPath = logo;
    }

    const site = await prisma.site.update({
      where: { id },
      data,
    });

    if (body.siteTitle !== undefined) {
      await prisma.language.updateMany({
        where: { siteId: id, isDefault: true },
        data: { siteTitle: data.siteTitle || "" },
      });
    }

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
