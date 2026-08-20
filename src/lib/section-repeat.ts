/**
 * Detect similar sibling blocks inside a section, extract them as
 * repeatable items, and expand {{repeat:key}} when rendering.
 */

import {
  META,
  emptyFieldsFromTemplate,
  parseRepeatableBlocks,
  parseSectionFields,
  parseStoredContent,
  repeatGroupsFromHtml,
  serializeContent,
  slotNamesFromFields,
  stampSlotsOnHtml,
  type RepeatGroupDef,
  type SectionField,
} from "@/lib/sections";
import { classSimilarity } from "@/lib/style-preset-match";

const VOID = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const SKIP_TAGS = new Set(["script", "style", "noscript", "br", "hr"]);

type Frag = {
  type: "el" | "text";
  tag?: string;
  attrs?: string;
  className?: string;
  children: Frag[];
  start: number;
  end: number;
};

function parseFrags(
  html: string,
  from = 0,
  until = html.length,
): { nodes: Frag[]; end: number } {
  const nodes: Frag[] = [];
  let i = from;
  while (i < until) {
    if (html[i] !== "<") {
      const next = html.indexOf("<", i);
      const end = next < 0 || next > until ? until : next;
      if (end > i) nodes.push({ type: "text", children: [], start: i, end });
      i = end;
      continue;
    }
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i);
      i = end < 0 ? until : end + 3;
      continue;
    }
    const close = html.indexOf(">", i);
    if (close < 0 || close > until) break;
    const raw = html.slice(i + 1, close);
    if (raw.startsWith("/")) return { nodes, end: i };
    if (raw.startsWith("!") || raw.startsWith("?")) {
      i = close + 1;
      continue;
    }
    const tagMatch = raw.match(/^([a-zA-Z][\w:-]*)/);
    if (!tagMatch) {
      i = close + 1;
      continue;
    }
    const tag = tagMatch[1].toLowerCase();
    const attrs = raw.slice(tagMatch[1].length).replace(/\/\s*$/, "").trim();
    const className =
      attrs.match(/class\s*=\s*["']([^"']*)["']/i)?.[1] || "";
    const start = i;
    const selfClosing = raw.endsWith("/") || VOID.has(tag);
    if (selfClosing) {
      nodes.push({
        type: "el",
        tag,
        attrs,
        className,
        children: [],
        start,
        end: close + 1,
      });
      i = close + 1;
      continue;
    }
    const inner = parseFrags(html, close + 1, until);
    let j = inner.end;
    const closer = `</${tag}`;
    if (html.slice(j, j + closer.length).toLowerCase() === closer) {
      const gt = html.indexOf(">", j);
      j = gt < 0 ? until : gt + 1;
    }
    nodes.push({
      type: "el",
      tag,
      attrs,
      className,
      children: inner.nodes,
      start,
      end: j,
    });
    i = j;
  }
  return { nodes, end: i };
}

function childTagSig(el: Frag): string {
  return el.children
    .filter((c) => c.type === "el" && c.tag)
    .map((c) => c.tag)
    .join(",");
}

function similarItems(a: Frag, b: Frag): boolean {
  if (a.type !== "el" || b.type !== "el") return false;
  if (!a.tag || a.tag !== b.tag) return false;
  if (SKIP_TAGS.has(a.tag)) return false;
  const sigA = childTagSig(a);
  const sigB = childTagSig(b);
  const classScore = classSimilarity(a.className || "", b.className || "");
  const sameSig = Boolean(sigA && sigA === sigB);
  // Same inner outline + overlapping classes → a card/logo/slide list.
  if (sameSig && classScore >= 0.28) return true;
  // High class overlap only counts when the insides match (or both are empty).
  // Two wp-block-column / col-* siblings often share classes but are layout
  // (text | image), not a repeatable list.
  if (classScore >= 0.5 && (!sigA || !sigB || sameSig)) return true;
  if (!a.className && !b.className && sameSig) return true;
  return false;
}

function isLayoutColumnClass(cls: string): boolean {
  return (
    /\bwp-block-column\b/.test(cls) ||
    /(^|\s)col-(?:[a-z]{2}-)?\d/.test(cls)
  );
}

function isLayoutRowClass(cls: string): boolean {
  return /\bwp-block-columns\b/.test(cls) || /(^|\s)row(\s|$)/.test(cls);
}

function fragHasTag(el: Frag, tag: string): boolean {
  if (el.tag === tag) return true;
  return el.children.some((c) => c.type === "el" && fragHasTag(c, tag));
}

function elementKids(nodes: Frag[]): Frag[] {
  return nodes.filter(
    (n) => n.type === "el" && n.tag && !SKIP_TAGS.has(n.tag),
  );
}

export type DetectedRepeatItem = {
  groupKey: string;
  origin: "scraped";
  fields: Record<string, string>;
  labels?: Record<string, string>;
};

export type DetectedRepeats = {
  html: string;
  groups: RepeatGroupDef[];
  items: DetectedRepeatItem[];
};

function isPlainTextItem(el: Frag): boolean {
  const tag = (el.tag || "").toLowerCase();
  const cls = (el.className || "").toLowerCase();
  if (tag === "p" || /^h[1-6]$/.test(tag)) return true;
  if (/\bwp-block-paragraph\b|\bwp-block-heading\b/.test(cls)) return true;
  return false;
}

function longestSimilarRun(kids: Frag[]): Frag[] | null {
  let best: Frag[] = [];
  let i = 0;
  while (i < kids.length) {
    let j = i + 1;
    while (j < kids.length && similarItems(kids[i], kids[j])) j += 1;
    const run = kids.slice(i, j);
    if (run.length > best.length) best = run;
    i = j > i + 1 ? j : i + 1;
  }
  if (best.length < 2) return null;
  if (best.every(isPlainTextItem)) return null;
  // Rows of columns are layout chrome, not a card list.
  if (best.every((el) => isLayoutRowClass(el.className || ""))) return null;
  // A pair of bootstrap / Gutenberg columns is a layout, not a list.
  if (best.length === 2) {
    const [a, b] = best;
    if (
      isLayoutColumnClass(a.className || "") ||
      isLayoutColumnClass(b.className || "")
    ) {
      return null;
    }
    if (fragHasTag(a, "img") !== fragHasTag(b, "img")) return null;
  }
  return best;
}

function walkFindRun(
  nodes: Frag[],
): { parentKids: Frag[]; run: Frag[] } | null {
  const kids = elementKids(nodes);
  const run = longestSimilarRun(kids);
  if (run) return { parentKids: kids, run };
  for (const n of kids) {
    if (isPlainTextItem(n)) continue;
    const inner = walkFindRun(n.children);
    if (inner) return inner;
  }
  return null;
}

function collectSimilarRuns(nodes: Frag[]): Frag[][] {
  const out: Frag[][] = [];
  const kids = elementKids(nodes);
  const run = longestSimilarRun(kids);
  if (run) out.push(run);
  for (const n of kids) out.push(...collectSimilarRuns(n.children));
  return out;
}

export function unwrapRepeatableTags(html: string): string {
  return html.replace(/<\/?repeatable\b[^>]*>/gi, "");
}

function stripText(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&apos;|&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function fieldSignature(fields: Record<string, string>): string {
  return Object.entries(fields)
    .filter(([k, v]) => v && !k.endsWith(META.alt) && !/^https?:|^\//.test(v))
    .map(([k, v]) => `${k}=${stripText(v).toLowerCase()}`)
    .sort()
    .join("|");
}

export function repeatSeedsAreClones(
  items: { fields: Record<string, string> }[],
): boolean {
  if (items.length < 2) return false;
  const sigs = items.map((it) => fieldSignature(it.fields));
  return sigs.every((s) => s && s === sigs[0]);
}

export function storedRepeatRowsAreClones(
  items: { content: string }[],
): boolean {
  return repeatSeedsAreClones(
    items.map((it) => ({ fields: parseStoredContent(it.content).fields })),
  );
}

/** True when row 1's title is not this wrap's title (harvest grabbed another section). */
export function repeatRowsMismatchCatalog(
  items: { content: string }[],
  catalogHtml: string,
): boolean {
  if (!items.length || !catalogHtml) return false;
  const wrap = parseRepeatableBlocks(catalogHtml)[0];
  const itemHtml = wrap?.itemHtml || catalogHtml;
  const titleField =
    parseSectionFields(itemHtml).find(
      (f) => f.key === "title" || f.slot === "title" || f.type === "singleline",
    ) || null;
  const want = stripText(titleField?.defaultValue || "");
  if (want.length < 4) return false;
  const got = stripText(
    parseStoredContent(items[0].content).fields[titleField?.key || "title"] ||
      "",
  );
  if (!got) return true;
  const a = want.toLowerCase();
  const b = got.toLowerCase();
  return !b.includes(a.slice(0, 10)) && !a.includes(b.slice(0, 10));
}

function harvestFieldsFromPlainCard(
  cardHtml: string,
  templateFields: SectionField[],
): Record<string, string> {
  const headings = [
    ...cardHtml.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi),
  ].map((m) => stripText(m[1]));
  const paras = [...cardHtml.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) =>
    m[1].trim(),
  );
  const paraInfos = paras
    .map((raw) => ({ raw, text: stripText(raw) }))
    .filter((p) => p.text);
  const namePool = [
    ...headings,
    ...paraInfos.filter((p) => p.text.length <= 40).map((p) => p.text),
  ];
  const usedNames = new Set<string>();
  const imgs = [...cardHtml.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const out: Record<string, string> = {};
  const singles = templateFields.filter((f) => f.type === "singleline");
  const multis = templateFields.filter((f) => f.type === "multiline");
  const images = templateFields.filter((f) => f.type === "image");
  singles.forEach((f, i) => {
    const name = namePool[i] || "";
    out[f.key] = name;
    if (name) usedNames.add(name.toLowerCase());
  });
  const bodies = paraInfos.filter((p) => !usedNames.has(p.text.toLowerCase()));
  multis.forEach((f, i) => {
    const raw = bodies[i]?.raw || "";
    out[f.key] = raw
      ? /<[a-z]/i.test(raw)
        ? raw
        : `<p>${raw}</p>`
      : "";
  });
  images.forEach((f, i) => {
    const tag = imgs[i] || "";
    const alt = tag.match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1] || "";
    out[f.key] = "";
    if (alt) out[f.key + META.alt] = alt;
  });
  for (const f of templateFields) {
    if (out[f.key] === undefined) out[f.key] = "";
  }
  return out;
}

function dedupeRun(html: string, run: Frag[]): Frag[] {
  const seen = new Set<string>();
  const out: Frag[] = [];
  for (const el of run) {
    const sig = stripText(html.slice(el.start, el.end)).toLowerCase();
    if (!sig || seen.has(sig)) continue;
    seen.add(sig);
    out.push(el);
  }
  return out.length ? out : run;
}

/** Pull unique dummy copy from the original page when Grok cloned the first card. */
export function harvestRepeatSeedsFromSource(
  sourceHtml: string,
  catalogHtml: string,
  countHint = 0,
): DetectedRepeatItem[] | null {
  if (!sourceHtml?.trim() || !catalogHtml?.trim()) return null;
  const wrap =
    parseRepeatableBlocks(catalogHtml)[0] ||
    parseRepeatableBlocks(
      extractRepeatGroups(unwrapRepeatableTags(catalogHtml))?.html || "",
    )[0];
  const itemHtml = wrap?.itemHtml || "";
  const templateFields = parseSectionFields(itemHtml);
  if (!templateFields.length) return null;

  const titleField =
    templateFields.find((f) => f.key === "title" || f.slot === "title") ||
    templateFields.find((f) => f.type === "singleline");
  const wrapTitle = stripText(titleField?.defaultValue || "").toLowerCase();
  const hint = wrapTitle || stripText(itemHtml).slice(0, 48).toLowerCase();
  const { nodes } = parseFrags(sourceHtml);
  const runs = collectSimilarRuns(nodes);
  let best: { score: number; run: Frag[] } | null = null;
  for (const run of runs) {
    const unique = dedupeRun(sourceHtml, run);
    const texts = unique.map((el) =>
      stripText(sourceHtml.slice(el.start, el.end)).toLowerCase(),
    );
    // Never attach another section's cards (e.g. reviews onto Features).
    if (wrapTitle.length >= 4 && !texts.some((t) => t.includes(wrapTitle))) {
      continue;
    }
    const uniqueCount = new Set(texts).size;
    let score = uniqueCount * 6;
    if (uniqueCount <= 1) score -= 12;
    if (hint && texts.some((t) => t.includes(hint.slice(0, 18)))) score += 8;
    if (texts.some((t) => headingsOverlap(t, hint))) score += 3;
    if (countHint && unique.length === countHint) score += 2;
    if (!best || score > best.score) best = { score, run: unique };
  }
  if (!best || best.score < 5 || best.run.length < 2) return null;

  const key = wrap?.name || "items";
  return best.run.map((el) => ({
    groupKey: key,
    origin: "scraped" as const,
    fields: harvestFieldsFromPlainCard(
      sourceHtml.slice(el.start, el.end),
      templateFields,
    ),
  }));
}

function headingsOverlap(cardText: string, hint: string): boolean {
  if (!hint) return false;
  const words = hint.split(" ").filter((w) => w.length > 3);
  return words.filter((w) => cardText.includes(w)).length >= 2;
}

/** Stable id for a section wrap + its JSON rows (more_features). */
export function sectionSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 48) || "items"
  );
}

export function isGenericGroupKey(key: string): boolean {
  return /^(items|cards|columns|articles)(_\d+)?$/i.test(key || "");
}

/** Rename generic <repeatable name="items"> to this section's slug. */
export function remintRepeatableNames(html: string, sectionName: string): string {
  const key = sectionSlug(sectionName);
  if (!html?.trim() || !key) return html;
  let out = html;
  for (const b of parseRepeatableBlocks(html)) {
    if (b.name === key) continue;
    if (!isGenericGroupKey(b.name)) continue;
    out = out.replace(
      b.raw,
      `<repeatable name="${key}" items="${b.items}">${b.itemHtml}</repeatable>`,
    );
  }
  return out;
}

function groupKeyFromRun(run: Frag[], used: Set<string>): string {
  const cls = (run[0].className || "").toLowerCase();
  let base = "items";
  if (/\bcol[-s]|\bgrid-|\bcard\b/.test(cls)) base = "cards";
  else if (/\brow\b/.test(cls)) base = "columns";
  else if (run[0].tag === "li") base = "items";
  else if (run[0].tag === "article") base = "articles";
  let key = base;
  let n = 2;
  while (used.has(key)) {
    key = `${base}_${n}`;
    n += 1;
  }
  used.add(key);
  return key;
}

const META_SUFFIXES = [
  META.alt,
  META.link,
  META.linkTarget,
  META.linkTitle,
  META.fileLabel,
  META.poster,
] as const;

/** Map this card's markers onto wrap slot keys (slot= first, then position). */
function zipItemFields(
  itemHtml: string,
  templateFields: SectionField[],
  sectionFields: Record<string, string> = {},
): { fields: Record<string, string>; labels: Record<string, string> } {
  const inItem = parseSectionFields(itemHtml);
  const fields: Record<string, string> = {};
  const labels: Record<string, string> = {};
  templateFields.forEach((tf, i) => {
    const src = inItem.find((f) => f.key === tf.key) || inItem[i];
    if (!src) {
      fields[tf.key] = tf.defaultValue ?? "";
      if (tf.type === "image" && tf.alt) fields[tf.key + META.alt] = tf.alt;
      return;
    }
    const stored = sectionFields[src.key] ?? sectionFields[tf.key];
    fields[tf.key] = stored ?? src.defaultValue ?? "";
    if (src.label) labels[tf.key] = src.label;
    for (const suf of META_SUFFIXES) {
      const v = sectionFields[src.key + suf] ?? sectionFields[tf.key + suf];
      if (v) fields[tf.key + suf] = v;
    }
    if (tf.type === "image" && !fields[tf.key + META.alt] && src.alt) {
      fields[tf.key + META.alt] = src.alt;
    }
  });
  return { fields, labels };
}

/** Detect one similar-sibling group and extract scraped items. Idempotent if already slotted. */
export function extractRepeatGroups(
  html: string,
  sectionFields: Record<string, string> = {},
  sectionName?: string,
): DetectedRepeats | null {
  if (!html?.trim()) return null;
  if (/<repeatable\b/i.test(html)) return null;
  if (/\{\{repeat:[a-z0-9_-]+\}\}/i.test(html)) return null;

  const { nodes } = parseFrags(html);
  const found = walkFindRun(nodes);
  if (!found) return null;

  const { run } = found;
  const rawFirst = html.slice(run[0].start, run[0].end);
  const slots = slotNamesFromFields(parseSectionFields(rawFirst));
  const firstHtml = stampSlotsOnHtml(rawFirst, slots);
  const templateFields = parseSectionFields(firstHtml);
  if (templateFields.length < 1) return null;

  const used = new Set<string>();
  const key = sectionName?.trim()
    ? sectionSlug(sectionName)
    : groupKeyFromRun(run, used);
  const chunk = html.slice(run[0].start, run[run.length - 1].end);
  const wrap = `<repeatable name="${key}" items="${run.length}">${firstHtml}</repeatable>`;
  const nextHtml = html.replace(chunk, wrap);

  const items: DetectedRepeatItem[] = run.map((el) => {
    const itemHtml = stampSlotsOnHtml(html.slice(el.start, el.end), slots);
    const zipped = zipItemFields(itemHtml, templateFields, sectionFields);
    return {
      groupKey: key,
      origin: "scraped" as const,
      fields: zipped.fields,
      labels: zipped.labels,
    };
  });

  return {
    html: nextHtml,
    groups: [
      {
        key,
        itemHtml: firstHtml,
        defaultItems: run.length,
        label: sectionName?.trim() || humanizeGroupKey(key),
      },
    ],
    items,
  };
}

function rowsFromWrap(html: string): DetectedRepeatItem[] {
  return defaultRepeatRowsFromHtml(html).map((row) => ({
    groupKey: row.groupKey,
    origin: "scraped" as const,
    fields: row.fields,
  }));
}

/** Collapse siblings. If a wrap is already present, unwrap and extract first. */
function humanizeGroupKey(key: string): string {
  if (key === "cards") return "Cards";
  if (key === "columns") return "Columns";
  if (key === "articles") return "Articles";
  if (isGenericGroupKey(key)) return "Items";
  return key
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function prepareRepeatableSection(
  html: string,
  sectionFields: Record<string, string> = {},
  sectionName?: string,
): {
  html: string;
  groups: RepeatGroupDef[];
  items: DetectedRepeatItem[];
} {
  if (!html?.trim()) return { html: html || "", groups: [], items: [] };
  const stripped = unwrapRepeatableTags(html);
  const extracted = extractRepeatGroups(stripped, sectionFields, sectionName);
  if (extracted) {
    return {
      html: extracted.html,
      groups: extracted.groups,
      items: extracted.items,
    };
  }
  if (/<repeatable\b/i.test(html)) {
    let next = sectionName ? remintRepeatableNames(html, sectionName) : html;
    for (const b of parseRepeatableBlocks(next)) {
      const slots = slotNamesFromFields(parseSectionFields(b.itemHtml));
      const stamped = stampSlotsOnHtml(b.itemHtml, slots);
      if (stamped !== b.itemHtml) {
        next = next.replace(
          b.raw,
          `<repeatable name="${b.name}" items="${b.items}">${stamped}</repeatable>`,
        );
      }
    }
    const items = rowsFromWrap(next).map((row) =>
      sectionName
        ? { ...row, groupKey: sectionSlug(sectionName) }
        : row,
    );
    return {
      html: next,
      groups: repeatGroupsFromHtml(next),
      items,
    };
  }
  return { html, groups: [], items: [] };
}

export function applyExtractToContent(
  contentJson: string,
  templateHtml: string,
  sourceHtml?: string,
  sectionName?: string,
): {
  content: string;
  items: DetectedRepeatItem[];
  detected: boolean;
} {
  const parsed = parseStoredContent(contentJson, templateHtml);
  const source = parsed.layoutHtml || templateHtml;
  const prepared = prepareRepeatableSection(
    source,
    parsed.fields,
    sectionName,
  );
  let items = prepared.items;
  if (sourceHtml && (items.length < 2 || repeatSeedsAreClones(items))) {
    const harvested = harvestRepeatSeedsFromSource(
      sourceHtml,
      prepared.html,
      items.length || parseRepeatableBlocks(prepared.html)[0]?.items || 0,
    );
    if (harvested?.length) items = harvested;
  }
  if (!items.length) {
    return { content: contentJson, items: [], detected: false };
  }

  const allFields = parseSectionFields(unwrapRepeatableTags(source));
  const fields = { ...parsed.fields };
  for (const f of allFields) {
    if (!prepared.html.includes(f.raw)) delete fields[f.key];
  }

  return {
    content: serializeContent({
      fields,
      layoutHtml: prepared.html,
      repeatGroups: prepared.groups.length
        ? prepared.groups
        : repeatGroupsFromHtml(prepared.html),
    }),
    items,
    detected: true,
  };
}

export function emptyItemContent(itemHtml: string): string {
  return serializeContent({ fields: emptyFieldsFromTemplate(itemHtml) });
}

export function defaultRepeatRowsFromHtml(html: string): {
  groupKey: string;
  fields: Record<string, string>;
}[] {
  const rows: { groupKey: string; fields: Record<string, string> }[] = [];
  for (const b of parseRepeatableBlocks(html)) {
    const n = Math.max(0, b.items);
    const fields = emptyFieldsFromTemplate(b.itemHtml);
    for (let i = 0; i < n; i++) {
      rows.push({ groupKey: b.name, fields: { ...fields } });
    }
  }
  return rows;
}
