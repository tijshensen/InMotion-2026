/**
 * Fetch a public URL and ask Grok to rebuild it as a Tailwind CMS site
 * (Home template shell + named editable sections).
 */

import { prisma } from "./db";
import { createSiteForOrg, slugifySite } from "./sites";
import { grokChat, extractJsonObject, xaiApiKey } from "./xai";
import {
  emptyFieldsFromTemplate,
  serializeContent,
  serializeFields,
} from "./sections";
import {
  harvestRepeatSeedsFromSource,
  prepareRepeatableSection,
  repeatSeedsAreClones,
} from "./section-repeat";
import { scheduleSectionPreview } from "./section-preview";

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

const DEFAULT_MENU_SNIPPET = `<ul class="cms-menu flex flex-col md:flex-row md:flex-wrap md:items-center">
<menu type="head">
<li class="[[currentindicator]]"><a class="block px-3 py-2 text-sm font-medium" href="[[href]]">[[title]]</a></li>
</menu>
<menu type="head-with-dropdown">
<li class="group relative [[currentindicator]]">
  <a class="block px-3 py-2 text-sm font-medium" href="[[href]]">[[title]]</a>
  <ul class="cms-submenu hidden flex-col md:absolute md:left-0 md:top-full md:z-50 md:min-w-[14rem] md:rounded-lg md:border md:bg-white md:py-1 md:shadow-lg md:group-hover:flex">
    <menuitem type="dropdown">
    <li><a class="block px-3 py-2 text-sm" href="[[href]]">[[title]]</a></li>
    </menuitem>
  </ul>
</li>
</menu>
</ul>`;

const DEFAULT_SUBMENU_SNIPPET = `<ul>
<menuitem type="submenu">
<li class="[[currentindicator]]"><a href="[[href]]">[[title]]</a></li>
</menuitem>
</ul>`;

const SYSTEM = `You convert a homepage's HTML into a CMSinMotion site using Tailwind CSS.

Return ONLY valid JSON (no markdown, no comments). Escape every double
quote inside string values as \\". HTML attributes must be written as
class=\\"foo\\" not class="foo". Use \\n for newlines inside strings.
{
  "siteTitle": "string",
  "coreHtml": "full HTML document for the Home page template (header + footer + tokens)",
  "menuHtml": "menu item snippet for {{menu}}",
  "submenuHtml": "submenu item snippet for {{submenu}}",
  "sections": [
    { "name": "Hero", "html": "section markup with CMS markers" }
  ]
}

Rules:
- Use Tailwind utility classes only (no Bootstrap). Include Tailwind via:
  <script src="https://cdn.tailwindcss.com"></script> in <head> of coreHtml.
- coreHtml MUST include exactly these tokens:
  {{page.title}} {{page.metaDescription}} {{site.title}} {{menu}} {{sections}}
- Put site-wide header (logo, nav) and footer in coreHtml. Use {{menu}} for the nav (do not hard-code page links).
- menuHtml is NOT the live menu. It is a reusable item pattern matching the header style in coreHtml:
  <menu type="head">…[[href]] [[title]] [[currentindicator]]…</menu>
  <menu type="head-with-dropdown">… plus <menuitem type="dropdown">…</menuitem> …</menu>
- submenuHtml uses <menuitem type="submenu"> with the same tokens.
- Match the source nav's look (colors, spacing) with Tailwind, but keep those MotionCMS tags so the Menu builder can fill the tree later.
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

export type ImportSection = {
  name: string;
  html: string;
  repeatSeeds?: { groupKey: string; fields: Record<string, string> }[];
};

export type ImportPlan = {
  siteTitle: string;
  coreHtml: string;
  menuHtml: string;
  submenuHtml: string;
  sections: ImportSection[];
};

/** Collapse similar cards after Grok returns — never part of the prompt. */
export function collapseRepeatsAfterImport(
  html: string,
  sourceHtml?: string,
): {
  html: string;
  repeatSeeds: { groupKey: string; fields: Record<string, string> }[];
} {
  const prepared = prepareRepeatableSection(html);
  let items = prepared.items;
  if (
    sourceHtml &&
    (items.length < 2 || repeatSeedsAreClones(items))
  ) {
    const harvested = harvestRepeatSeedsFromSource(
      sourceHtml,
      prepared.html,
      items.length,
    );
    if (harvested?.length) items = harvested;
  }
  if (!items.length) return { html: prepared.html, repeatSeeds: [] };
  return {
    html: prepared.html,
    repeatSeeds: items.map((it) => ({
      groupKey: it.groupKey,
      fields: it.fields,
    })),
  };
}

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
    json: true,
  });

  const parsed = extractJsonObject(raw) as Partial<ImportPlan>;
  const siteTitle = String(parsed.siteTitle || "Imported site").slice(0, 160);
  const coreHtml = String(parsed.coreHtml || "");
  const sections = Array.isArray(parsed.sections)
    ? parsed.sections
        .map((s) => {
          const rawHtml = String(s?.html || "").trim();
          const collapsed = collapseRepeatsAfterImport(rawHtml, sourceHtml);
          return {
            name: String(s?.name || "Section").slice(0, 80),
            html: collapsed.html,
            repeatSeeds: collapsed.repeatSeeds,
          };
        })
        .filter((s) => s.html)
    : [];

  if (!coreHtml.includes("{{sections}}")) {
    throw new Error("Grok did not return a valid Home template (missing {{sections}})");
  }
  if (!sections.length) {
    throw new Error("Grok did not return any sections");
  }

  const menuHtml = String(parsed.menuHtml || "").trim();
  const submenuHtml = String(parsed.submenuHtml || "").trim();

  return {
    siteTitle,
    coreHtml,
    menuHtml:
      /<menu\b/i.test(menuHtml) || /<menuitem\b/i.test(menuHtml)
        ? menuHtml
        : DEFAULT_MENU_SNIPPET,
    submenuHtml:
      /<menuitem\b/i.test(submenuHtml) ? submenuHtml : DEFAULT_SUBMENU_SNIPPET,
    sections,
  };
}

async function uniquePageSlug(
  siteId: string,
  languageId: string,
  base: string,
) {
  let slug = slugifySite(base) || "page";
  let n = 0;
  while (
    await prisma.page.findUnique({
      where: { siteId_languageId_slug: { siteId, languageId, slug } },
    })
  ) {
    n += 1;
    slug = `${slugifySite(base) || "page"}-${n}`;
  }
  return slug;
}

async function uniqueTemplateName(templateSetId: string, base: string) {
  const root = base.trim() || "Page";
  let name = root;
  let n = 0;
  while (
    await prisma.template.findFirst({
      where: { templateSetId, name },
      select: { id: true },
    })
  ) {
    n += 1;
    name = `${root} ${n}`;
  }
  return name;
}

/** Persist a Grok import plan as a page template + section layouts. */
export async function applyImportPlanAsTemplate(opts: {
  siteId: string;
  plan: ImportPlan;
  templateName?: string;
}) {
  const site = await prisma.site.findUnique({
    where: { id: opts.siteId },
    select: { id: true, name: true },
  });
  if (!site) throw new Error("Site not found");

  let set = await prisma.templateSet.findFirst({
    where: { siteId: site.id },
    orderBy: { name: "asc" },
  });
  if (!set) {
    set = await prisma.templateSet.create({
      data: { siteId: site.id, name: `${site.name} templates` },
    });
  }

  if (
    (opts.plan.menuHtml || opts.plan.submenuHtml) &&
    !(set.menuHtml || "").trim()
  ) {
    await prisma.templateSet.update({
      where: { id: set.id },
      data: {
        menuHtml: opts.plan.menuHtml || set.menuHtml,
        submenuHtml: opts.plan.submenuHtml || set.submenuHtml,
      },
    });
  }

  const template = await prisma.template.create({
    data: {
      templateSetId: set.id,
      name: await uniqueTemplateName(
        set.id,
        opts.templateName || opts.plan.siteTitle || "Imported",
      ),
      coreHtml: opts.plan.coreHtml,
      menuHtml: opts.plan.menuHtml || "",
      submenuHtml: opts.plan.submenuHtml || "",
    },
  });

  const blocks = [];
  for (let i = 0; i < opts.plan.sections.length; i++) {
    const s = opts.plan.sections[i];
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
    scheduleSectionPreview(tb.id);
  }

  return { templateId: template.id, sectionCount: blocks.length };
}

/** Persist a Grok import plan as a page template + sections + page. */
export async function applyImportPlan(opts: {
  siteId: string;
  languageId: string;
  plan: ImportPlan;
  creatorUserId: string;
  title?: string;
  slug?: string;
  menuTitle?: string;
  templateName?: string;
  isDefault?: boolean;
}) {
  const title = (opts.title || opts.plan.siteTitle || "Home").trim();
  const { templateId, sectionCount } = await applyImportPlanAsTemplate({
    siteId: opts.siteId,
    plan: opts.plan,
    templateName: opts.templateName || title,
  });

  const blocks = await prisma.templateBlock.findMany({
    where: { templateId },
    orderBy: { sortOrder: "asc" },
  });

  const page = await prisma.page.create({
    data: {
      siteId: opts.siteId,
      languageId: opts.languageId,
      templateId,
      authorId: opts.creatorUserId,
      title,
      menuTitle: (opts.menuTitle || title).trim(),
      slug: await uniquePageSlug(
        opts.siteId,
        opts.languageId,
        opts.slug || title,
      ),
      isDefault: Boolean(opts.isDefault),
      inMenu: true,
      sortOrder: 0,
      blocks: {
        create: blocks.map((b, i) => ({
          templateBlockId: b.id,
          content: serializeContent({
            fields: emptyFieldsFromTemplate(b.defaultHtml),
            layoutHtml: b.defaultHtml,
          }),
          sortOrder: i,
          repeatItems: {
            create: (opts.plan.sections[i]?.repeatSeeds || []).map(
              (seed, ri) => ({
                groupKey: seed.groupKey,
                sortOrder: ri,
                origin: "scraped",
                content: serializeFields(seed.fields),
              }),
            ),
          },
        })),
      },
    },
  });

  return {
    pageId: page.id,
    templateId,
    sectionCount,
  };
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

  const applied = await applyImportPlan({
    siteId: site.id,
    languageId: language.id,
    plan,
    creatorUserId: opts.creatorUserId,
    title: "Home",
    slug: "home",
    menuTitle: "Home",
    templateName: "Home",
    isDefault: true,
  });

  await prisma.siteSetting.create({
    data: {
      siteId: site.id,
      key: "importedFromUrl",
      value: opts.sourceUrl,
    },
  });

  return { site, ...applied };
}

/** Same Grok plan as site import, saved as a template + section layouts only. */
export async function importTemplateFromUrl(opts: {
  siteId: string;
  sourceUrl: string;
  prompt?: string;
  name?: string;
}) {
  const prompt = (opts.prompt || (await getImportPrompt())).trim();
  const plan = await planSiteFromUrl({
    sourceUrl: opts.sourceUrl,
    prompt,
  });
  return applyImportPlanAsTemplate({
    siteId: opts.siteId,
    plan,
    templateName: opts.name || plan.siteTitle,
  });
}
