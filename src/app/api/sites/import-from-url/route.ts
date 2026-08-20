import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { assertCanCreateSite } from "@/lib/access";
import { setActiveSiteId } from "@/lib/site-context";
import {
  getImportPrompt,
  importSiteFromUrl,
  saveImportPrompt,
} from "@/lib/import-from-url";
import { cloneSiteFromUrl } from "@/lib/clone-from-url";
import { formatServerImportError } from "@/lib/import-error";
import { getImportJob, startImportJob } from "@/lib/import-job";

export const maxDuration = 300;

const bodySchema = z.object({
  organizationId: z.string().min(1),
  sourceUrl: z.string().url(),
  name: z.string().max(120).optional(),
  prompt: z.string().min(1).max(4000).optional(),
  savePromptAsDefault: z.boolean().optional(),
  mode: z.enum(["clone", "inspired"]).optional(),
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
    const denied = await assertCanCreateSite(user, body.organizationId);
    if (denied) return denied;

    const prompt = (body.prompt || (await getImportPrompt())).trim();
    if (body.savePromptAsDefault) {
      await saveImportPrompt(prompt);
    }

    const mode = body.mode || "clone";
    const jobId = startImportJob(user.id, async () => {
      const result =
        mode === "clone"
          ? await cloneSiteFromUrl({
              organizationId: body.organizationId,
              name: body.name,
              sourceUrl: body.sourceUrl,
              creatorUserId: user.id,
            })
          : await importSiteFromUrl({
              organizationId: body.organizationId,
              name: body.name,
              sourceUrl: body.sourceUrl,
              prompt,
              creatorUserId: user.id,
            });
      return {
        siteId: result.site.id,
        siteSlug: result.site.slug,
        pageId: result.pageId,
        templateId: result.templateId,
        sectionCount: result.sectionCount,
      };
    });

    return NextResponse.json({ jobId }, { status: 202 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: e.issues[0]?.message || "Invalid request" },
        { status: 400 },
      );
    }
    const message = formatServerImportError(e);
    console.error("[import-from-url]", e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
