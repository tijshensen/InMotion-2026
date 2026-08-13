import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { SECTION_LAYOUT_EXAMPLES } from "@/lib/sections";
import { scheduleSectionPreview } from "@/lib/section-preview";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const templateId = searchParams.get("templateId");
  const siteId = searchParams.get("siteId");

  if (templateId) {
    const blocks = await prisma.templateBlock.findMany({
      where: { templateId },
      orderBy: { sortOrder: "asc" },
    });
    return NextResponse.json(blocks);
  }

  if (siteId) {
    const blocks = await prisma.templateBlock.findMany({
      where: { template: { templateSet: { siteId } } },
      orderBy: [{ templateId: "asc" }, { sortOrder: "asc" }],
      include: {
        template: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(blocks);
  }

  return NextResponse.json(
    { error: "templateId or siteId required" },
    { status: 400 },
  );
}

const createSchema = z.object({
  templateId: z.string().min(1),
  name: z.string().min(1),
  defaultHtml: z.string().optional(),
  isRepeatable: z.boolean().optional(),
  example: z
    .enum(["title", "textImage", "threeImages", "fullWidth"])
    .optional(),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = createSchema.parse(await req.json());
    const max = await prisma.templateBlock.aggregate({
      where: { templateId: data.templateId },
      _max: { sortOrder: true },
    });

    const defaultHtml =
      data.defaultHtml ??
      (data.example
        ? SECTION_LAYOUT_EXAMPLES[data.example]
        : SECTION_LAYOUT_EXAMPLES.fullWidth);

    const block = await prisma.templateBlock.create({
      data: {
        templateId: data.templateId,
        name: data.name,
        defaultHtml,
        isRepeatable: data.isRepeatable ?? true,
        sortOrder: (max._max.sortOrder ?? -1) + 1,
      },
    });

    scheduleSectionPreview(block.id);
    return NextResponse.json(block, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
