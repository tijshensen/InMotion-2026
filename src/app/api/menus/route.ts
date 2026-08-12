import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { buildMenuTree } from "@/lib/menu";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const siteId = searchParams.get("siteId");
  const languageId = searchParams.get("languageId");
  if (!siteId || !languageId) {
    return NextResponse.json(
      { error: "siteId and languageId required" },
      { status: 400 },
    );
  }

  const pages = await prisma.page.findMany({
    where: { siteId, languageId },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    select: {
      id: true,
      title: true,
      menuTitle: true,
      slug: true,
      parentId: true,
      sortOrder: true,
      isDefault: true,
      isHidden: true,
      inMenu: true,
    },
  });

  return NextResponse.json({
    pages,
    tree: buildMenuTree(pages),
  });
}

const saveSchema = z.object({
  siteId: z.string().min(1),
  languageId: z.string().min(1),
  items: z.array(
    z.object({
      id: z.string().min(1),
      parentId: z.string().nullable(),
      sortOrder: z.number().int().min(0),
      menuTitle: z.string().optional(),
      inMenu: z.boolean().optional(),
    }),
  ),
});

export async function PUT(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = saveSchema.parse(await req.json());

    // Prevent cycles: parent must not be self or a descendant (validated lightly)
    const idSet = new Set(body.items.map((i) => i.id));
    for (const item of body.items) {
      if (item.parentId === item.id) {
        return NextResponse.json(
          { error: "A page cannot be its own parent" },
          { status: 400 },
        );
      }
      if (item.parentId && !idSet.has(item.parentId)) {
        return NextResponse.json(
          { error: "Invalid parentId" },
          { status: 400 },
        );
      }
    }

    // Cycle check via parent map
    const parentOf = new Map(
      body.items.map((i) => [i.id, i.parentId] as const),
    );
    for (const item of body.items) {
      let walk = item.parentId;
      const seen = new Set<string>([item.id]);
      while (walk) {
        if (seen.has(walk)) {
          return NextResponse.json(
            { error: "Menu nesting would create a cycle" },
            { status: 400 },
          );
        }
        seen.add(walk);
        walk = parentOf.get(walk) ?? null;
      }
    }

    await prisma.$transaction(
      body.items.map((item) =>
        prisma.page.updateMany({
          where: {
            id: item.id,
            siteId: body.siteId,
            languageId: body.languageId,
          },
          data: {
            parentId: item.parentId,
            sortOrder: item.sortOrder,
            ...(item.menuTitle !== undefined
              ? { menuTitle: item.menuTitle }
              : {}),
            ...(item.inMenu !== undefined ? { inMenu: item.inMenu } : {}),
          },
        }),
      ),
    );

    const pages = await prisma.page.findMany({
      where: { siteId: body.siteId, languageId: body.languageId },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      select: {
        id: true,
        title: true,
        menuTitle: true,
        slug: true,
        parentId: true,
        sortOrder: true,
        isDefault: true,
        isHidden: true,
        inMenu: true,
      },
    });

    return NextResponse.json({ ok: true, pages, tree: buildMenuTree(pages) });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error("[menus] save", e);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
}
