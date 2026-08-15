import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { parseStoredContent, serializeContent } from "@/lib/sections";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  title: z.string().min(1).optional(),
  menuTitle: z.string().optional(),
  slug: z.string().min(1).optional(),
  metaDescription: z.string().optional(),
  isHidden: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  sections: z
    .array(
      z.object({
        id: z.string(),
        templateBlockId: z.string().nullable().optional(),
        sortOrder: z.number().int().optional(),
        isHidden: z.boolean().optional(),
        css: z.string().optional(),
        fields: z.record(z.string(), z.string()).optional(),
        layoutHtml: z.string().optional(),
        content: z.string().optional(),
      }),
    )
    .optional(),
});

function asStringFields(fields: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = v == null ? "" : String(v);
  }
  return out;
}

/** One request for page meta + section upserts. Safe to call with keepalive. */
export async function PUT(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: pageId } = await ctx.params;
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    select: { id: true, templateId: true },
  });
  if (!page) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const data = bodySchema.parse(await req.json());

    if (data.sections) {
      for (const s of data.sections) {
        const existing = await prisma.pageBlock.findFirst({
          where: { id: s.id, pageId },
          include: { templateBlock: { select: { defaultHtml: true } } },
        });
        const prev = existing
          ? parseStoredContent(
              existing.content,
              existing.templateBlock?.defaultHtml || "",
            )
          : { fields: {}, layoutHtml: undefined, repeatGroups: undefined };
        const nextLayout =
          s.layoutHtml !== undefined ? s.layoutHtml : prev.layoutHtml;
        // Never flatten a wrap: keep <repeatable> if the client sent expanded cards.
        const layoutHtml =
          nextLayout && /<repeatable\b/i.test(nextLayout)
            ? nextLayout
            : prev.layoutHtml && /<repeatable\b/i.test(prev.layoutHtml)
              ? prev.layoutHtml
              : nextLayout;
        const content = s.fields
          ? serializeContent({
              fields: asStringFields(s.fields),
              layoutHtml,
              repeatGroups: prev.repeatGroups,
            })
          : s.content;
        const patch = {
          ...(s.sortOrder !== undefined ? { sortOrder: s.sortOrder } : {}),
          ...(s.isHidden !== undefined ? { isHidden: s.isHidden } : {}),
          ...(s.css !== undefined ? { css: s.css } : {}),
          ...(content !== undefined ? { content } : {}),
        };

        const updated = await prisma.pageBlock.updateMany({
          where: { id: s.id, pageId },
          data: patch,
        });

        if (updated.count === 0 && s.templateBlockId) {
          await prisma.pageBlock.create({
            data: {
              id: s.id,
              pageId,
              templateBlockId: s.templateBlockId,
              content: content ?? "",
              css: s.css ?? "",
              isHidden: s.isHidden ?? false,
              sortOrder: s.sortOrder ?? 0,
            },
          });
          if (!page.templateId) {
            const tb = await prisma.templateBlock.findUnique({
              where: { id: s.templateBlockId },
              select: { templateId: true },
            });
            if (tb) {
              await prisma.page.update({
                where: { id: pageId },
                data: { templateId: tb.templateId },
              });
              page.templateId = tb.templateId;
            }
          }
        }
      }
    }

    const updated = await prisma.page.update({
      where: { id: pageId },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.menuTitle !== undefined ? { menuTitle: data.menuTitle } : {}),
        ...(data.slug !== undefined ? { slug: data.slug.toLowerCase() } : {}),
        ...(data.metaDescription !== undefined
          ? { metaDescription: data.metaDescription }
          : {}),
        ...(data.isHidden !== undefined ? { isHidden: data.isHidden } : {}),
        ...(data.isDefault !== undefined ? { isDefault: data.isDefault } : {}),
      },
    });

    return NextResponse.json({ ok: true, updatedAt: updated.updatedAt });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: e.issues[0]?.message || "Invalid save" },
        { status: 400 },
      );
    }
    console.error("[autosave]", e);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
}
