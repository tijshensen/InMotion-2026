import { extractBalanced } from "./html-split";
import { ensureBuilderBodyClass, extractBodyClass, extractHtmlLang } from "./clone-runtime";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export type ScrapedImage = { url: string; alt: string };

export type CssSheet = { href: string; css: string };

export type PageSnapshot = {
  sourceUrl: string;
  finalUrl: string;
  title: string;
  html: string;
  css: string;
  /** Fetched stylesheets (absolute href + body). Used to persist large files. */
  cssSheets: CssSheet[];
  builder: string;
  cssKind: "bootstrap" | "tailwind" | "custom";
  images: ScrapedImage[];
  headings: string[];
  bodyClass: string;
  htmlLang: string;
};

/** One compiled app CSS (Vite/Tailwind) is often ~1MB. Cap a single sheet. */
export const CLONE_CSS_SHEET_MAX = 1_500_000;
/** Don't ingest every WP cache-plugin file. First sheets win. */
export const CLONE_CSS_TOTAL_MAX = 1_500_000;
/** Persist sheets larger than this as a file instead of inlining. */
export const CLONE_CSS_FILE_MIN = 48_000;

function absUrl(base: string, href: string): string | null {
  const raw = href.trim().split("#")[0] || "";
  if (!raw || raw.startsWith("data:") || raw.startsWith("javascript:")) {
    return null;
  }
  try {
    return unwrapCacheUrl(new URL(raw, base).href);
  } catch {
    return null;
  }
}

function attr(tag: string, name: string): string {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return (m?.[2] ?? m?.[3] ?? m?.[4] ?? "").trim();
}

export function unwrapCacheUrl(url: string): string {
  try {
    const u = new URL(url);
    const gi = u.searchParams.get("seraph_accel_gi");
    if (gi) {
      const path = gi.startsWith("/") ? gi : `/${gi}`;
      return new URL(path, `${u.origin}/`).href;
    }
  } catch {
    /* keep original */
  }
  return url;
}

export function detectSiteStack(html: string): {
  builder: string;
  cssKind: "bootstrap" | "tailwind" | "custom";
} {
  const h = html.toLowerCase();
  let builder = "unknown";
  if (h.includes("et_pb_") || h.includes("et_divi_theme") || h.includes("et-l--header")) {
    builder = "divi";
  } else if (h.includes("elementor-") || h.includes("elementor/")) {
    builder = "elementor";
  } else if (h.includes("wpb_wrapper") || h.includes("js_composer") || h.includes("vc_row")) {
    builder = "wpbakery";
  } else if (h.includes("wp-block-group") || h.includes("wp-block-cover") || h.includes("wp-block-post")) {
    builder = "gutenberg";
  } else if (isWordpressInstall(html)) {
    builder = "wordpress";
  } else if (
    h.includes("w-mod-") ||
    /\bdata-wf-(?:site|page|domain)\s*=/.test(h)
  ) {
    builder = "webflow";
  } else if (h.includes("cdn.shopify")) {
    builder = "shopify";
  } else if (h.includes("__next") || h.includes("_next/static")) {
    builder = "nextjs";
  } else if (h.includes("wix.com") || h.includes("parastorage")) {
    builder = "wix";
  } else if (
    h.includes("static1.squarespace.com") ||
    h.includes("squarespace-cdn") ||
    /\bsqs-(?:block|layout|site)\b/.test(h)
  ) {
    builder = "squarespace";
  } else if (
    /\/static\/css\/[^"'>\s]+\.css/i.test(html) &&
    /modulepreload/i.test(html)
  ) {
    builder = "vite";
  }

  let cssKind: "bootstrap" | "tailwind" | "custom" = "custom";
  if (
    h.includes("bootstrap") ||
    h.includes("glyphicon") ||
    /\bcol-sm-|\bnavbar-(?:nav|default|collapse|toggle)\b/.test(h)
  ) {
    cssKind = "bootstrap";
  } else if (h.includes("cdn.tailwindcss.com") || h.includes("tailwindcss")) {
    // Compiled utility CSS without this string stays "custom" so we do not
    // inject the Play CDN on top of a hashed stylesheet.
    cssKind = "tailwind";
  }
  return { builder, cssKind };
}

/** Real WP install paths/meta — not the word "WordPress" in marketing copy. */
export function isWordpressInstall(html: string): boolean {
  const h = html.toLowerCase();
  return (
    h.includes("wp-content/") ||
    h.includes("wp-includes/") ||
    h.includes("wp-json/") ||
    /name=["']generator["'][^>]*content=["']wordpress/i.test(html) ||
    /content=["']wordpress[^"']*["'][^>]*name=["']generator["']/i.test(html)
  );
}

/**
 * Head inner HTML. Vite prerenders assets as <html> children with no <head>.
 * Do not match `<header` as `<head`.
 */
export function extractDocumentHead(html: string): string {
  const classic = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  if (classic?.[1]?.trim()) return classic[1].trim();
  const htmlOpen = html.match(/<html\b[^>]*>/i);
  if (!htmlOpen || htmlOpen.index == null) return "";
  const start = htmlOpen.index + htmlOpen[0].length;
  const rest = html.slice(start);
  const bodyAt = rest.search(/<body\b/i);
  if (bodyAt >= 0) return rest.slice(0, bodyAt).trim();
  return "";
}

/** Keep Tailwind variants like dark:bg-gray-900; strip quotes/angles only. */
export function sanitizeCloneBodyClass(raw: string): string {
  return (raw || "")
    .replace(/[^\w\s:/-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchText(
  url: string,
  opts?: { timeoutMs?: number; referer?: string },
): Promise<{ url: string; status: number; body: string; contentType: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts?.timeoutMs ?? 20_000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml,text/css,*/*;q=0.8",
        ...(opts?.referer ? { Referer: opts.referer } : {}),
      },
    });
    const contentType = res.headers.get("content-type") || "";
    const body = await res.text();
    return { url: res.url || url, status: res.status, body, contentType };
  } finally {
    clearTimeout(t);
  }
}

function stripScripts(html: string) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, "")
    .replace(/<img\b[^>]*z-index:\s*-99999[^>]*>/gi, "")
    .replace(/\s+on\w+="[^"]*"/gi, "")
    .replace(/\s+on\w+='[^']*'/gi, "");
}

const LAZY_SRC_ATTRS = [
  "data-lzl-src",
  "data-lazy-src",
  "data-src",
  "data-original",
  "data-bg",
  "data-large_image",
  "data-nitro-lazy-src",
];

const LAZY_CLASSES = new Set([
  "lzl",
  "lzl-ing",
  "lzl-ed",
  "js-lzl-ing",
  "seraph-accel-js-lzl-ing",
  "lazyload",
  "lazy-hidden",
]);

function isPlaceholderSrc(src: string) {
  if (!src) return true;
  if (src.startsWith("data:")) return true;
  if (/spacer\.gif|1x1|pixel\./i.test(src)) return true;
  return false;
}

function classAttrTokens(openTag: string): string[] {
  const m = openTag.match(/\bclass\s*=\s*(["'])([^"']*)\1/i);
  return m ? m[2].split(/\s+/).filter(Boolean) : [];
}

function removeClassedElements(html: string, className: string): string {
  const re = /<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
  const ranges: { start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (!classAttrTokens(m[0]).includes(className)) continue;
    const block = extractBalanced(html, m.index);
    if (!block) continue;
    ranges.push({ start: m.index, end: m.index + block.length });
    re.lastIndex = m.index + block.length;
  }
  let out = html;
  for (let i = ranges.length - 1; i >= 0; i--) {
    const r = ranges[i];
    out = out.slice(0, r.start) + out.slice(r.end);
  }
  return out;
}

/** Cache plugins hide whole sections with .lzl { display:none }. Clone has no JS, so un-hide. */
export function unlazyHtml(html: string, base: string): string {
  let out = removeClassedElements(html, "js-lzl-ing");
  out = out.replace(/\bclass=(["'])([^"']*)\1/gi, (_full, q: string, cls: string) => {
    const next = cls
      .split(/\s+/)
      .filter((c) => c && !LAZY_CLASSES.has(c))
      .join(" ");
    return `class=${q}${next}${q}`;
  });

  out = out.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = attr(tag, "src");
    let nextSrc = src;
    if (isPlaceholderSrc(src)) {
      for (const name of LAZY_SRC_ATTRS) {
        const v = attr(tag, name);
        if (v && !isPlaceholderSrc(v)) {
          nextSrc = v;
          break;
        }
      }
      const srcset = attr(tag, "srcset") || attr(tag, "data-srcset") || attr(tag, "data-lzl-srcset");
      if (isPlaceholderSrc(nextSrc) && srcset) {
        nextSrc = pickSrcset(srcset, base) || nextSrc;
      }
    }
    const abs = nextSrc ? absUrl(base, nextSrc) : null;
    if (!abs) return tag;
    if (/\bsrc\s*=/i.test(tag)) {
      return tag.replace(/\bsrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i, `src="${abs}"`);
    }
    return tag.replace(/<img\b/i, `<img src="${abs}"`);
  });

  out = out.replace(
    /url\((['"]?)([^'")]+)\1\)/gi,
    (full, _q, raw: string) => {
      const abs = absUrl(base, raw.trim());
      return abs ? `url("${abs}")` : full;
    },
  );

  out = out.replace(/\.lzl\{display:none!important;\}/gi, "");
  out = out.replace(/img\.lzl,img\.lzl-ing\{opacity:0\.01;\}/gi, "");

  return out;
}

function absolutizeHtml(html: string, base: string) {
  return html.replace(
    /\s(href|src|poster|action|data-lzl-src|data-lazy-src|data-src|data-original|srcset|data-srcset)\s*=\s*("([^"]*)"|'([^']*)')/gi,
    (full, name, _q, d, s) => {
      const val = d ?? s ?? "";
      if (String(name).toLowerCase().includes("srcset")) {
        const rewritten = String(val)
          .split(",")
          .map((part: string) => {
            const p = part.trim();
            const sp = p.lastIndexOf(" ");
            const url = sp > 0 && /\d+[wx]$/i.test(p.slice(sp + 1)) ? p.slice(0, sp) : p;
            const desc = sp > 0 && /\d+[wx]$/i.test(p.slice(sp + 1)) ? p.slice(sp) : "";
            const abs = absUrl(base, url);
            return abs ? `${abs}${desc}` : p;
          })
          .join(", ");
        return ` ${name}="${rewritten}"`;
      }
      const abs = absUrl(base, val);
      if (!abs || abs === val) return full;
      return ` ${name}="${abs}"`;
    },
  );
}

function extractTitle(html: string) {
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return (t?.[1] || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function extractHeadings(html: string) {
  const out: string[] = [];
  const re = /<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < 20) {
    const text = (m[1] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text.length > 1) out.push(text.slice(0, 120));
  }
  return out;
}

function pickSrcset(srcset: string, base: string): string | null {
  const parts = srcset.split(",").map((p) => p.trim()).filter(Boolean);
  const last = parts[parts.length - 1];
  if (!last) return null;
  const url = last.replace(/\s+\d+[wx]$/i, "").trim();
  return absUrl(base, url);
}

const SKIP_IMG =
  /pixel|1x1|tracking|facebook\.com\/tr|google-analytics|doubleclick|gravatar\.com\/avatar|spinner|spacer\.gif/i;

function pushImage(
  out: ScrapedImage[],
  seen: Set<string>,
  url: string | null,
  alt = "",
) {
  if (!url || seen.has(url) || SKIP_IMG.test(url) || url.startsWith("data:")) return;
  if (out.length >= 48) return;
  seen.add(url);
  out.push({ url, alt });
}

export function collectImages(html: string, base: string): ScrapedImage[] {
  const seen = new Set<string>();
  const out: ScrapedImage[] = [];
  const re = /<img\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < 48) {
    const tag = m[0];
    const srcset =
      attr(tag, "srcset") || attr(tag, "data-srcset") || attr(tag, "data-lzl-srcset");
    const raw =
      absUrl(
        base,
        attr(tag, "src") ||
          attr(tag, "data-lzl-src") ||
          attr(tag, "data-src") ||
          attr(tag, "data-lazy-src") ||
          attr(tag, "data-original") ||
          "",
      ) || pickSrcset(srcset, base);
    pushImage(out, seen, raw, attr(tag, "alt"));
  }

  const cssUrlRe = /url\((['"]?)([^'")]+)\1\)/gi;
  let cu: RegExpExecArray | null;
  while ((cu = cssUrlRe.exec(html)) && out.length < 48) {
    const abs = absUrl(base, cu[2].trim());
    if (abs && /\.(png|jpe?g|webp|gif|svg|avif)(\?|$)/i.test(abs)) {
      pushImage(out, seen, abs);
    }
  }
  return out;
}

function stylesheetHrefs(html: string, base: string): string[] {
  const hrefs: string[] = [];
  const re = /<link\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const rel = (attr(tag, "rel") || "").toLowerCase();
    if (!rel.includes("stylesheet") && attr(tag, "as") !== "style") continue;
    const href = absUrl(base, attr(tag, "href"));
    if (
      href &&
      !href.startsWith("data:") &&
      !href.includes("fonts.googleapis.com") &&
      !href.includes("fonts.gstatic.com")
    ) {
      hrefs.push(href);
    }
  }
  return [...new Set(hrefs)].slice(0, 12);
}

function inlineStyles(html: string): string {
  const parts: string[] = [];
  const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const css = (m[1] || "").trim();
    if (css) parts.push(css);
  }
  return parts.join("\n\n");
}

export async function scrapePage(sourceUrl: string): Promise<PageSnapshot> {
  let fetched;
  try {
    fetched = await fetchText(sourceUrl, { timeoutMs: 25_000 });
  } catch {
    throw new Error(
      "Could not reach that URL. Check it is public (not behind a login).",
    );
  }
  if (fetched.status === 404) throw new Error("That URL was not found (404).");
  if (fetched.status === 401 || fetched.status === 403) {
    throw new Error(
      `That website blocked the fetch (HTTP ${fetched.status}). Try another URL.`,
    );
  }
  if (fetched.status < 200 || fetched.status >= 400) {
    throw new Error(`Could not fetch that URL (HTTP ${fetched.status}).`);
  }

  const base = fetched.url || sourceUrl;
  let html = stripScripts(fetched.body);
  html = unlazyHtml(html, base);
  html = absolutizeHtml(html, base);
  const textLen = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length;
  if (textLen < 80) {
    throw new Error(
      "That page has too little HTML to clone (it may be a JavaScript app).",
    );
  }

  const stack = detectSiteStack(html);
  const { combined: css, sheets: cssSheets } = await collectPageCss(html, base);

  return {
    sourceUrl,
    finalUrl: base,
    title: extractTitle(html) || new URL(base).hostname,
    html,
    css,
    cssSheets,
    builder: stack.builder,
    cssKind: stack.cssKind,
    images: collectImages(html, base),
    headings: extractHeadings(html),
    bodyClass: ensureBuilderBodyClass(stack.builder, extractBodyClass(html)),
    htmlLang: extractHtmlLang(html),
  };
}

async function collectPageCss(
  html: string,
  base: string,
): Promise<{ combined: string; sheets: CssSheet[] }> {
  const inline = inlineStyles(html);
  const sheets: CssSheet[] = [];
  const parts: string[] = [];
  if (inline) parts.push(inline);
  let total = inline.length;

  // Always consider linked sheets. A compiled Tailwind file is often the
  // whole design and larger than the old 400KB skip. A total budget still
  // stops us from swallowing 80 WordPress cache-plugin files.
  for (const href of stylesheetHrefs(html, base)) {
    if (total >= CLONE_CSS_TOTAL_MAX && sheets.length > 0) break;
    try {
      const sheet = await fetchText(href, { timeoutMs: 15_000, referer: base });
      if (sheet.status < 200 || sheet.status >= 300) continue;
      if (sheet.body.length > CLONE_CSS_SHEET_MAX) continue;
      const remaining = CLONE_CSS_TOTAL_MAX - total;
      if (sheets.length > 0 && sheet.body.length > remaining) continue;
      const css = unlazyHtml(sheet.body, href);
      sheets.push({ href, css });
      parts.push(`/* ${href} */\n${css}`);
      total += css.length;
    } catch {
      /* original <link> in the head still hotlinks if fetch fails */
    }
  }

  return { combined: parts.filter(Boolean).join("\n\n"), sheets };
}

export const scrapeBrowserUa = BROWSER_UA;
