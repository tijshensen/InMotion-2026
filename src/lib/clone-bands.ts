/**
 * Per-builder clone rules: band (what is a CMS section), glue (widgets
 * split across bands), markers (editable text/images). Shared fallback
 * is semantic <section> / h2 split.
 */

import {
  closeTag,
  collectByClassToken,
  collectMatches,
  innerHtml,
  openTag,
  splitIntoPageSections,
  stripTags,
  type HtmlChunk,
} from "./html-split";
import { prepareRepeatableSection } from "./section-repeat";

export type CloneBuilder =
  | "divi"
  | "elementor"
  | "wpbakery"
  | "gutenberg"
  | "webflow"
  | "wordpress"
  | "unknown";

export function cloneBuilderFromStack(builder: string): CloneBuilder {
  if (
    builder === "divi" ||
    builder === "elementor" ||
    builder === "wpbakery" ||
    builder === "gutenberg" ||
    builder === "webflow" ||
    builder === "wordpress"
  ) {
    return builder;
  }
  return "unknown";
}

function hasBandHeading(html: string) {
  return /<h[12]\b/i.test(html);
}

function isEmptyBand(html: string) {
  const text = stripTags(html);
  return text.length < 8 && !/<img\b/i.test(html);
}

function wrapInSectionChrome(sectionHtml: string, inner: string): string {
  const open = openTag(sectionHtml);
  const close = closeTag(sectionHtml);
  if (!open) return inner;
  return `${open}\n${inner}\n${close || "</div>"}`;
}

/** Consecutive rows: start a new group when a row has its own h1/h2. */
function groupRowsByHeading(rows: string[]): string[][] {
  const groups: string[][] = [];
  let current: string[] = [];
  for (const row of rows) {
    const startsBand = hasBandHeading(row) && current.some((r) => hasBandHeading(r));
    if (startsBand) {
      groups.push(current);
      current = [row];
    } else {
      current.push(row);
    }
  }
  if (current.length) groups.push(current);
  return groups;
}

function splitDiviSection(sectionHtml: string): string[] {
  if (isEmptyBand(sectionHtml)) return [sectionHtml];
  const rows = collectByClassToken(sectionHtml, "et_pb_row", { minLength: 24 }).map(
    (c) => c.html,
  );
  const headingRows = rows.filter((r) => hasBandHeading(r));
  if (rows.length < 2 || headingRows.length < 2) return [sectionHtml];
  return groupRowsByHeading(rows).map((group) =>
    wrapInSectionChrome(sectionHtml, group.join("\n")),
  );
}

function isDiviSliderPiece(html: string) {
  return (
    /\brow-slider\b/i.test(html) ||
    /\bet_pb_slider\b/i.test(html) ||
    /\bdata-slide\s*=/i.test(html) ||
    /\brow-slider-nav\b/i.test(html) ||
    /\brow-slider-tabs\b/i.test(html)
  );
}

function glueDivi(chunks: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < chunks.length) {
    if (isEmptyBand(chunks[i])) {
      if (out.length) out[out.length - 1] += chunks[i];
      i += 1;
      continue;
    }
    if (isDiviSliderPiece(chunks[i])) {
      let merged = chunks[i];
      i += 1;
      while (i < chunks.length && (isDiviSliderPiece(chunks[i]) || isEmptyBand(chunks[i]))) {
        merged += chunks[i];
        i += 1;
      }
      out.push(merged);
      continue;
    }
    out.push(chunks[i]);
    i += 1;
  }
  return out;
}

function splitDivi(content: string): string[] {
  const sections = collectByClassToken(content, "et_pb_section", {
    skip: (open) => /_tb_header|_tb_footer/i.test(open),
    minLength: 32,
  });
  if (sections.length < 1) return splitIntoPageSections(content);
  const bands: string[] = [];
  for (const s of sections) {
    bands.push(...splitDiviSection(s.html));
  }
  return glueDivi(bands);
}

function isElementorSliderPiece(html: string) {
  return (
    /\bswiper/i.test(html) ||
    /\belementor-widget-slides\b/i.test(html) ||
    /\belementor-swiper-button\b/i.test(html) ||
    /\bswiper-pagination\b/i.test(html)
  );
}

function glueSliderPieces(chunks: string[], isPiece: (html: string) => boolean): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < chunks.length) {
    if (isEmptyBand(chunks[i])) {
      if (out.length) out[out.length - 1] += chunks[i];
      i += 1;
      continue;
    }
    if (isPiece(chunks[i])) {
      let merged = chunks[i];
      i += 1;
      while (i < chunks.length && (isPiece(chunks[i]) || isEmptyBand(chunks[i]))) {
        merged += chunks[i];
        i += 1;
      }
      out.push(merged);
      continue;
    }
    out.push(chunks[i]);
    i += 1;
  }
  return out;
}

function splitElementor(content: string): string[] {
  const top = collectMatches(
    content,
    /<(div|section)\b[^>]*\bclass\s*=\s*["'][^"']*\b(elementor-top-section|e-con-full|e-parent)\b[^"']*["'][^>]*>/gi,
    {
      skip: (open) =>
        /elementor-inner-section|elementor-location-header|elementor-location-footer/i.test(
          open,
        ),
    },
  );
  if (top.length < 2) return splitIntoPageSections(content);
  return glueSliderPieces(
    top.map((c) => c.html),
    isElementorSliderPiece,
  );
}

function splitWpbakery(content: string): string[] {
  const rows = collectByClassToken(content, "vc_section", {
    skip: (open) => /vc_inner/i.test(open),
  });
  const bands =
    rows.length >= 2
      ? rows.map((c) => c.html)
      : collectByClassToken(content, "vc_row", {
          skip: (open) => /vc_inner|vc_row-has-fill inner/i.test(open),
        }).map((c) => c.html);
  if (bands.length < 2) return splitIntoPageSections(content);
  return glueSliderPieces(bands, (html) =>
    /\bwpb_gallery\b|\brev_slider\b|\bvc_images_carousel\b/i.test(html),
  );
}

function splitGutenberg(content: string): string[] {
  const covers = collectByClassToken(content, "wp-block-cover");
  const groups = collectByClassToken(content, "wp-block-group");
  const bands = [...covers, ...groups]
    .sort((a, b) => a.start - b.start)
    .filter((c, i, all) => !all.some((p, j) => j !== i && c.start > p.start && c.start < p.start + p.html.length));
  if (bands.length < 2) return splitIntoPageSections(content);
  return bands.map((c) => c.html);
}

export function splitCloneBands(content: string, builder: string): string[] {
  const kind = cloneBuilderFromStack(builder);
  const trimmed = content.trim();
  if (!trimmed) return ["<p></p>"];
  if (kind === "divi") return splitDivi(trimmed);
  if (kind === "elementor") return splitElementor(trimmed);
  if (kind === "wpbakery") return splitWpbakery(trimmed);
  if (kind === "gutenberg") return splitGutenberg(trimmed);
  return splitIntoPageSections(trimmed);
}

function wrapInnerAsMultiline(block: string, name: string): string {
  if (/<multiline\b/i.test(block) || /<singleline\b/i.test(block)) return block;
  const inner = innerHtml(block).trim();
  if (stripTags(inner).length < 2 && !/<img\b/i.test(inner)) return block;
  const open = openTag(block);
  const close = closeTag(block);
  if (!open) return block;
  return `${open}<multiline name="${name}">${inner}</multiline>${close || ""}`;
}

function isInsideMarker(html: string, index: number): boolean {
  const before = html.slice(0, index);
  const openMl = before.lastIndexOf("<multiline");
  const closeMl = before.lastIndexOf("</multiline>");
  const openSl = before.lastIndexOf("<singleline");
  const closeSl = before.lastIndexOf("</singleline>");
  return openMl > closeMl || openSl > closeSl;
}

function wrapHits(
  html: string,
  hits: { start: number; html: string }[],
  label: string,
  start: number,
): { html: string; next: number } {
  const usable = hits.filter((hit) => !isInsideMarker(html, hit.start));
  let out = html;
  for (let i = usable.length - 1; i >= 0; i--) {
    const hit = usable[i];
    const wrapped = wrapInnerAsMultiline(hit.html, `${label} ${start + i + 1}`);
    out = out.slice(0, hit.start) + wrapped + out.slice(hit.start + hit.html.length);
  }
  return { html: out, next: start + usable.length };
}

function wrapClassInners(
  html: string,
  className: string,
  label: string,
  start: number,
): { html: string; next: number } {
  return wrapHits(html, collectByClassToken(html, className, { minLength: 16 }), label, start);
}

function wrapGenericHeadings(html: string): string {
  let n = 0;
  return html.replace(
    /<(h[1-4])\b([^>]*)>([\s\S]*?)<\/\1>/gi,
    (full, tag: string, attrs: string, inner: string) => {
      if (/<multiline\b/i.test(inner) || /<singleline\b/i.test(inner)) return full;
      const text = inner.replace(/<[^>]+>/g, "").trim();
      if (text.length < 2) return full;
      n += 1;
      return `<${tag}${attrs}><multiline name="Heading ${n}">${inner}</multiline></${tag}>`;
    },
  );
}

function wrapImages(html: string): string {
  let imgN = 0;
  return html.replace(/<img\b([^>]*?)\/?>/gi, (full, attrs: string, offset: number) => {
    if (/\beditable\s*=/i.test(attrs)) return full;
    if (isInsideMarker(html, offset)) return full;
    imgN += 1;
    const trimmed = String(attrs || "").replace(/\/\s*$/, "");
    return `<img editable="true" name="Image ${imgN}"${trimmed} />`;
  });
}

/** Consecutive paragraphs/headings become one multiline; figures/images stay outside. */
function wrapAdjacentTextBlocks(html: string): string {
  const re = /<(p|h[1-6])\b[^>]*>[\s\S]*?<\/\1>/gi;
  const hits: { start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (isInsideMarker(html, m.index)) continue;
    if (!stripTags(m[0]) && !/<img\b/i.test(m[0])) continue;
    hits.push({ start: m.index, end: m.index + m[0].length });
  }
  if (!hits.length) return html;
  const groups: { start: number; end: number }[][] = [];
  let cur: { start: number; end: number }[] = [hits[0]];
  for (let i = 1; i < hits.length; i++) {
    const between = html.slice(cur[cur.length - 1].end, hits[i].start);
    if (!between.trim()) cur.push(hits[i]);
    else {
      groups.push(cur);
      cur = [hits[i]];
    }
  }
  groups.push(cur);
  let out = html;
  for (let g = groups.length - 1; g >= 0; g--) {
    const group = groups[g];
    const start = group[0].start;
    const end = group[group.length - 1].end;
    const chunk = out.slice(start, end);
    if (/<multiline\b/i.test(chunk)) continue;
    out =
      out.slice(0, start) +
      `<multiline name="Text ${g + 1}">${chunk}</multiline>` +
      out.slice(end);
  }
  return out;
}

function stripEmptyHeadings(html: string) {
  return html.replace(/<h[1-6]\b[^>]*>\s*<\/h[1-6]>/gi, "");
}

function isDiviTabWidget(html: string) {
  return (
    /\bdgat_advancedtab\b/i.test(html) ||
    /\bet_pb_tabs\b/i.test(html) ||
    /\bet_pb_accordion\b/i.test(html)
  );
}

function wrapTabWidgetFields(html: string, start: number): { html: string; next: number } {
  let s = html;
  let n = start;
  const navs = collectByClassToken(s, "dg_at_nav", { minLength: 8 }).filter(
    (h) => /\bdg_at_nav\b/i.test(h.html.slice(0, 180)),
  );
  ({ html: s, next: n } = wrapHits(s, navs, "Tab label", n));
  const panes = collectByClassToken(s, "dg_at_content_wrapper", { minLength: 40 });
  ({ html: s, next: n } = wrapHits(s, panes, "Tab body", n));
  const diviTabs = collectByClassToken(s, "et_pb_tab", { minLength: 24 });
  ({ html: s, next: n } = wrapHits(s, diviTabs, "Tab body", n));
  const toggles = collectByClassToken(s, "et_pb_toggle_content", { minLength: 24 });
  ({ html: s, next: n } = wrapHits(s, toggles, "Accordion body", n));
  return { html: s, next: n };
}

function wrapDiviLeaves(html: string): string {
  let s = stripEmptyHeadings(html);
  let n = 0;
  ({ html: s, next: n } = wrapTabWidgetFields(s, n));
  const leaves = [
    "gw-card-title",
    "gw-card-body",
    "et_pb_module_header",
    "et_pb_blurb_description",
    "entry-title",
  ];
  for (const cls of leaves) {
    ({ html: s, next: n } = wrapClassInners(s, cls, "Text", n));
  }
  ({ html: s, next: n } = wrapClassInners(s, "et_pb_text_inner", "Text", n));
  const cards = collectMatches(
    s,
    /<article\b[^>]*\bclass\s*=\s*["'][^"']*\bcard\b[^"']*["'][^>]*>/gi,
    { minLength: 24 },
  );
  ({ html: s, next: n } = wrapHits(s, cards, "Text", n));
  ({ html: s, next: n } = wrapClassInners(s, "et_pb_button", "Button", n));
  return s;
}

function adjacentGroups(html: string, hits: HtmlChunk[]): HtmlChunk[][] {
  if (!hits.length) return [];
  const groups: HtmlChunk[][] = [];
  let cur: HtmlChunk[] = [hits[0]];
  for (let i = 1; i < hits.length; i++) {
    const prev = hits[i - 1];
    const between = html.slice(prev.start + prev.html.length, hits[i].start);
    if (!stripTags(between)) cur.push(hits[i]);
    else {
      groups.push(cur);
      cur = [hits[i]];
    }
  }
  groups.push(cur);
  return groups;
}

export function collapseCloneRepeats(
  html: string,
  sectionName: string,
): {
  html: string;
  repeatSeeds: {
    groupKey: string;
    fields: Record<string, string>;
    labels?: Record<string, string>;
  }[];
} {
  if (isDiviSliderPiece(html) || isDiviTabWidget(html)) return { html, repeatSeeds: [] };
  const classes = ["gw-card", "et_pb_post"];
  for (const cls of classes) {
    const hits = collectByClassToken(html, cls, { minLength: 24 });
    const best = adjacentGroups(html, hits)
      .filter((g) => g.length >= 2)
      .sort((a, b) => b.length - a.length)[0];
    if (!best) continue;
    const start = best[0].start;
    const end = best[best.length - 1].start + best[best.length - 1].html.length;
    const slice = html.slice(start, end);
    const prepared = prepareRepeatableSection(slice, {}, sectionName);
    if (prepared.items.length < 2) continue;
    return {
      html: html.slice(0, start) + prepared.html + html.slice(end),
      repeatSeeds: prepared.items.map((it) => ({
        groupKey: it.groupKey,
        fields: it.fields,
        labels: it.labels,
      })),
    };
  }
  return { html, repeatSeeds: [] };
}

/** Editable markers: module text as multiline (keeps inner HTML), images editable. */
export function wrapCloneMarkers(html: string, builder: string): string {
  const kind = cloneBuilderFromStack(builder);
  let s = html;
  let textN = 0;
  if (kind === "divi") {
    s = wrapDiviLeaves(s);
  } else if (kind === "elementor") {
    const widgets = collectMatches(
      s,
      /<(div|section)\b[^>]*\bclass\s*=\s*["'][^"']*\belementor-widget-(?:text-editor|heading|text)\b[^"']*["'][^>]*>/gi,
      { minLength: 16 },
    );
    ({ html: s, next: textN } = wrapHits(s, widgets, "Text", textN));
  } else if (kind === "wpbakery") {
    ({ html: s, next: textN } = wrapClassInners(s, "wpb_text_column", "Text", textN));
  } else if (kind === "gutenberg") {
    s = wrapAdjacentTextBlocks(s);
  } else {
    s = wrapGenericHeadings(s);
  }
  return wrapImages(s);
}

export function cloneSectionName(html: string, index: number): string {
  if (isDiviSliderPiece(html) || isElementorSliderPiece(html)) {
    const heading = firstHeading(html);
    return heading || "Slider";
  }
  if (isEmptyBand(html)) return "Spacer";
  return firstHeading(html) || (index === 0 ? "Hero" : `Section ${index + 1}`);
}

function firstHeading(html: string): string {
  const m = html.match(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/i);
  return (m?.[1] || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}
