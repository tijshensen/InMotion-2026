/**
 * Serve statically generated websites from public/sites/{slug}/.
 * Fixes Next.js not mapping /sites/foo → /sites/foo/index.html
 * (which previously 404'd and trailing-slash redirected into a loop).
 */

import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ siteSlug: string; path?: string[] }> };

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

function safeJoin(root: string, parts: string[]): string | null {
  const resolved = path.resolve(root, ...parts);
  const rootResolved = path.resolve(root);
  if (
    resolved !== rootResolved &&
    !resolved.startsWith(rootResolved + path.sep)
  ) {
    return null;
  }
  return resolved;
}

function contentType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME[ext] || "application/octet-stream";
}

export async function GET(_req: Request, ctx: Ctx) {
  const { siteSlug, path: segments = [] } = await ctx.params;

  // Only allow simple slugs
  if (!/^[a-zA-Z0-9_-]+$/.test(siteSlug)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const siteRoot = path.join(process.cwd(), "public", "sites", siteSlug);
  if (!fs.existsSync(siteRoot)) {
    return new NextResponse(
      `Generated site not found for "${siteSlug}". Run Generate site in admin first.`,
      { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  const parts = segments.filter(Boolean);
  // Directory / empty → index.html
  const candidate =
    parts.length === 0
      ? ["index.html"]
      : parts[parts.length - 1]!.includes(".")
        ? parts
        : [...parts, "index.html"];

  let filePath = safeJoin(siteRoot, candidate);
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    // Try .html for clean URLs: /sites/kiekeboe/bso → bso.html
    if (parts.length && !parts[parts.length - 1]!.includes(".")) {
      const htmlTry = safeJoin(siteRoot, [
        ...parts.slice(0, -1),
        `${parts[parts.length - 1]}.html`,
      ]);
      if (htmlTry && fs.existsSync(htmlTry) && fs.statSync(htmlTry).isFile()) {
        filePath = htmlTry;
      } else {
        filePath = null;
      }
    } else {
      filePath = null;
    }
  }

  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return new NextResponse("Not found", { status: 404 });
  }

  const body = fs.readFileSync(filePath);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType(filePath),
      "Cache-Control": "no-store",
    },
  });
}
