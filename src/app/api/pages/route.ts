import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { assertSiteAccess } from "@/lib/access";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const siteId = searchParams.get("siteId");
  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }

  const denied = await assertSiteAccess(user, siteId, "VIEWER");
  if (denied) return denied;

  const pages = await prisma.page.findMany({
    where: { siteId },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    include: {
      language: true,
      template: true,
      _count: { select: { blocks: true } },
    },
  });

  return NextResponse.json(pages);
}

const createSchema = z.object({
  siteId: z.string(),
  languageId: z.string(),
  templateId: z.string().optional().nullable(),
  title: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/i, {
    message: "Invalid slug",
  }),
  menuTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  parentId: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const data = createSchema.parse(await req.json());

    const denied = await assertSiteAccess(user, data.siteId, "EDITOR");
    if (denied) return denied;

    // New pages start empty — user adds sections from the catalog (MotionCMS-style)
    const page = await prisma.page.create({
      data: {
        siteId: data.siteId,
        languageId: data.languageId,
        templateId: data.templateId || null,
        authorId: user.id,
        title: data.title,
        slug: data.slug.toLowerCase(),
        menuTitle: data.menuTitle || data.title,
        metaDescription: data.metaDescription || "",
        parentId: data.parentId || null,
      },
      include: { blocks: true },
    });

    return NextResponse.json(page, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: "Could not create page" }, { status: 500 });
  }
}
