import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { cropAndResizeImage } from "@/lib/media";

const bodySchema = z.object({
  siteId: z.string().min(1),
  sourcePath: z.string().min(1),
  mediaId: z.string().optional(),
  alt: z.string().optional(),
  targetWidth: z.number().int().min(1).max(4000),
  targetHeight: z.number().int().min(1).max(4000),
  crop: z.object({
    left: z.number().min(0),
    top: z.number().min(0),
    width: z.number().min(1),
    height: z.number().min(1),
  }),
});

/**
 * Crop an existing upload to a region, resize to section size (W×H),
 * and store as a new MediaAsset (original preserved).
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = bodySchema.parse(await req.json());

    const site = await prisma.site.findUnique({ where: { id: body.siteId } });
    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    if (!body.sourcePath.startsWith("/uploads/")) {
      return NextResponse.json(
        { error: "Can only crop files from the media library" },
        { status: 400 },
      );
    }

    let originalFilename: string | undefined;
    let alt = body.alt || "";

    if (body.mediaId) {
      const source = await prisma.mediaAsset.findFirst({
        where: { id: body.mediaId, siteId: body.siteId },
      });
      if (source) {
        originalFilename = source.filename;
        if (!alt) alt = source.alt;
      }
    }

    const saved = await cropAndResizeImage({
      siteSlug: site.slug,
      sourcePublicPath: body.sourcePath,
      crop: body.crop,
      targetWidth: body.targetWidth,
      targetHeight: body.targetHeight,
      originalFilename,
    });

    const asset = await prisma.mediaAsset.create({
      data: {
        siteId: body.siteId,
        filename: saved.filename,
        path: saved.path,
        mimeType: saved.mimeType,
        sizeBytes: saved.sizeBytes,
        alt,
      },
    });

    return NextResponse.json(asset, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: e.issues[0]?.message || "Invalid request" },
        { status: 400 },
      );
    }
    const message = e instanceof Error ? e.message : "Crop failed";
    console.error("[media] crop", e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
