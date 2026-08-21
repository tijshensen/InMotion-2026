import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { TAILWIND_SHELL } from "@/lib/bootstrap-to-tailwind";
import {
  cloneHostMismatchMessage,
  getSiteCloneSource,
} from "@/lib/clone-source";

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

  const templates = await prisma.template.findMany({
    where: { templateSet: { siteId } },
    orderBy: { name: "asc" },
    include: {
      templateSet: { select: { id: true, name: true } },
      _count: { select: { blocks: true, pages: true } },
    },
  });

  return NextResponse.json(templates);
}

const createSchema = z.object({
  siteId: z.string().min(1),
  name: z.string().min(1).max(200),
  /** empty | tailwind | bootstrap-minimal */
  shell: z.enum(["empty", "tailwind", "bootstrap-minimal"]).optional(),
  coreHtml: z.string().optional(),
});

const BOOTSTRAP_MINIMAL = `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{{page.title}} — {{site.title}}</title>
  <meta name="description" content="{{page.metaDescription}}" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@3.4.1/dist/css/bootstrap.min.css" />
</head>
<body>
  <nav class="navbar navbar-default">
    <div class="container">
      <div class="navbar-header">
        <a class="navbar-brand" href="/s/{{site.slug}}">{{site.title}}</a>
      </div>
      {{menu}}
    </div>
  </nav>
  <div class="container">
    {{sections}}
  </div>
  <script src="https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@3.4.1/dist/js/bootstrap.min.js"></script>
</body>
</html>`;

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = createSchema.parse(await req.json());
    const site = await prisma.site.findUnique({ where: { id: data.siteId } });
    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    const cloneSource = await getSiteCloneSource(site.id);
    if (cloneSource && !data.coreHtml?.trim()) {
      return NextResponse.json(
        { error: cloneHostMismatchMessage(cloneSource) },
        { status: 400 },
      );
    }

    let set = await prisma.templateSet.findFirst({
      where: { siteId: site.id },
      orderBy: { name: "asc" },
    });
    if (!set) {
      set = await prisma.templateSet.create({
        data: {
          siteId: site.id,
          name: `${site.name} templates`,
        },
      });
    }

    let coreHtml = data.coreHtml ?? "";
    if (!coreHtml) {
      if (data.shell === "tailwind") coreHtml = TAILWIND_SHELL;
      else if (data.shell === "bootstrap-minimal") coreHtml = BOOTSTRAP_MINIMAL;
      else {
        coreHtml = `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{{page.title}} — {{site.title}}</title>
  <meta name="description" content="{{page.metaDescription}}" />
</head>
<body>
  <header><strong>{{site.title}}</strong>{{menu}}</header>
  <main>{{sections}}</main>
</body>
</html>`;
      }
    }

    const template = await prisma.template.create({
      data: {
        templateSetId: set.id,
        name: data.name,
        coreHtml,
        menuHtml: "",
        submenuHtml: "",
      },
      include: {
        templateSet: { select: { id: true, name: true } },
        _count: { select: { blocks: true, pages: true } },
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
