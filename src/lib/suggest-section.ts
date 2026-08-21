/**
 * Cheap Grok review of one section: compare current fields / unmarked
 * copy / repeats (and the original band when we have a scrape URL) and
 * return prompt chips the user can send to Ask Grok.
 */

import { prisma } from "./db";
import {
  grokChat,
  extractJsonObject,
  xaiApiKey,
  xaiCheapModel,
} from "./xai";
import {
  extractSourceBand,
  fetchSourceHtml,
} from "./improve-section";
import {
  htmlWithoutRepeatableBodies,
  parseSectionFields,
  parseStoredContent,
  repeatGroupsFromHtml,
  type FieldType,
  type RepeatGroupDef,
  type SectionField,
} from "./sections";

const SUGGEST_TIMEOUT_MS = 25_000;
const MAX_FIELDS = 24;
const MAX_UNMARKED = 18;
const MAX_REPEATS = 6;
const PREVIEW = 120;

const CHEAP_FALLBACKS = [
  "grok-4-1-fast-non-reasoning",
  "grok-4-fast-non-reasoning",
  "grok-build-0.1",
  "grok-4.3",
];

export type SuggestField = {
  type: FieldType;
  name: string;
  preview: string;
};

export type SuggestRepeat = {
  group: string;
  itemCount: number;
  itemFields: SuggestField[];
  unmarkedInItem: SuggestUnmarked[];
};

export type SuggestUnmarked = {
  kind: "text" | "image";
  tag: string;
  preview: string;
};

export type SuggestGap = {
  title: string;
  detail: string;
};

export type SuggestResult = {
  gaps: SuggestGap[];
  prompts: string[];
  notice: string;
  hasOriginal: boolean;
};

type Inventory = {
  sectionName: string;
  cssFramework: string;
  fields: SuggestField[];
  repeats: SuggestRepeat[];
  unmarked: SuggestUnmarked[];
  original: {
    found: boolean;
    headings: string[];
    buttons: string[];
    interactive: string[];
    imageCount: number;
    error?: string;
  } | null;
};

const SYSTEM = `You review ONE website section for a CMS. You do NOT rewrite HTML.
Return a JSON object only:
{
  "gaps": [{ "title": "short", "detail": "one sentence" }],
  "prompts": ["instruction for a later rewrite model"],
  "notice": "one line for the editor user"
}

Look at:
1. CURRENT FIELDS — singleline / multiline / image the user can already edit.
2. UNMARKED — visible copy or images with no CMS marker. Suggest wrapping them as <singleline>, <multiline>, or <img editable="true">.
3. REPEATABLES — item template fields vs leftover text/images inside the item HTML. Every card/row should be editable from the template.
4. ORIGINAL — if present, missing controls or blocks vs current (toggle, slider, tabs, extra column). Do not nitpick CSS or pixel layout.

Write 0–3 prompts as instructions to a rewrite model:
- Specific, one job each.
- Keep the current look and marketing copy unless the gap is missing copy or a missing control.
- When the job is editability, say which markers to add and keep existing name= values.
- Do not invent gaps. If the section looks complete, return empty prompts and a short notice.

Max 3 gaps, max 3 prompts. No markdown fences.`;

function previewOf(raw: string, max = PREVIEW): string {
  const text = String(raw || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#\d+;|&\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

function fieldsFrom(
  html: string,
  values?: Record<string, string>,
): SuggestField[] {
  return parseSectionFields(html)
    .slice(0, MAX_FIELDS)
    .map((f: SectionField) => ({
      type: f.type,
      name: f.label,
      preview: previewOf(values?.[f.key] || f.defaultValue || ""),
    }));
}

function attr(tag: string, name: string): string {
  const m = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"),
  );
  return (m?.[2] ?? m?.[3] ?? m?.[4] ?? "").trim();
}

function isTrackingSrc(src: string): boolean {
  if (!src) return true;
  if (src.startsWith("data:image/svg")) return true;
  return /pixel|1x1|tracking|spacer\.gif|gravatar\.com\/avatar/i.test(src);
}

function collectUnmarked(html: string, known: SuggestField[]): SuggestUnmarked[] {
  if (!html) return [];
  const knownNorm = new Set(
    known
      .map((f) => f.preview.replace(/…$/, "").trim().toLowerCase())
      .filter((s) => s.length >= 8),
  );
  const already = (text: string) => {
    const n = text.toLowerCase();
    if (n.length < 3) return true;
    for (const k of knownNorm) {
      if (k.includes(n) || n.includes(k)) return true;
    }
    return false;
  };

  const stripped = htmlWithoutRepeatableBodies(html)
    .replace(/<multiline\b[^>]*>[\s\S]*?<\/multiline>/gi, " ")
    .replace(/<singleline\b[^>]*>[\s\S]*?<\/singleline>/gi, " ")
    .replace(/<file\b[^>]*>[\s\S]*?<\/file>/gi, " ")
    .replace(/<img\b[^>]*\beditable\s*=\s*["']true["'][^>]*\/?>/gi, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const out: SuggestUnmarked[] = [];
  const textRe =
    /<(h[1-6]|p|li|button|a|label|figcaption|blockquote|td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = textRe.exec(stripped))) {
    const preview = previewOf(m[2]);
    if (preview.length < 4) continue;
    if (!/[a-zA-ZÀ-ÿ]/.test(preview)) continue;
    if (already(preview.replace(/…$/, ""))) continue;
    out.push({ kind: "text", tag: m[1].toLowerCase(), preview });
    if (out.length >= MAX_UNMARKED) return out;
  }

  const imgRe = /<img\b[^>]*>/gi;
  while ((m = imgRe.exec(stripped))) {
    const tag = m[0];
    if (/\beditable\s*=\s*["']true["']/i.test(tag)) continue;
    const src = attr(tag, "src");
    if (isTrackingSrc(src)) continue;
    const alt = attr(tag, "alt");
    const shortSrc = src.replace(/\?.*$/, "").split("/").pop() || src;
    out.push({
      kind: "image",
      tag: "img",
      preview: previewOf(alt || shortSrc, 80),
    });
    if (out.length >= MAX_UNMARKED) return out;
  }
  return out;
}

function originalSignals(html: string) {
  const headings = [...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .map((m) => previewOf(m[2], 80))
    .filter(Boolean)
    .slice(0, 12);
  const buttons = [
    ...html.matchAll(
      /<(button|a)\b[^>]*>([\s\S]*?)<\/\1>/gi,
    ),
  ]
    .map((m) => previewOf(m[2], 60))
    .filter((t) => t.length >= 2 && t.length <= 48)
    .slice(0, 12);
  const interactive: string[] = [];
  const tests: [RegExp, string][] = [
    [/data-monthly|data-yearly|billing.?toggle|price.?toggle/i, "price-toggle"],
    [/swiper|slick-slider|\bet_pb_slider\b|elementor-swiper/i, "slider"],
    [/\bet_pb_tabs\b|\belementor-tabs\b|role=["']tab["']/i, "tabs"],
    [/\bet_pb_toggle\b|\bet_pb_accordion\b|elementor-accordion/i, "accordion"],
    [/data-lp-section=["']pricing|id=["'][^"']*pricing/i, "pricing"],
    [/\bmenu-toggle\b|\bnav-toggle\b|\bhamburger\b/i, "mobile-menu"],
  ];
  for (const [re, label] of tests) {
    if (re.test(html)) interactive.push(label);
  }
  const imageCount = (html.match(/<img\b/gi) || []).length;
  return { headings, buttons, interactive, imageCount };
}

function buildInventory(opts: {
  sectionName: string;
  cssFramework: string;
  layoutHtml: string;
  fields: Record<string, string>;
  groups: RepeatGroupDef[];
  repeatItems: { groupKey: string; content: string }[];
}): Omit<Inventory, "original"> {
  const fields = fieldsFrom(opts.layoutHtml, opts.fields);
  const unmarked = collectUnmarked(opts.layoutHtml, fields);
  const repeats: SuggestRepeat[] = opts.groups.slice(0, MAX_REPEATS).map((g) => {
    const itemFields = fieldsFrom(g.itemHtml);
    const count = opts.repeatItems.filter((i) => i.groupKey === g.key).length;
    return {
      group: g.key,
      itemCount: count || g.defaultItems || 0,
      itemFields,
      unmarkedInItem: collectUnmarked(g.itemHtml, itemFields),
    };
  });
  return {
    sectionName: opts.sectionName,
    cssFramework: opts.cssFramework,
    fields,
    repeats,
    unmarked,
  };
}

async function cheapChat(system: string, user: string): Promise<string> {
  const tried = new Set<string>();
  const models = [xaiCheapModel(), ...CHEAP_FALLBACKS].filter((m) => {
    if (tried.has(m)) return false;
    tried.add(m);
    return true;
  });
  let last: Error | null = null;
  for (const model of models) {
    try {
      return await grokChat({
        system,
        user,
        model,
        json: true,
        temperature: 0.2,
        timeoutMs: SUGGEST_TIMEOUT_MS,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      last = e instanceof Error ? e : new Error(msg);
      if (/model[_ -]?not[_ -]?found|does not exist|unknown model|invalid model|no such model/i.test(msg)) {
        continue;
      }
      throw e;
    }
  }
  throw last || new Error("No cheap Grok model available.");
}

export async function suggestSectionPrompts(opts: {
  pageId: string;
  sectionId: string;
}): Promise<SuggestResult> {
  if (!xaiApiKey()) {
    throw new Error(
      "XAI_API_KEY is not set. Add it to .env (https://console.x.ai).",
    );
  }

  const page = await prisma.page.findUnique({
    where: { id: opts.pageId },
    include: {
      site: {
        select: {
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
    include: {
      templateBlock: true,
      repeatItems: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!block) throw new Error("Section not found");

  const templateHtml = block.templateBlock?.defaultHtml || "";
  const parsed = parseStoredContent(block.content, templateHtml);
  const layoutHtml = parsed.layoutHtml || templateHtml;
  if (!layoutHtml.trim()) throw new Error("This section has no HTML to review.");

  const groups =
    parsed.repeatGroups?.length
      ? parsed.repeatGroups
      : repeatGroupsFromHtml(layoutHtml);

  const inventory = buildInventory({
    sectionName: block.templateBlock?.name || "Section",
    cssFramework: page.site.cssFramework || "custom",
    layoutHtml,
    fields: parsed.fields,
    groups,
    repeatItems: block.repeatItems || [],
  });

  const sourceUrl =
    page.site.sourceUrl.trim() ||
    page.site.settings.find((s) => s.key === "importedFromUrl")?.value ||
    "";

  let original: Inventory["original"] = sourceUrl
    ? { found: false, headings: [], buttons: [], interactive: [], imageCount: 0 }
    : null;
  if (sourceUrl) {
    try {
      const sourceHtml = await fetchSourceHtml(sourceUrl);
      const band = extractSourceBand(
        sourceHtml,
        layoutHtml,
        block.templateBlock?.name || "",
      );
      if (band) {
        original = { found: true, ...originalSignals(band) };
      } else {
        original = {
          found: false,
          headings: [],
          buttons: [],
          interactive: [],
          imageCount: 0,
          error: "Could not match this section on the original page.",
        };
      }
    } catch (e) {
      original = {
        found: false,
        headings: [],
        buttons: [],
        interactive: [],
        imageCount: 0,
        error: e instanceof Error ? e.message : "Could not fetch the original page.",
      };
    }
  }

  const payload: Inventory = { ...inventory, original };

  const raw = await cheapChat(
    SYSTEM,
    `Review this CMS section. Suggest prompts only.\n\n${JSON.stringify(payload)}`,
  );

  const parsedJson = extractJsonObject(raw) as {
    gaps?: unknown;
    prompts?: unknown;
    notice?: unknown;
  };

  const gaps: SuggestGap[] = Array.isArray(parsedJson.gaps)
    ? parsedJson.gaps
        .map((g) => {
          if (!g || typeof g !== "object") return null;
          const row = g as { title?: unknown; detail?: unknown };
          const title = String(row.title || "").trim();
          const detail = String(row.detail || "").trim();
          if (!title && !detail) return null;
          return {
            title: title.slice(0, 80) || "Gap",
            detail: detail.slice(0, 240),
          };
        })
        .filter((g): g is SuggestGap => Boolean(g))
        .slice(0, 3)
    : [];

  const prompts = Array.isArray(parsedJson.prompts)
    ? parsedJson.prompts
        .map((p) => String(p || "").trim())
        .filter((p) => p.length >= 8)
        .slice(0, 3)
    : [];

  const notice = String(
    parsedJson.notice ||
      (prompts.length
        ? "Pick a suggestion, edit it if you want, then Ask Grok."
        : original?.found
          ? "Looks close to the original. You can still ask Grok to restyle or rewrite copy."
          : "Fields look complete. You can still ask Grok to restyle or rewrite copy."),
  ).slice(0, 240);

  return {
    gaps,
    prompts,
    notice,
    hasOriginal: Boolean(original?.found),
  };
}
