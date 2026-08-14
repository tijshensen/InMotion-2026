import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { tryGenerateVideoPoster } from "@/lib/media";
import { detectVideoSource } from "@/lib/video-media";

type VimeoOembed = {
  thumbnail_url?: string;
  title?: string;
};

async function vimeoPoster(id: string): Promise<{ posterUrl: string; title: string }> {
  try {
    const res = await fetch(
      `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(`https://vimeo.com/${id}`)}`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return { posterUrl: "", title: "" };
    const data = (await res.json()) as VimeoOembed;
    return {
      posterUrl: data.thumbnail_url || "",
      title: data.title || "",
    };
  } catch {
    return { posterUrl: "", title: "" };
  }
}

/**
 * Resolve kind + poster for an image-field URL.
 * YouTube uses i.ytimg.com; Vimeo uses oEmbed; local MP4 can extract a
 * first-frame poster when ffmpeg is installed (`generate=1`).
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const url = (searchParams.get("url") || "").trim();
  const generate = searchParams.get("generate") === "1";
  if (!url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  const video = detectVideoSource(url);
  if (!video) {
    return NextResponse.json({ kind: null, posterUrl: "", embedUrl: "" });
  }

  let posterUrl = video.posterUrl;
  let title = "";

  if (video.kind === "vimeo" && video.id) {
    const info = await vimeoPoster(video.id);
    posterUrl = info.posterUrl;
    title = info.title;
  }

  if (video.kind === "file" && url.startsWith("/uploads/")) {
    const existing = await prisma.mediaAsset.findFirst({
      where: { path: url },
      select: { id: true, posterPath: true },
    });
    posterUrl = existing?.posterPath || "";
    if (generate && !posterUrl) {
      const generated = await tryGenerateVideoPoster(url);
      if (generated) {
        posterUrl = generated;
        if (existing) {
          await prisma.mediaAsset.update({
            where: { id: existing.id },
            data: { posterPath: generated },
          });
        }
      }
    }
  }

  return NextResponse.json({
    kind: video.kind,
    id: video.id || "",
    embedUrl: video.embedUrl || "",
    posterUrl,
    title,
  });
}
