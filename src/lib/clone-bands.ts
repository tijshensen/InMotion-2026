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
} from "./html-split";

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

function wrapHits(
  html: string,
  hits: { start: number; html: string }[],
  label: string,
  start: number,
): { html: string; next: number } {
  let out = html;
  for (let i = hits.length - 1; i >= 0; i--) {
    const hit = hits[i];
    const wrapped = wrapInnerAsMultiline(hit.html, `${label} ${start + i + 1}`);
    out = out.slice(0, hit.start) + wrapped + out.slice(hit.start + hit.html.length);
  }
  return { html: out, next: start + hits.length };
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
  return html.replace(/<img\b([^>]*?)\/?>/gi, (full, attrs: string) => {
    if (/\beditable\s*=/i.test(attrs)) return full;
    imgN += 1;
    const trimmed = String(attrs || "").replace(/\/\s*$/, "");
    return `<img editable="true" name="Image ${imgN}"${trimmed} />`;
  });
}

/** Editable markers: module text as multiline (keeps inner HTML), images editable. */
export function wrapCloneMarkers(html: string, builder: string): string {
  const kind = cloneBuilderFromStack(builder);
  let s = html;
  let textN = 0;
  if (kind === "divi") {
    ({ html: s, next: textN } = wrapClassInners(s, "et_pb_text_inner", "Text", textN));
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
    ({ html: s, next: textN } = wrapClassInners(s, "wp-block-paragraph", "Text", textN));
    s = wrapGenericHeadings(s);
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
