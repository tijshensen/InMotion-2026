/**
 * Lightweight HTML helpers for clone-from-url.
 * WordPress builders (Divi, Elementor, WPBakery, …) almost never use <section>
 * for page bands — they use nested <div class="et_pb_section"> etc.
 */

const VOID_TAGS = new Set([
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

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Slice one element starting at `start` (index of its "<"), including nested same-tags. */
export function extractBalanced(html: string, start: number): string | null {
  if (start < 0 || start >= html.length || html[start] !== "<") return null;
  const open = html.slice(start).match(/^<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/);
  if (!open) return null;
  const tag = open[1];
  const lower = tag.toLowerCase();
  if (VOID_TAGS.has(lower) || /\/\s*>$/.test(open[0])) return open[0];

  let depth = 0;
  const re = new RegExp(`<(/?)${escapeRe(tag)}\\b[^>]*>`, "gi");
  re.lastIndex = start;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const isClose = m[1] === "/";
    const selfClosing = !isClose && /\/\s*>$/.test(m[0]);
    if (isClose) {
      depth -= 1;
      if (depth === 0) return html.slice(start, m.index + m[0].length);
    } else if (!selfClosing) {
      depth += 1;
    }
  }
  return html.slice(start);
}

export function findByTag(html: string, tag: string): string | null {
  const re = new RegExp(`<${escapeRe(tag)}\\b[^>]*>`, "i");
  const m = html.match(re);
  if (!m || m.index == null) return null;
  return extractBalanced(html, m.index);
}

export function findById(html: string, id: string): string | null {
  const re = new RegExp(
    `<([a-zA-Z][a-zA-Z0-9]*)\\b[^>]*\\bid\\s*=\\s*["']${escapeRe(id)}["'][^>]*>`,
    "i",
  );
  const m = html.match(re);
  if (!m || m.index == null) return null;
  return extractBalanced(html, m.index);
}

/** Match a whole class token, not a substring ("content" must not hit et_builder_inner_content). */
export function findByClass(html: string, className: string): string | null {
  const re = new RegExp(
    `<([a-zA-Z][a-zA-Z0-9]*)\\b[^>]*\\bclass\\s*=\\s*["'][^"']*\\b${escapeRe(className)}\\b[^"']*["'][^>]*>`,
    "i",
  );
  const m = html.match(re);
  if (!m || m.index == null) return null;
  return extractBalanced(html, m.index);
}

export function innerHtml(block: string): string {
  const open = block.match(/^<[a-zA-Z][a-zA-Z0-9]*\b[^>]*>/);
  if (!open) return block;
  const close = block.lastIndexOf("</");
  if (close < open[0].length) return block.slice(open[0].length);
  return block.slice(open[0].length, close);
}

export function stripTags(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function bodyInner(html: string) {
  const m = html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i);
  return m?.[1] || html;
}

const SKIP_SECTION =
  /_tb_header|_tb_footer|elementor-inner-section|elementor-location-header|elementor-location-footer/i;

/**
 * Page-band markers used by common site builders.
 * Matched as class tokens on div/section/article; nested hits are skipped.
 */
const BUILDER_SECTION_RE =
  /<(div|section|article)\b[^>]*\bclass\s*=\s*["'][^"']*\b(et_pb_section|elementor-top-section|e-con-full|vc_section|fl-row|wp-block-cover)\b[^"']*["'][^>]*>/gi;

export type HtmlChunk = { start: number; html: string };

export function collectMatches(
  html: string,
  re: RegExp,
  opts?: { skip?: (open: string) => boolean; minLength?: number },
): HtmlChunk[] {
  const minLength = opts?.minLength ?? 40;
  const skip = opts?.skip;
  const out: HtmlChunk[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (skip?.(m[0])) continue;
    const block = extractBalanced(html, m.index);
    if (!block || block.length < minLength) continue;
    if (out.some((p) => m!.index > p.start && m!.index < p.start + p.html.length)) {
      continue;
    }
    out.push({ start: m.index, html: block });
  }
  return out;
}

export function collectByClassToken(
  html: string,
  className: string,
  opts?: { skip?: (open: string) => boolean; minLength?: number },
): HtmlChunk[] {
  const re = new RegExp(
    `<([a-zA-Z][a-zA-Z0-9]*)\\b[^>]*\\bclass\\s*=\\s*["'][^"']*\\b${escapeRe(className)}\\b[^"']*["'][^>]*>`,
    "gi",
  );
  return collectMatches(html, re, opts);
}

export function openTag(block: string): string {
  const m = block.match(/^<[a-zA-Z][a-zA-Z0-9]*\b[^>]*>/);
  return m ? m[0] : "";
}

export function closeTag(block: string): string {
  const m = block.match(/<\/[a-zA-Z][a-zA-Z0-9]*>\s*$/);
  return m ? m[0] : "";
}

function chunksFromMatches(html: string, matches: HtmlChunk[]): string[] | null {
  if (matches.length < 2) return null;
  const chunks: string[] = [];
  const lead = html.slice(0, matches[0].start).trim();
  if (lead && stripTags(lead).length > 24) chunks.push(lead);
  for (const item of matches) chunks.push(item.html);
  const last = matches[matches.length - 1];
  const tail = html.slice(last.start + last.html.length).trim();
  if (tail && stripTags(tail).length > 24) chunks.push(tail);
  return chunks;
}

export function splitIntoPageSections(content: string): string[] {
  const trimmed = content.trim();
  if (!trimmed) return ["<p></p>"];

  const builder = collectMatches(trimmed, BUILDER_SECTION_RE, {
    skip: (open) => SKIP_SECTION.test(open),
  });
  const builderChunks = chunksFromMatches(trimmed, builder);
  if (builderChunks) return builderChunks;

  const semantic = collectMatches(trimmed, /<(section|article)\b[^>]*>/gi, {
    skip: (open) => /aria-label=["']benefits["']/i.test(open),
  });
  // Ignore tiny widget <section> tags (e.g. three "Benefits" labels).
  const large = semantic.filter((c) => c.html.length > 400 || stripTags(c.html).length > 40);
  const semanticChunks = chunksFromMatches(trimmed, large.length >= 2 ? large : semantic);
  if (semanticChunks && (large.length >= 2 || semantic.length >= 2)) {
    const avg = semantic.reduce((n, c) => n + c.html.length, 0) / semantic.length;
    if (large.length >= 2 || avg > 800) return semanticChunks;
  }

  const h2Count = (trimmed.match(/<h2\b/gi) || []).length;
  if (h2Count >= 2) {
    const parts = trimmed.split(/(?=<h2\b)/i);
    const lead = parts[0]?.trim() || "";
    const rest = parts.slice(1).map((p) => p.trim()).filter(Boolean);
    const chunks = lead && !/^<h2\b/i.test(lead) ? [lead, ...rest] : rest;
    if (chunks.length >= 2) return chunks;
  }

  return [trimmed];
}

export function splitPageShell(html: string): {
  header: string;
  footer: string;
  content: string;
  afterContent: string;
} {
  const body = bodyInner(html);
  const siteHeader =
    findByTag(body, "header") ||
    findById(body, "masthead") ||
    findByClass(body, "site-header") ||
    findByClass(body, "et-l--header") ||
    findByClass(body, "elementor-location-header") ||
    "";
  const mobileHeader =
    findById(body, "mobile-header") ||
    findByClass(body, "mobile-header-navigation") ||
    "";
  const header = [siteHeader, mobileHeader].filter(Boolean).join("\n");
  const footer =
    findByTag(body, "footer") ||
    findById(body, "colophon") ||
    findByClass(body, "site-footer") ||
    findByClass(body, "et-l--footer") ||
    findByClass(body, "elementor-location-footer") ||
    "";

  const article = findByTag(body, "article");
  const candidates = [
    article,
    findByClass(body, "entry-content"),
    findById(body, "et-main-area"),
    findById(body, "main-content"),
    findByTag(body, "main"),
    findById(body, "content"),
    findByClass(body, "site-content"),
  ].filter((x): x is string => Boolean(x));

  let content = "";
  for (const cand of candidates) {
    let inner = cand;
    if (header && inner.includes(header)) inner = inner.replace(header, "");
    if (footer && inner.includes(footer)) inner = inner.replace(footer, "");
    // Prefer the candidate that actually holds page bands / copy.
    const text = stripTags(inner);
    const hasBands =
      /et_pb_section|elementor-top-section|e-con-full|vc_section|<section\b/i.test(inner);
    if (text.length > 80 && (hasBands || text.length > 200 || article)) {
      content = inner.startsWith("<") ? innerHtml(inner) || inner : inner;
      content = unwrapRootClass(content, "inside-article");
      content = unwrapRootClass(content, "entry-content");
      break;
    }
  }

  if (!content) {
    content = body;
    if (siteHeader) content = content.replace(siteHeader, "");
    if (mobileHeader) content = content.replace(mobileHeader, "");
    if (footer) content = content.replace(footer, "");
  }

  const afterContent = sliceAfterMain(body, footer);
  const authorPanel = findById(body, "author-panel") || "";
  const footerOut = `${footer}${authorPanel ? `\n${authorPanel}` : ""}`;

  return { header, footer: footerOut, content, afterContent };
}

function unwrapRootClass(html: string, className: string): string {
  const trimmed = html.trim();
  const open = trimmed.match(/^<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/);
  if (!open) return html;
  const cls = (open[0].match(/\bclass\s*=\s*["']([^"']*)["']/i) || [])[1] || "";
  if (!new RegExp(`\\b${escapeRe(className)}\\b`).test(cls)) return html;
  const full = extractBalanced(trimmed, 0);
  if (!full || full.length < trimmed.length - 8) return html;
  return innerHtml(full).trim() || html;
}

/** Site-wide blocks (GeneratePress Elements, GenerateBlocks) after the article. */
function sliceAfterMain(body: string, footer: string): string {
  const ends = ["</article>", "</main>"].map((t) => {
    const i = body.toLowerCase().lastIndexOf(t);
    return i < 0 ? -1 : i + t.length;
  });
  const start = Math.max(...ends);
  if (start < 40) return "";
  let end = body.length;
  if (footer) {
    const fi = body.indexOf(footer, start);
    if (fi > start) end = fi;
  }
  if (end === body.length) {
    const m = body.slice(start).search(/<div[^>]*class="[^"]*site-footer/i);
    if (m >= 0) end = start + m;
  }
  let slice = body.slice(start, end).trim();
  slice = slice.replace(/^(<\/(?:div|section|main|article)>\s*)+/i, "").trim();
  if (stripTags(slice).length < 24 && !/<img\b/i.test(slice)) return "";
  return slice;
}

const SECTION_CHROME =
  /\b(inside-article|entry-content|site-main|content-area|site-content|grid-container|hfeed|wp-site-blocks)\b/i;

/** Drop page/theme wrappers that belong in the template shell, not a CMS section. */
export function stripSectionChrome(html: string): string {
  let s = html.trim();
  for (let n = 0; n < 8; n++) {
    const m = s.match(/^<(article|div|main|section)\b([^>]*)>/i);
    if (!m) break;
    const tag = m[1];
    const attrs = m[2] || "";
    const cls = (attrs.match(/\bclass\s*=\s*["']([^"']*)["']/i) || [])[1] || "";
    const isChrome =
      tag.toLowerCase() === "article" || SECTION_CHROME.test(cls);
    if (!isChrome) break;
    s = s.slice(m[0].length).trim();
    s = s.replace(new RegExp(`</${tag}>\\s*$`, "i"), "").trim();
  }
  for (let n = 0; n < 8; n++) {
    const m = s.match(/<\/(article|div|main|section)>\s*$/i);
    if (!m) break;
    const tag = m[1].toLowerCase();
    const opens = s.match(new RegExp(`<${tag}\\b`, "gi")) || [];
    const closes = s.match(new RegExp(`</${tag}>`, "gi")) || [];
    if (closes.length <= opens.length) break;
    s = s.replace(new RegExp(`</${tag}>\\s*$`, "i"), "").trim();
  }
  return s;
}

/** Close leftover tags so a section cannot swallow the next cms-edit-section. */
export function balanceHtmlFragment(html: string): string {
  const stack: string[] = [];
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[1].toLowerCase();
    if (VOID_TAGS.has(tag) || /\/\s*>$/.test(m[0])) continue;
    if (m[0].startsWith("</")) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i] === tag) {
          stack.length = i;
          break;
        }
      }
    } else {
      stack.push(tag);
    }
  }
  if (!stack.length) return html;
  return `${html}${stack
    .slice()
    .reverse()
    .map((t) => `</${t}>`)
    .join("")}`;
}
