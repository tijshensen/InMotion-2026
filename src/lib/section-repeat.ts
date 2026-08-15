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
  if (sigA && sigA === sigB && classScore >= 0.28) return true;
  if (classScore >= 0.5) return true;
  if (!a.className && !b.className && sigA && sigA === sigB) return true;
  return false;
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
};

export type DetectedRepeats = {
  html: string;
  groups: RepeatGroupDef[];
  items: DetectedRepeatItem[];
};

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
  return best.length >= 2 ? best : null;
}

function walkFindRun(
  nodes: Frag[],
): { parentKids: Frag[]; run: Frag[] } | null {
  const kids = elementKids(nodes);
  const run = longestSimilarRun(kids);
  if (run) return { parentKids: kids, run };
  for (const n of kids) {
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
  const imgs = [...cardHtml.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const out: Record<string, string> = {};
  const singles = templateFields.filter((f) => f.type === "singleline");
  const multis = templateFields.filter((f) => f.type === "multiline");
  const images = templateFields.filter((f) => f.type === "image");
  singles.forEach((f, i) => {
    out[f.key] = headings[i] || f.defaultValue || "";
  });
  multis.forEach((f, i) => {
    const raw = paras[i] || "";
    out[f.key] = raw
      ? /<[a-z]/i.test(raw)
        ? raw
        : `<p>${raw}</p>`
      : f.defaultValue || "";
  });
  images.forEach((f, i) => {
    const tag = imgs[i] || "";
    const alt = tag.match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1] || f.alt || "";
    out[f.key] = "";
    if (alt) out[f.key + META.alt] = alt;
  });
  for (const f of templateFields) {
    if (out[f.key] === undefined) out[f.key] = f.defaultValue || "";
  }
  return out;
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

  const hint = stripText(itemHtml).slice(0, 48).toLowerCase();
  const { nodes } = parseFrags(sourceHtml);
  const runs = collectSimilarRuns(nodes);
  let best: { score: number; run: Frag[] } | null = null;
  for (const run of runs) {
    const cards = run.map((el) => sourceHtml.slice(el.start, el.end));
    const texts = cards.map((c) => stripText(c).toLowerCase());
    let score = 0;
    if (countHint && run.length === countHint) score += 4;
    if (hint && texts.some((t) => t.includes(hint.slice(0, 24)))) score += 8;
    if (texts.some((t) => headingsOverlap(t, hint))) score += 3;
    if (run.length >= 2) score += 1;
    if (!best || score > best.score) best = { score, run };
  }
  if (!best || best.score < 5) return null;

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

/** Map this card's own markers onto the wrap field keys (by position). */
function zipItemFields(
  itemHtml: string,
  templateFields: SectionField[],
  sectionFields: Record<string, string> = {},
): Record<string, string> {
  const inItem = parseSectionFields(itemHtml);
  const out: Record<string, string> = {};
  templateFields.forEach((tf, i) => {
    const src = inItem[i];
    if (!src) {
      out[tf.key] = tf.defaultValue ?? "";
      if (tf.type === "image" && tf.alt) out[tf.key + META.alt] = tf.alt;
      return;
    }
    const stored = sectionFields[src.key] ?? sectionFields[tf.key];
    out[tf.key] = stored ?? src.defaultValue ?? "";
    for (const suf of META_SUFFIXES) {
      const v = sectionFields[src.key + suf] ?? sectionFields[tf.key + suf];
      if (v) out[tf.key + suf] = v;
    }
    if (tf.type === "image" && !out[tf.key + META.alt] && src.alt) {
      out[tf.key + META.alt] = src.alt;
    }
  });
  return out;
}

/** Detect one similar-sibling group and extract scraped items. Idempotent if already slotted. */
export function extractRepeatGroups(
  html: string,
  sectionFields: Record<string, string> = {},
): DetectedRepeats | null {
  if (!html?.trim()) return null;
  if (/<repeatable\b/i.test(html)) return null;
  if (/\{\{repeat:[a-z0-9_-]+\}\}/i.test(html)) return null;

  const { nodes } = parseFrags(html);
  const found = walkFindRun(nodes);
  if (!found) return null;

  const { run } = found;
  const firstHtml = html.slice(run[0].start, run[0].end);
  const templateFields = parseSectionFields(firstHtml);
  if (templateFields.length < 1) return null;

  const used = new Set<string>();
  const key = groupKeyFromRun(run, used);
  const chunk = html.slice(run[0].start, run[run.length - 1].end);
  const wrap = `<repeatable name="${key}" items="${run.length}">${firstHtml}</repeatable>`;
  const nextHtml = html.replace(chunk, wrap);

  const items: DetectedRepeatItem[] = run.map((el) => {
    const itemHtml = html.slice(el.start, el.end);
    return {
      groupKey: key,
      origin: "scraped" as const,
      fields: zipItemFields(itemHtml, templateFields, sectionFields),
    };
  });

  return {
    html: nextHtml,
    groups: [
      {
        key,
        itemHtml: firstHtml,
        defaultItems: run.length,
        label: key === "cards" ? "Cards" : key === "columns" ? "Columns" : "Items",
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
export function prepareRepeatableSection(
  html: string,
  sectionFields: Record<string, string> = {},
): {
  html: string;
  groups: RepeatGroupDef[];
  items: DetectedRepeatItem[];
} {
  if (!html?.trim()) return { html: html || "", groups: [], items: [] };
  const stripped = unwrapRepeatableTags(html);
  const extracted = extractRepeatGroups(stripped, sectionFields);
  if (extracted) {
    return {
      html: extracted.html,
      groups: extracted.groups,
      items: extracted.items,
    };
  }
  if (/<repeatable\b/i.test(html)) {
    return {
      html,
      groups: repeatGroupsFromHtml(html),
      items: rowsFromWrap(html),
    };
  }
  return { html, groups: [], items: [] };
}

export function applyExtractToContent(
  contentJson: string,
  templateHtml: string,
  sourceHtml?: string,
): {
  content: string;
  items: DetectedRepeatItem[];
  detected: boolean;
} {
  const parsed = parseStoredContent(contentJson, templateHtml);
  const source = parsed.layoutHtml || templateHtml;
  const prepared = prepareRepeatableSection(source, parsed.fields);
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
