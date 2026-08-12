import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

/** Keep legacy tags like [PRIJZENBSO]; strip only {{insert:…}} wrapper. */
function normalizeTag(tag: string) {
  return tag
    .replace(/^\{\{\s*insert:/i, "")
    .replace(/\s*\}\}$/, "")
    .trim()
    .slice(0, 80);
}

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const siteId = new URL(req.url).searchParams.get("siteId");
  const inserts = await prisma.insert.findMany({
    where: siteId ? { siteId } : undefined,
    include: { site: { select: { id: true, name: true, slug: true } } },
    orderBy: [{ siteId: "asc" }, { tag: "asc" }],
  });

  return NextResponse.json(inserts);
}

const createSchema = z.object({
  siteId: z.string().min(1),
  tag: z.string().min(1),
  content: z.string().optional().default(""),
  onlyInRender: z.boolean().optional().default(false),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = createSchema.parse(await req.json());
    const tag = normalizeTag(body.tag);
    if (!tag) {
      return NextResponse.json({ error: "Invalid tag" }, { status: 400 });
    }

    const site = await prisma.site.findUnique({ where: { id: body.siteId } });
    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    const existing = await prisma.insert.findUnique({
      where: { siteId_tag: { siteId: body.siteId, tag } },
    });
    if (existing) {
      return NextResponse.json(
        { error: `Tag "{{insert:${tag}}}" already exists on this site` },
        { status: 409 },
      );
    }

    const insert = await prisma.insert.create({
      data: {
        siteId: body.siteId,
        tag,
        content: body.content ?? "",
        onlyInRender: body.onlyInRender ?? false,
      },
      include: { site: { select: { id: true, name: true, slug: true } } },
    });

    return NextResponse.json(insert, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error("[inserts] create", e);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
