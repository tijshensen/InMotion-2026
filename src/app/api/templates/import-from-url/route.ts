import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { assertSiteAccess } from "@/lib/access";
import {
  getImportPrompt,
  importTemplateFromUrl,
  saveImportPrompt,
} from "@/lib/import-from-url";
import { cloneTemplateFromUrl } from "@/lib/clone-from-url";
import { formatServerImportError } from "@/lib/import-error";
import { getImportJob, startImportJob } from "@/lib/import-job";
import {
  cloneHostMismatchMessage,
  getSiteCloneSource,
  sameCloneHost,
} from "@/lib/clone-source";

export const maxDuration = 300;

const bodySchema = z.object({
  siteId: z.string().min(1),
  sourceUrl: z.string().url(),
  name: z.string().max(200).optional(),
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
    const denied = await assertSiteAccess(user, body.siteId, "EDITOR");
    if (denied) return denied;

    const cloneSource = await getSiteCloneSource(body.siteId);
    if (cloneSource && body.mode === "inspired") {
      return NextResponse.json(
        { error: cloneHostMismatchMessage(cloneSource) },
        { status: 400 },
      );
    }
    if (cloneSource && !sameCloneHost(body.sourceUrl, cloneSource)) {
      return NextResponse.json(
        { error: cloneHostMismatchMessage(cloneSource) },
        { status: 400 },
      );
    }

    const mode = cloneSource ? "clone" : body.mode || "clone";
    const prompt = (body.prompt || (await getImportPrompt())).trim();
    if (mode === "inspired" && body.savePromptAsDefault && user.role === "SUPERADMIN") {
      await saveImportPrompt(prompt);
    }

    const jobId = startImportJob(user.id, () =>
      mode === "clone"
        ? cloneTemplateFromUrl({
            siteId: body.siteId,
            sourceUrl: body.sourceUrl,
            name: body.name,
          })
        : importTemplateFromUrl({
            siteId: body.siteId,
            sourceUrl: body.sourceUrl,
            prompt,
            name: body.name,
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
    const message = formatServerImportError(e);
    console.error("[import-from-url]", e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
