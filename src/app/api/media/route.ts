import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { assertSiteAccess } from "@/lib/access";
import { saveUploadedMedia } from "@/lib/media";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const siteId = searchParams.get("siteId");
  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }

  const denied = await assertSiteAccess(user, siteId, "VIEWER");
  if (denied) return denied;

  const assets = await prisma.mediaAsset.findMany({
    where: { siteId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(assets);
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const form = await req.formData();
    const siteId = String(form.get("siteId") || "");
    const alt = String(form.get("alt") || "");
    const file = form.get("file");

    if (!siteId) {
      return NextResponse.json({ error: "siteId required" }, { status: 400 });
    }
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }

    const denied = await assertSiteAccess(user, siteId, "EDITOR");
    if (denied) return denied;

    const site = await prisma.site.findUnique({ where: { id: siteId } });
    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    const saved = await saveUploadedMedia({ siteSlug: site.slug, file });

    const asset = await prisma.mediaAsset.create({
      data: {
        siteId,
        filename: saved.filename,
        path: saved.path,
        mimeType: saved.mimeType,
        sizeBytes: saved.sizeBytes,
        alt,
        posterPath: saved.posterPath || "",
      },
    });

    return NextResponse.json(asset, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload failed";
    console.error("[media] upload", e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
