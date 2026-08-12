import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { setActiveSiteId } from "@/lib/site-context";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = z
      .object({ siteId: z.string().min(1) })
      .parse(await req.json());

    const site = await prisma.site.findUnique({ where: { id: body.siteId } });
    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    await setActiveSiteId(site.id);
    return NextResponse.json({
      ok: true,
      site: {
        id: site.id,
        name: site.name,
        slug: site.slug,
        cssFramework: site.cssFramework,
      },
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
