/**
 * Import one page's content into an existing site.
 * Unlike site import, this keeps the site template (header/footer) and only
 * creates sections for the source page body.
 */

import { prisma } from "./db";
import { grokChat, extractJsonObject, xaiApiKey } from "./xai";
import {
  emptyFieldsFromTemplate,
  serializeFields,
} from "./sections";
import { scheduleSectionPreview } from "./section-preview";
import {
  detectCssFramework,
  frameworkLabel,
  needsFrameworkRewrite,
  normalizeFramework,
  slugifyPage,
  type CssFramework,
} from "./detect-css-framework";

export type PageImportPreview = {
  sourceUrl: string;
  sourceFramework: CssFramework;
  siteFramework: CssFramework;
  match: boolean;
  needsRewrite: boolean;
  guessedTitle: string;
  evidence: string[];
  confidence: "high" | "medium" | "low";
};

function assertPublicHttpUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Enter a valid http(s) URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only public http(s) URLs can be imported");
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
    host === "0.0.0.0" ||
    host === "metadata.google.internal"
  ) {
    throw new Error("That URL is not a public page");
  }
  return parsed;
}

function stripNoise(html: string) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(html: string): string {
  const og = html.match(
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i,
  );
  if (og?.[1]) return og[1].trim();
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return (title?.[1] || "").replace(/\s+/g, " ").trim();
}

async function fetchPublicHtml(url: string): Promise<string> {
  assertPublicHttpUrl(url);
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; CMSinMotionBot/1.0; +https://cmsinmotion.local)",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) {
    throw new Error(`Could not fetch URL (${res.status})`);
  }
  const html = await res.text();
  if (html.replace(/<[^>]+>/g, "").trim().length < 40) {
    throw new Error("Fetched page has too little HTML to import");
  }
  return html;
}

export async function previewPageImport(opts: {
  sourceUrl: string;
  siteFramework: string;
}): Promise<PageImportPreview> {
  const html = await fetchPublicHtml(opts.sourceUrl);
  const detected = detectCssFramework(html);
  const siteFramework = normalizeFramework(opts.siteFramework);
  const rewrite = needsFrameworkRewrite(detected.framework, siteFramework);
  return {
    sourceUrl: opts.sourceUrl,
    sourceFramework: detected.framework,
    siteFramework,
    match: !rewrite,
    needsRewrite: rewrite,
    guessedTitle: extractTitle(html).slice(0, 160),
    evidence: detected.evidence,
    confidence: detected.confidence,
  };
}

type PlannedPage = {
  title: string;
  slug: string;
  sections: { name: string; html: string }[];
};

function frameworkRules(opts: {
  siteFramework: CssFramework;
  sourceFramework: CssFramework;
  rewrite: boolean;
}): string {
  if (!opts.rewrite || opts.siteFramework === "none") {
    return `This site already uses ${frameworkLabel(opts.siteFramework)}. Keep existing CSS classes EXACTLY. Do not convert Bootstrap ↔ Tailwind. Do not invent a new design system.`;
  }
  if (opts.siteFramework === "tailwind") {
    return `The source uses ${frameworkLabel(opts.sourceFramework)}. Rewrite ALL markup to Tailwind utility classes only (no Bootstrap class names). Do not add a Tailwind CDN — the site template already loads CSS.`;
  }
  if (opts.siteFramework === "bootstrap") {
    return `The source uses ${frameworkLabel(opts.sourceFramework)}. Rewrite ALL markup to Bootstrap 3 (container / row / col-md-* / btn / img-responsive). Do not leave Tailwind utilities.`;
  }
  return "Keep the source classes.";
}

async function planPageFromUrl(opts: {
  sourceUrl: string;
  siteFramework: CssFramework;
  sourceFramework: CssFramework;
  rewrite: boolean;
}): Promise<PlannedPage> {
  if (!xaiApiKey()) {
    throw new Error(
      "XAI_API_KEY is not set. Add it to .env from https://console.x.ai",
    );
  }

  const raw = await fetchPublicHtml(opts.sourceUrl);
  const sourceHtml = stripNoise(raw).slice(0, 80_000);

  const system = `You convert a web page's MAIN CONTENT into CMSinMotion sections.

Return ONLY valid JSON (no markdown) with this shape:
{
  "title": "Page title",
  "slug": "page-slug",
  "sections": [
    { "name": "Hero", "html": "section markup with CMS markers" }
  ]
}

Rules:
- Do NOT include the site header, logo bar, main navigation, or footer. Only the page body.
- ${frameworkRules(opts)}
- Split the body into 2–8 named sections. Each section is a self-contained HTML fragment (no html/head/body).
- Wrap EVERY editable headline, short line, body copy, and image with CMS markers:
  <singleline name="Headline">Example headline</singleline>
  <multiline name="Body"><p>Example paragraph</p></multiline>
  <img editable="true" name="Photo" src="" width="800" height="500" alt="Photo" />
- Use unique name= values within a section.
- Keep real copy from the source page.
- Images: keep absolute http(s) src when present; otherwise src="".
- No React/Vue. Semantic HTML only.`;

  const text = await grokChat({
    system,
    user: `Source URL: ${opts.sourceUrl}

--- SOURCE HTML (scripts/styles stripped) ---
${sourceHtml}`,
    temperature: 0.25,
    timeoutMs: 180_000,
  });

  const parsed = extractJsonObject(text) as Partial<PlannedPage>;
  const title = String(parsed.title || extractTitle(raw) || "Imported page").slice(
    0,
    160,
  );
  const slug =
    slugifyPage(String(parsed.slug || title)) || "imported-page";
  const sections = Array.isArray(parsed.sections)
    ? parsed.sections
        .map((s) => ({
          name: String(s?.name || "Section").slice(0, 80),
          html: String(s?.html || "").trim(),
        }))
        .filter((s) => s.html)
    : [];

  if (!sections.length) {
    throw new Error("Grok did not return any sections for this page");
  }

  return { title, slug, sections };
}

async function uniquePageSlug(
  siteId: string,
  languageId: string,
  base: string,
) {
  let slug = base || "page";
  let n = 0;
  while (
    await prisma.page.findUnique({
      where: {
        siteId_languageId_slug: { siteId, languageId, slug },
      },
    })
  ) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}

export async function importPageFromUrl(opts: {
  siteId: string;
  languageId: string;
  templateId?: string | null;
  title?: string;
  slug?: string;
  menuTitle?: string;
  sourceUrl: string;
  rewrite: boolean;
  creatorUserId: string;
}) {
  const site = await prisma.site.findUnique({
    where: { id: opts.siteId },
    include: {
      templateSets: { include: { templates: { orderBy: { name: "asc" } } } },
    },
  });
  if (!site) throw new Error("Site not found");

  const html = await fetchPublicHtml(opts.sourceUrl);
  const detected = detectCssFramework(html);
  const siteFramework = normalizeFramework(site.cssFramework);
  const rewriteNeeded = needsFrameworkRewrite(
    detected.framework,
    siteFramework,
  );

  if (rewriteNeeded && !opts.rewrite) {
    const err = new Error("FRAMEWORK_MISMATCH") as Error & {
      preview: PageImportPreview;
    };
    err.preview = {
      sourceUrl: opts.sourceUrl,
      sourceFramework: detected.framework,
      siteFramework,
      match: false,
      needsRewrite: true,
      guessedTitle: extractTitle(html).slice(0, 160),
      evidence: detected.evidence,
      confidence: detected.confidence,
    };
    throw err;
  }

  const plan = await planPageFromUrl({
    sourceUrl: opts.sourceUrl,
    siteFramework,
    sourceFramework: detected.framework,
    rewrite: rewriteNeeded,
  });

  const templateId =
    opts.templateId ||
    site.templateSets.flatMap((ts) => ts.templates)[0]?.id ||
    null;
  if (!templateId) {
    throw new Error("This site needs a template before you can import a page");
  }

  const title = (opts.title || plan.title).trim() || plan.title;
  const slug = await uniquePageSlug(
    opts.siteId,
    opts.languageId,
    slugifyPage(opts.slug || plan.slug || title),
  );

  const existingNames = new Set(
    (
      await prisma.templateBlock.findMany({
        where: { templateId },
        select: { name: true },
      })
    ).map((b) => b.name.toLowerCase()),
  );

  const maxSort = await prisma.templateBlock.aggregate({
    where: { templateId },
    _max: { sortOrder: true },
  });
  let sort = maxSort._max.sortOrder ?? -1;

  const createdBlocks = [];
  for (const section of plan.sections) {
    let name = section.name;
    if (existingNames.has(name.toLowerCase())) {
      name = `${section.name} (${slug})`;
    }
    existingNames.add(name.toLowerCase());
    sort += 1;
    const tb = await prisma.templateBlock.create({
      data: {
        templateId,
        name,
        defaultHtml: section.html,
        isRepeatable: false,
        sortOrder: sort,
      },
    });
    createdBlocks.push(tb);
    scheduleSectionPreview(tb.id);
  }

  const page = await prisma.page.create({
    data: {
      siteId: opts.siteId,
      languageId: opts.languageId,
      templateId,
      authorId: opts.creatorUserId,
      title,
      slug,
      menuTitle: (opts.menuTitle || title).trim(),
      metaDescription: "",
      blocks: {
        create: createdBlocks.map((b, i) => ({
          templateBlockId: b.id,
          content: serializeFields(emptyFieldsFromTemplate(b.defaultHtml)),
          sortOrder: i,
        })),
      },
    },
    include: { blocks: true },
  });

  return {
    page,
    sectionCount: createdBlocks.length,
    rewritten: rewriteNeeded,
    sourceFramework: detected.framework,
    siteFramework,
  };
}
