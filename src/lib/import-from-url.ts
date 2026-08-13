/**
 * Fetch a public URL and ask Grok to rebuild it as a Tailwind CMS site
 * (Home template shell + named editable sections).
 */

import { prisma } from "./db";
import { createSiteForOrg } from "./sites";
import { grokChat, extractJsonObject, xaiApiKey } from "./xai";
import {
  emptyFieldsFromTemplate,
  serializeFields,
} from "./sections";

export const DEFAULT_IMPORT_PROMPT =
  "Maintain the content of the homepage but rebuild it with a cleaner, modern-looking design.";

export const IMPORT_PROMPT_KEY = "import_from_url_prompt";

export async function getImportPrompt(): Promise<string> {
  const row = await prisma.appSetting.findUnique({
    where: { key: IMPORT_PROMPT_KEY },
  });
  return row?.value?.trim() || DEFAULT_IMPORT_PROMPT;
}

export async function saveImportPrompt(prompt: string) {
  const value = prompt.trim() || DEFAULT_IMPORT_PROMPT;
  await prisma.appSetting.upsert({
    where: { key: IMPORT_PROMPT_KEY },
    create: { key: IMPORT_PROMPT_KEY, value },
    update: { value },
  });
  return value;
}

function stripNoise(html: string) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchPageHtml(url: string): Promise<string> {
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
  const cleaned = stripNoise(html);
  if (cleaned.length < 80) {
    throw new Error("Fetched page has too little HTML to import");
  }
  // Keep prompt size reasonable
  return cleaned.slice(0, 80_000);
}

const SYSTEM = `You convert a homepage's HTML into a CMSinMotion site using Tailwind CSS.

Return ONLY valid JSON (no markdown) with this shape:
{
  "siteTitle": "string",
  "coreHtml": "full HTML document for the Home page template (header + footer + tokens)",
  "sections": [
    { "name": "Hero", "html": "section markup with CMS markers" }
  ]
}

Rules:
- Use Tailwind utility classes only (no Bootstrap). Include Tailwind via:
  <script src="https://cdn.tailwindcss.com"></script> in <head> of coreHtml.
- coreHtml MUST include exactly these tokens:
  {{page.title}} {{page.metaDescription}} {{site.title}} {{menu}} {{sections}}
- Put site-wide header (logo, nav) and footer in coreHtml. Use {{menu}} for the nav.
- Split the main content into 3–8 named sections. Each section is a self-contained HTML fragment (no html/body).
- In section HTML, wrap EVERY editable headline, short line, body copy, and image with CMS markers:
  <singleline name="Headline">Example headline</singleline>
  <multiline name="Body"><p>Example paragraph</p></multiline>
  <img editable="true" name="Photo" src="" width="800" height="500" alt="Photo" />
- Use unique name= values within a section.
- Keep real copy from the source page when the user asks to maintain content; only restyle it.
- Images: leave src="" (the editor will pick media). Set sensible width/height from the layout.
- Do not invent CMS features. No React/Vue. Semantic HTML + Tailwind only.
- Header/footer in coreHtml should look complete but not include page-specific hero/content.`;

export type ImportPlan = {
  siteTitle: string;
  coreHtml: string;
  sections: { name: string; html: string }[];
};

export async function planSiteFromUrl(opts: {
  sourceUrl: string;
  prompt: string;
}): Promise<ImportPlan> {
  if (!xaiApiKey()) {
    throw new Error(
      "XAI_API_KEY is not set. Add it to .env from https://console.x.ai",
    );
  }

  const sourceHtml = await fetchPageHtml(opts.sourceUrl);
  const raw = await grokChat({
    system: SYSTEM,
    user: `Source URL: ${opts.sourceUrl}

Editor brief:
${opts.prompt.trim()}

--- SOURCE HTML (scripts/styles stripped) ---
${sourceHtml}`,
    temperature: 0.35,
    timeoutMs: 180_000,
  });

  const parsed = extractJsonObject(raw) as Partial<ImportPlan>;
  const siteTitle = String(parsed.siteTitle || "Imported site").slice(0, 160);
  const coreHtml = String(parsed.coreHtml || "");
  const sections = Array.isArray(parsed.sections)
    ? parsed.sections
        .map((s) => ({
          name: String(s?.name || "Section").slice(0, 80),
          html: String(s?.html || "").trim(),
        }))
        .filter((s) => s.html)
    : [];

  if (!coreHtml.includes("{{sections}}")) {
    throw new Error("Grok did not return a valid Home template (missing {{sections}})");
  }
  if (!sections.length) {
    throw new Error("Grok did not return any sections");
  }

  return { siteTitle, coreHtml, sections };
}

export async function importSiteFromUrl(opts: {
  organizationId: string;
  name?: string;
  sourceUrl: string;
  prompt: string;
  creatorUserId: string;
}) {
  const plan = await planSiteFromUrl({
    sourceUrl: opts.sourceUrl,
    prompt: opts.prompt,
  });

  const site = await createSiteForOrg({
    organizationId: opts.organizationId,
    name: (opts.name || plan.siteTitle).trim(),
    siteTitle: plan.siteTitle,
    cssFramework: "tailwind",
    creatorUserId: opts.creatorUserId,
  });

  const language = site.languages[0];
  if (!language) throw new Error("Site language missing");

  const set = await prisma.templateSet.create({
    data: {
      siteId: site.id,
      name: `${site.name} templates`,
    },
  });

  const template = await prisma.template.create({
    data: {
      templateSetId: set.id,
      name: "Home",
      coreHtml: plan.coreHtml,
      menuHtml: "",
      submenuHtml: "",
    },
  });

  const blocks = [];
  for (let i = 0; i < plan.sections.length; i++) {
    const s = plan.sections[i];
    const tb = await prisma.templateBlock.create({
      data: {
        templateId: template.id,
        name: s.name,
        defaultHtml: s.html,
        isRepeatable: false,
        sortOrder: i,
      },
    });
    blocks.push(tb);
  }

  const page = await prisma.page.create({
    data: {
      siteId: site.id,
      languageId: language.id,
      templateId: template.id,
      authorId: opts.creatorUserId,
      title: "Home",
      menuTitle: "Home",
      slug: "home",
      isDefault: true,
      inMenu: true,
      sortOrder: 0,
      blocks: {
        create: blocks.map((b, i) => ({
          templateBlockId: b.id,
          content: serializeFields(emptyFieldsFromTemplate(b.defaultHtml)),
          sortOrder: i,
        })),
      },
    },
  });

  await prisma.siteSetting.create({
    data: {
      siteId: site.id,
      key: "importedFromUrl",
      value: opts.sourceUrl,
    },
  });

  return {
    site,
    pageId: page.id,
    templateId: template.id,
    sectionCount: blocks.length,
  };
}
