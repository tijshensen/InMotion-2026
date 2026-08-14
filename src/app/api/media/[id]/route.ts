import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { deleteUploadedFile } from "@/lib/media";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const body = z
    .object({ alt: z.string().optional() })
    .parse(await req.json());

  const asset = await prisma.mediaAsset.update({
    where: { id },
    data: { alt: body.alt },
  });

  return NextResponse.json(asset);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const asset = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!asset) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await deleteUploadedFile(asset.path);
  if (asset.posterPath) await deleteUploadedFile(asset.posterPath);
  await prisma.mediaAsset.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
