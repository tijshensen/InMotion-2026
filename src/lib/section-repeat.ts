/**
 * Detect similar sibling blocks inside a section, extract them as
 * repeatable items, and expand {{repeat:key}} when rendering.
 */

import {
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

function zipItemFields(
  itemHtml: string,
  templateFields: SectionField[],
  allFields: SectionField[],
  sectionFields: Record<string, string>,
): Record<string, string> {
  const inItem = allFields.filter((f) => itemHtml.includes(f.raw));
  const out: Record<string, string> = {};
  templateFields.forEach((tf, i) => {
    const src = inItem[i];
    out[tf.key] = src
      ? (sectionFields[src.key] ?? src.defaultValue ?? "")
      : tf.defaultValue ?? "";
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

  const allFields = parseSectionFields(html);
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
      fields: zipItemFields(itemHtml, templateFields, allFields, sectionFields),
    };
  });

  const consumed = new Set<string>();
  for (const el of run) {
    const itemHtml = html.slice(el.start, el.end);
    for (const f of allFields) {
      if (itemHtml.includes(f.raw)) consumed.add(f.key);
    }
  }
  void consumed;

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

/** Collapse siblings, or keep an existing wrap. Never copies the full catalog over the wrap. */
export function prepareRepeatableSection(
  html: string,
  sectionFields: Record<string, string> = {},
): {
  html: string;
  groups: RepeatGroupDef[];
  items: DetectedRepeatItem[];
} {
  if (!html?.trim()) return { html: html || "", groups: [], items: [] };
  if (/<repeatable\b/i.test(html)) {
    return {
      html,
      groups: repeatGroupsFromHtml(html),
      items: rowsFromWrap(html),
    };
  }
  const extracted = extractRepeatGroups(html, sectionFields);
  if (!extracted) return { html, groups: [], items: [] };
  return {
    html: extracted.html,
    groups: extracted.groups,
    items: extracted.items,
  };
}

export function applyExtractToContent(
  contentJson: string,
  templateHtml: string,
): {
  content: string;
  items: DetectedRepeatItem[];
  detected: boolean;
} {
  const parsed = parseStoredContent(contentJson, templateHtml);
  const source = parsed.layoutHtml || templateHtml;
  if (/<repeatable\b/i.test(source)) {
    const items = rowsFromWrap(source);
    if (!items.length) {
      return { content: contentJson, items: [], detected: false };
    }
    return {
      content: serializeContent({
        fields: parsed.fields,
        layoutHtml: source,
        repeatGroups: repeatGroupsFromHtml(source),
      }),
      items,
      detected: true,
    };
  }
  const extracted = extractRepeatGroups(source, parsed.fields);
  if (!extracted) {
    return { content: contentJson, items: [], detected: false };
  }

  const allFields = parseSectionFields(source);
  const fields = { ...parsed.fields };
  for (const f of allFields) {
    if (!extracted.html.includes(f.raw)) delete fields[f.key];
  }

  return {
    content: serializeContent({
      fields,
      layoutHtml: extracted.html,
      repeatGroups: extracted.groups,
    }),
    items: extracted.items,
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
