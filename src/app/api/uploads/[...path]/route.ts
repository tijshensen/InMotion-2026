import { readFile, stat } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { uploadsRoot } from "@/lib/media";

type Ctx = { params: Promise<{ path: string[] }> };

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
};

/**
 * Always serve uploads from disk (not Next static snapshot).
 * Rewritten from /uploads/* via next.config so new crops/uploads work
 * immediately after write without restarting the server.
 */
export async function GET(_req: Request, ctx: Ctx) {
  const { path: parts } = await ctx.params;
  if (!parts?.length) {
    return new NextResponse("Not found", { status: 404 });
  }

  const root = uploadsRoot();
  const resolved = path.resolve(root, ...parts);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  try {
    const st = await stat(resolved);
    if (!st.isFile()) {
      return new NextResponse("Not found", { status: 404 });
    }
    const data = await readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    const type = MIME[ext] || "application/octet-stream";
    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": type,
        "Content-Length": String(data.length),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
