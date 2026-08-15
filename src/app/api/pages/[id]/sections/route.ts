import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import {
  emptyFieldsFromTemplate,
  serializeContent,
  serializeFields,
} from "@/lib/sections";
import { prepareRepeatableSection } from "@/lib/section-repeat";

type Ctx = { params: Promise<{ id: string }> };

/** Add a section (page block) from a template block definition. */
export async function POST(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: pageId } = await ctx.params;
  const body = z
    .object({
      templateBlockId: z.string().min(1),
    })
    .parse(await req.json());

  const page = await prisma.page.findUnique({
    where: { id: pageId },
    include: { blocks: true },
  });
  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  const tb = await prisma.templateBlock.findUnique({
    where: { id: body.templateBlockId },
  });
  if (!tb || (page.templateId && tb.templateId !== page.templateId)) {
    // allow if page has no template yet and we set it
    if (!tb) {
      return NextResponse.json(
        { error: "Template section not found" },
        { status: 404 },
      );
    }
  }

  if (!page.templateId) {
    await prisma.page.update({
      where: { id: pageId },
      data: { templateId: tb.templateId },
    });
  } else if (tb.templateId !== page.templateId) {
    return NextResponse.json(
      { error: "Section does not belong to this page template" },
      { status: 400 },
    );
  }

  const maxOrder = page.blocks.reduce(
    (m, b) => Math.max(m, b.sortOrder),
    -1,
  );

  const prepared = prepareRepeatableSection(tb.defaultHtml);
  const content = serializeContent({
    fields: emptyFieldsFromTemplate(prepared.html),
    ...(prepared.html.trim() ? { layoutHtml: prepared.html } : {}),
    ...(prepared.groups.length ? { repeatGroups: prepared.groups } : {}),
  });

  const block = await prisma.pageBlock.create({
    data: {
      pageId,
      templateBlockId: tb.id,
      content,
      sortOrder: maxOrder + 1,
      ...(prepared.items.length
        ? {
            repeatItems: {
              create: prepared.items.map((item, i) => ({
                groupKey: item.groupKey,
                sortOrder: i,
                origin: "scraped",
                content: serializeContent({ fields: item.fields }),
              })),
            },
          }
        : {}),
    },
    include: {
      templateBlock: true,
      repeatItems: { orderBy: { sortOrder: "asc" } },
    },
  });

  return NextResponse.json(block, { status: 201 });
}

/** Reorder / bulk-update sections. */
export async function PUT(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: pageId } = await ctx.params;
  const body = z
    .object({
      sections: z.array(
        z.object({
          id: z.string(),
          sortOrder: z.number().int().optional(),
          isHidden: z.boolean().optional(),
          css: z.string().optional(),
          content: z.string().optional(),
          fields: z.record(z.string(), z.string()).optional(),
        }),
      ),
    })
    .parse(await req.json());

  await prisma.$transaction(
    body.sections.map((s) =>
      prisma.pageBlock.updateMany({
        where: { id: s.id, pageId },
        data: {
          ...(s.sortOrder !== undefined ? { sortOrder: s.sortOrder } : {}),
          ...(s.isHidden !== undefined ? { isHidden: s.isHidden } : {}),
          ...(s.css !== undefined ? { css: s.css } : {}),
          ...(s.fields
            ? { content: serializeFields(s.fields) }
            : s.content !== undefined
              ? { content: s.content }
              : {}),
        },
      }),
    ),
  );

  const blocks = await prisma.pageBlock.findMany({
    where: { pageId },
    orderBy: { sortOrder: "asc" },
    include: {
      templateBlock: true,
      repeatItems: { orderBy: { sortOrder: "asc" } },
    },
  });

  return NextResponse.json({ ok: true, blocks });
}
