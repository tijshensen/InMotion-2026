import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { getImportPrompt, importSiteFromUrl } from "@/lib/import-from-url";
import { setActiveSiteId } from "@/lib/site-context";
import { ensurePersonalOrg } from "@/lib/onboarding";
import { formatServerImportError } from "@/lib/import-error";
import { getImportJob, startImportJob } from "@/lib/import-job";

export const maxDuration = 300;

const bodySchema = z.object({
  sourceUrl: z.string().url(),
  brief: z.string().max(4000).optional(),
});

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const jobId = new URL(req.url).searchParams.get("jobId") || "";
  const job = jobId ? getImportJob(jobId, user.id) : null;
  if (!job) {
    return NextResponse.json(
      { error: "Import job not found. It may have expired — try again." },
      { status: 404 },
    );
  }
  if (job.status === "ok") {
    const siteId = (job.result as { siteId?: string } | undefined)?.siteId;
    if (siteId) await setActiveSiteId(siteId);
  }
  return NextResponse.json({
    status: job.status,
    error: job.error,
    result: job.result,
  });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = bodySchema.parse(await req.json());
    const org = await ensurePersonalOrg(user.id, user.email);
    const prompt = (body.brief || (await getImportPrompt())).trim();

    const jobId = startImportJob(user.id, async () => {
      const result = await importSiteFromUrl({
        organizationId: org.id,
        sourceUrl: body.sourceUrl,
        prompt,
        creatorUserId: user.id,
      });
      return {
        siteId: result.site.id,
        pageId: result.pageId,
        templateId: result.templateId,
        sectionCount: result.sectionCount,
      };
    });

    return NextResponse.json({ jobId }, { status: 202 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: e.issues[0]?.message || "Enter a valid website URL" },
        { status: 400 },
      );
    }
    const message = formatServerImportError(e);
    console.error("[onboarding/import]", e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
