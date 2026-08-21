import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { assertSiteAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { getImportJob, startImportJob } from "@/lib/import-job";
import { formatServerImportError } from "@/lib/import-error";
import { improveSectionWithGrok } from "@/lib/improve-section";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string; sectionId: string }> };

const bodySchema = z.object({
  prompt: z.string().min(4).max(2000),
});

export async function GET(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  void ctx;
  const jobId = new URL(req.url).searchParams.get("jobId") || "";
  const job = jobId ? getImportJob(jobId, user.id) : null;
  if (!job) {
    return NextResponse.json(
      { error: "Job not found. It may have expired — try again." },
      { status: 404 },
    );
  }
  return NextResponse.json({
    status: job.status,
    error: job.error,
    result: job.result,
  });
}

export async function POST(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: pageId, sectionId } = await ctx.params;
  try {
    const body = bodySchema.parse(await req.json());
    const page = await prisma.page.findUnique({
      where: { id: pageId },
      select: { siteId: true },
    });
    if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });
    const denied = await assertSiteAccess(user, page.siteId, "EDITOR");
    if (denied) return denied;

    const jobId = startImportJob(user.id, () =>
      improveSectionWithGrok({
        pageId,
        sectionId,
        prompt: body.prompt,
      }),
    );
    return NextResponse.json({ jobId }, { status: 202 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: e.issues[0]?.message || "Invalid request" },
        { status: 400 },
      );
    }
    console.error("[improve-section]", e);
    return NextResponse.json(
      { error: formatServerImportError(e) },
      { status: 400 },
    );
  }
}
