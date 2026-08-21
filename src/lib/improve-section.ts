/**
 * Ask Grok to repair one CMS section using the current layout + original
 * source band + a user prompt. Result is applied as a new version.
 */

import { prisma } from "./db";
import { grokChat, extractJsonObject, xaiApiKey } from "./xai";
import { GROK_IMPORT_TIMEOUT_MS } from "./import-job";
import { extractBalanced, findById, stripTags, bodyInner } from "./html-split";
import { wrapCloneMarkers } from "./clone-bands";
import {
  emptyFieldsFromTemplate,
  parseSectionFields,
  parseStoredContent,
  repeatGroupsFromHtml,
  serializeContent,
  META,
} from "./sections";
import { scrapeBrowserUa } from "./scrape-page";

const MAX_BAND = 80_000;
const MAX_VERSIONS = 12;

export type SectionVersionLite = {
  id: string;
  source: string;
  prompt: string;
  summary: string;
  createdAt: string;
};

const SYSTEM = `You repair ONE website section for a CMS. Return a JSON object only:
{
  "html": "section fragment",
  "css": "extra CSS or empty string",
  "js": "vanilla JS or empty string",
  "summary": "one sentence of what you changed"
}

Rules:
- html is a fragment (no <html>, <body>, or markdown fences).
- Keep existing CMS markers and their name= values whenever possible:
  <multiline name="Heading 1">…</multiline>
  <img editable="true" name="Image 1" src="…" />
- Add new markers only for new editable copy/images.
- Match the CURRENT section's look (inline styles / existing classes). Do not restyle into Tailwind unless the current HTML already uses Tailwind utilities.
- Do not rewrite marketing copy unless the user asked.
- css: extra CSS only, no <style> tags.
- js: vanilla JavaScript only, no <script> tags, no React, no JSX, no imports, no eval, no document.write.
- For a monthly/yearly (or similar) toggle: put both amounts on the element (data-monthly / data-yearly) and toggle them with a click handler. Use event delegation on the section root.
- Prefer repairing missing behavior over inventing a new layout.
- Do not wrap unique headings or intros in <repeatable>. That tag is only for repeating cards/rows.
- Do not leave copy at opacity:0. Strip scroll-reveal hide styles (lp-reveal-pending opacity/transform) so the section is visible without extra JS.`;

/** Unique h1/h2 intros must not live in <repeatable> (clone false-positives). */
export function unwrapHeadingRepeatables(html: string): string {
  if (!html || !/<repeatable\b/i.test(html)) return html;
  return html.replace(
    /<repeatable(\s[^>]*)?>([\s\S]*?)<\/repeatable>/gi,
    (full, _attrs: string, inner: string) => {
      const sample = inner
        .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
        .replace(/<script\b[\s\S]*?<\/script>/gi, " ");
      const hasHeading = /<h[12]\b/i.test(sample);
      const cardish =
        (sample.match(/<(article|li)\b/gi) || []).length >= 2 ||
        /lp-how-row|lp-create-grid|lp-faq-question|et_pb_blurb|elementor-column/i.test(
          sample,
        );
      if (hasHeading && !cardish) {
        return inner.replace(/\s+slot=(["']).*?\1/gi, "");
      }
      return full;
    },
  );
}

function cap(html: string, max = MAX_BAND) {
  if (html.length <= max) return html;
  return html.slice(0, max) + "\n<!-- truncated -->";
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function attrFromOpen(open: string, name: string): string {
  const m = open.match(
    new RegExp(`\\b${escapeRe(name)}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"),
  );
  return (m?.[2] ?? m?.[3] ?? "").trim();
}

export function extractSourceBand(
  sourceHtml: string,
  sectionHtml: string,
  sectionName: string,
): string {
  const body = bodyInner(sourceHtml) || sourceHtml;
  const open = sectionHtml.match(/^<[a-zA-Z][a-zA-Z0-9]*\b[^>]*>/)?.[0] || "";
  const id = attrFromOpen(open, "id");
  if (id) {
    const hit = findById(body, id) || findById(sourceHtml, id);
    if (hit && hit.length > 80) return cap(hit);
  }
  const lp = attrFromOpen(open, "data-lp-section");
  if (lp) {
    const re = new RegExp(
      `<([a-zA-Z][a-zA-Z0-9]*)\\b[^>]*\\bdata-lp-section\\s*=\\s*["']${escapeRe(lp)}["'][^>]*>`,
      "i",
    );
    const m = body.match(re);
    if (m?.index != null) {
      const hit = extractBalanced(body, m.index);
      if (hit && hit.length > 80) return cap(hit);
    }
  }
  const heading = stripTags(sectionName).replace(/&#\w+;|&\w+;/g, " ").trim();
  if (heading.length >= 6) {
    const needle = heading.slice(0, 48).toLowerCase();
    const idx = body.toLowerCase().indexOf(needle);
    if (idx >= 0) {
      const before = body.slice(0, idx);
      let start = -1;
      const re = /<(section|article|div)\b[^>]*>/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(before))) start = m.index;
      if (start >= 0) {
        const hit = extractBalanced(body, start);
        if (hit && hit.length > 120 && hit.length < 220_000) return cap(hit);
      }
      return cap(body.slice(Math.max(0, idx - 400), idx + 14_000));
    }
  }
  return "";
}

export async function fetchSourceHtml(url: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent": scrapeBrowserUa,
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) {
      throw new Error(`Could not fetch the original page (HTTP ${res.status}).`);
    }
    const html = await res.text();
    return html.replace(/<script\b[\s\S]*?<\/script>/gi, "");
  } catch (e) {
    if (e && typeof e === "object" && "name" in e && e.name === "AbortError") {
      throw new Error("Timed out fetching the original page.");
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

function stripCss(raw: string) {
  return raw
    .replace(/<\/?style\b[^>]*>/gi, "")
    .replace(/^```(?:css)?\s*|\s*```$/gi, "")
    .trim();
}

function stripJs(raw: string) {
  const s = raw
    .replace(/<\/?script\b[^>]*>/gi, "")
    .replace(/^```(?:js|javascript)?\s*|\s*```$/gi, "")
    .trim();
  if (/document\.write\s*\(|\beval\s*\(/i.test(s)) {
    throw new Error("Grok returned JavaScript we cannot run (eval/document.write).");
  }
  if (/\bimport\s+|from\s+['"]react['"]|ReactDOM|jsx\b/i.test(s)) {
    throw new Error("Grok returned React/JSX. Ask again: vanilla JS only.");
  }
  return s;
}

function stripHtml(raw: string) {
  let s = raw.trim();
  const fence = s.match(/^```(?:html)?\s*([\s\S]*?)```$/i);
  if (fence) s = fence[1].trim();
  s = s.replace(/^\s*<!DOCTYPE[\s\S]*?<body[^>]*>/i, "").replace(/<\/body>[\s\S]*$/i, "");
  return s.trim();
}

function mergeFields(
  html: string,
  previous: Record<string, string>,
): Record<string, string> {
  const defs = parseSectionFields(html);
  const fields = emptyFieldsFromTemplate(html);
  for (const d of defs) {
    const prev = previous[d.key];
    if (prev != null && prev !== "") fields[d.key] = prev;
    if (d.type === "image") {
      const altKey = d.key + META.alt;
      if (previous[altKey]) fields[altKey] = previous[altKey];
    }
  }
  return fields;
}

async function snapshotVersion(opts: {
  pageBlockId: string;
  source: string;
  prompt?: string;
  summary?: string;
  layoutHtml: string;
  css: string;
  js: string;
  fields: Record<string, string>;
}) {
  await prisma.pageBlockVersion.create({
    data: {
      pageBlockId: opts.pageBlockId,
      source: opts.source,
      prompt: (opts.prompt || "").slice(0, 2000),
      summary: (opts.summary || "").slice(0, 400),
      layoutHtml: opts.layoutHtml,
      css: opts.css,
      js: opts.js,
      fieldsJson: JSON.stringify(opts.fields || {}),
    },
  });
  const rows = await prisma.pageBlockVersion.findMany({
    where: { pageBlockId: opts.pageBlockId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (rows.length > MAX_VERSIONS) {
    const keep = new Set<string>([
      rows[0].id,
      ...rows.slice(-(MAX_VERSIONS - 1)).map((r) => r.id),
    ]);
    await prisma.pageBlockVersion.deleteMany({
      where: {
        pageBlockId: opts.pageBlockId,
        id: { notIn: [...keep] },
      },
    });
  }
}

export async function listSectionVersions(
  pageBlockId: string,
): Promise<SectionVersionLite[]> {
  const rows = await prisma.pageBlockVersion.findMany({
    where: { pageBlockId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      source: true,
      prompt: true,
      summary: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function restoreSectionVersion(opts: {
  pageId: string;
  sectionId: string;
  versionId: string;
}) {
  const block = await prisma.pageBlock.findFirst({
    where: { id: opts.sectionId, pageId: opts.pageId },
    include: { templateBlock: { select: { defaultHtml: true, name: true } } },
  });
  if (!block) throw new Error("Section not found");
  const version = await prisma.pageBlockVersion.findFirst({
    where: { id: opts.versionId, pageBlockId: block.id },
  });
  if (!version) throw new Error("Version not found");

  const parsed = parseStoredContent(
    block.content,
    block.templateBlock?.defaultHtml || "",
  );
  await snapshotVersion({
    pageBlockId: block.id,
    source: "restore",
    prompt: "",
    summary: `Restored ${version.source} version`,
    layoutHtml: parsed.layoutHtml || block.templateBlock?.defaultHtml || "",
    css: block.css || "",
    js: block.js || "",
    fields: parsed.fields,
  });

  let fields: Record<string, string> = {};
  try {
    fields = JSON.parse(version.fieldsJson || "{}") as Record<string, string>;
  } catch {
    fields = parsed.fields;
  }
  const content = serializeContent({
    fields,
    layoutHtml: version.layoutHtml,
    repeatGroups: parsed.repeatGroups,
  });
  const updated = await prisma.pageBlock.update({
    where: { id: block.id },
    data: {
      content,
      css: version.css,
      js: version.js,
    },
    include: {
      templateBlock: true,
      repeatItems: { orderBy: { sortOrder: "asc" } },
    },
  });
  return {
    section: updated,
    versions: await listSectionVersions(block.id),
  };
}

export async function improveSectionWithGrok(opts: {
  pageId: string;
  sectionId: string;
  prompt: string;
}) {
  if (!xaiApiKey()) {
    throw new Error(
      "XAI_API_KEY is not set. Add it to .env (https://console.x.ai).",
    );
  }
  const prompt = opts.prompt.trim();
  if (prompt.length < 4) throw new Error("Write a short instruction for Grok.");

  const page = await prisma.page.findUnique({
    where: { id: opts.pageId },
    include: {
      site: {
        select: {
          id: true,
          sourceUrl: true,
          cssFramework: true,
          settings: { select: { key: true, value: true } },
        },
      },
    },
  });
  if (!page) throw new Error("Page not found");

  const block = await prisma.pageBlock.findFirst({
    where: { id: opts.sectionId, pageId: opts.pageId },
    include: { templateBlock: true },
  });
  if (!block) throw new Error("Section not found");

  const templateHtml = block.templateBlock?.defaultHtml || "";
  const parsed = parseStoredContent(block.content, templateHtml);
  const currentHtml = parsed.layoutHtml || templateHtml;
  if (!currentHtml.trim()) throw new Error("This section has no HTML to improve.");

  const sourceUrl =
    page.site.sourceUrl.trim() ||
    page.site.settings.find((s) => s.key === "importedFromUrl")?.value ||
    "";
  let sourceBand = "";
  if (sourceUrl) {
    try {
      const sourceHtml = await fetchSourceHtml(sourceUrl);
      sourceBand = extractSourceBand(
        sourceHtml,
        currentHtml,
        block.templateBlock?.name || prompt,
      );
    } catch (e) {
      sourceBand = `<!-- could not fetch source: ${e instanceof Error ? e.message : "error"} -->`;
    }
  }

  const snap = page.site.settings.find((s) => s.key === "cloneSnapshot")?.value || "";
  let builder = "unknown";
  try {
    builder = String(JSON.parse(snap || "{}").builder || "unknown");
  } catch {
    /* keep unknown */
  }

  const raw = await grokChat({
    system: SYSTEM,
    user: `Site CSS framework: ${page.site.cssFramework || "custom"}
Section name: ${block.templateBlock?.name || "Section"}
User request:
${prompt}

--- CURRENT CMS SECTION ---
${cap(currentHtml)}

${sourceBand ? `--- ORIGINAL SOURCE BAND ---\n${cap(sourceBand)}` : "--- ORIGINAL SOURCE BAND ---\n(none — no scrape URL, work from the current section only)"}`,
    temperature: 0.25,
    timeoutMs: GROK_IMPORT_TIMEOUT_MS,
    json: true,
  });

  const parsedJson = extractJsonObject(raw) as {
    html?: string;
    css?: string;
    js?: string;
    summary?: string;
  };
  let html = stripHtml(String(parsedJson.html || ""));
  if (html.length < 40) {
    throw new Error("Grok did not return enough HTML for this section.");
  }
  if (!/<multiline\b/i.test(html) && !/<img\b[^>]*editable/i.test(html)) {
    html = wrapCloneMarkers(html, builder);
  }
  html = unwrapHeadingRepeatables(html);
  const css = stripCss(String(parsedJson.css || "")) || block.css || "";
  const js = stripJs(String(parsedJson.js || ""));
  const summary = String(parsedJson.summary || "Updated this section.").slice(0, 400);

  const versionCount = await prisma.pageBlockVersion.count({
    where: { pageBlockId: block.id },
  });
  if (versionCount === 0) {
    await snapshotVersion({
      pageBlockId: block.id,
      source: "scrape",
      prompt: "",
      summary: "Original layout",
      layoutHtml: currentHtml,
      css: block.css || "",
      js: block.js || "",
      fields: parsed.fields,
    });
  }

  const fields = mergeFields(html, parsed.fields);
  const nextGroups = repeatGroupsFromHtml(html);
  const content = serializeContent({
    fields,
    layoutHtml: html,
    repeatGroups: nextGroups.length ? nextGroups : undefined,
  });

  await prisma.pageBlock.update({
    where: { id: block.id },
    data: { content, css, js },
  });

  const keepGroups = nextGroups.map((g) => g.key);
  if (keepGroups.length === 0) {
    await prisma.pageBlockRepeatItem.deleteMany({
      where: { pageBlockId: block.id },
    });
  } else {
    await prisma.pageBlockRepeatItem.deleteMany({
      where: { pageBlockId: block.id, groupKey: { notIn: keepGroups } },
    });
  }

  await snapshotVersion({
    pageBlockId: block.id,
    source: "grok",
    prompt,
    summary,
    layoutHtml: html,
    css,
    js,
    fields,
  });

  const updated = await prisma.pageBlock.findFirst({
    where: { id: block.id },
    include: {
      templateBlock: true,
      repeatItems: { orderBy: { sortOrder: "asc" } },
    },
  });
  return {
    section: updated,
    summary,
    versions: await listSectionVersions(block.id),
  };
}
