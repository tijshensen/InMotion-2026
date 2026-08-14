import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { assertSiteAccess } from "@/lib/access";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

const createSchema = z.object({
  name: z.string().min(1).max(80),
  code: z
    .string()
    .min(2)
    .max(8)
    .transform((s) => s.trim().toLowerCase()),
  siteTitle: z.string().max(200).optional(),
});

export async function POST(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const denied = await assertSiteAccess(user, id, "ADMIN");
  if (denied) return denied;

  try {
    const body = createSchema.parse(await req.json());
    if (!/^[a-z]{2}(?:-[a-z]{2})?$/.test(body.code)) {
      return NextResponse.json(
        { error: "Use a language code like en, nl, or en-gb" },
        { status: 400 },
      );
    }

    const exists = await prisma.language.findUnique({
      where: { siteId_code: { siteId: id, code: body.code } },
    });
    if (exists) {
      return NextResponse.json(
        { error: `Language “${body.code}” already exists` },
        { status: 400 },
      );
    }

    const site = await prisma.site.findUnique({
      where: { id },
      select: { siteTitle: true, name: true },
    });

    const language = await prisma.language.create({
      data: {
        siteId: id,
        name: body.name.trim(),
        code: body.code,
        siteTitle: (body.siteTitle || site?.siteTitle || site?.name || "").trim(),
        isDefault: false,
      },
    });

    await prisma.site.update({
      where: { id },
      data: { multiLanguage: true },
    });

    return NextResponse.json(language, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: e.issues[0]?.message || "Invalid request" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not add language" },
      { status: 400 },
    );
  }
}
