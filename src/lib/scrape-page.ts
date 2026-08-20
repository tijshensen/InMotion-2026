const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export type ScrapedImage = { url: string; alt: string };

export type PageSnapshot = {
  sourceUrl: string;
  finalUrl: string;
  title: string;
  html: string;
  css: string;
  builder: string;
  cssKind: "bootstrap" | "tailwind" | "custom";
  images: ScrapedImage[];
  headings: string[];
};

function absUrl(base: string, href: string): string | null {
  const raw = href.trim().split("#")[0] || "";
  if (!raw || raw.startsWith("data:") || raw.startsWith("javascript:")) {
    return null;
  }
  try {
    return new URL(raw, base).href;
  } catch {
    return null;
  }
}

function attr(tag: string, name: string): string {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return (m?.[2] ?? m?.[3] ?? m?.[4] ?? "").trim();
}

export function detectSiteStack(html: string): {
  builder: string;
  cssKind: "bootstrap" | "tailwind" | "custom";
} {
  const h = html.toLowerCase();
  let builder = "unknown";
  if (h.includes("wp-content") || h.includes("wordpress")) builder = "wordpress";
  else if (h.includes("w-mod-") || h.includes("webflow")) builder = "webflow";
  else if (h.includes("cdn.shopify") || h.includes("shopify")) builder = "shopify";
  else if (h.includes("__next") || h.includes("_next/static")) builder = "nextjs";
  else if (h.includes("wix.com") || h.includes("parastorage")) builder = "wix";
  else if (h.includes("squarespace")) builder = "squarespace";

  let cssKind: "bootstrap" | "tailwind" | "custom" = "custom";
  if (h.includes("bootstrap") || h.includes("glyphicon") || /\bcol-sm-|\bnavbar-/.test(h)) {
    cssKind = "bootstrap";
  } else if (h.includes("cdn.tailwindcss.com") || h.includes("tailwindcss")) {
    cssKind = "tailwind";
  }
  return { builder, cssKind };
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
    .replace(/\s+on\w+="[^"]*"/gi, "")
    .replace(/\s+on\w+='[^']*'/gi, "");
}

function absolutizeHtml(html: string, base: string) {
  return html.replace(
    /\s(href|src|poster|action)\s*=\s*("([^"]*)"|'([^']*)')/gi,
    (full, name, _q, d, s) => {
      const val = d ?? s ?? "";
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

export function collectImages(html: string, base: string): ScrapedImage[] {
  const seen = new Set<string>();
  const out: ScrapedImage[] = [];
  const re = /<img\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < 40) {
    const tag = m[0];
    const srcset = attr(tag, "srcset") || attr(tag, "data-srcset");
    const raw =
      pickSrcset(srcset, base) ||
      absUrl(
        base,
        attr(tag, "src") ||
          attr(tag, "data-src") ||
          attr(tag, "data-lazy-src") ||
          attr(tag, "data-original") ||
          "",
      );
    if (!raw || seen.has(raw) || SKIP_IMG.test(raw) || raw.startsWith("data:")) {
      continue;
    }
    seen.add(raw);
    out.push({ url: raw, alt: attr(tag, "alt") });
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
    if (href && !href.includes("fonts.googleapis.com") && !href.includes("fonts.gstatic.com")) {
      hrefs.push(href);
    }
  }
  return [...new Set(hrefs)].slice(0, 8);
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
  html = absolutizeHtml(html, base);
  const textLen = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length;
  if (textLen < 80) {
    throw new Error(
      "That page has too little HTML to clone (it may be a JavaScript app).",
    );
  }

  const stack = detectSiteStack(html);
  const cssChunks = [inlineStyles(html)];
  const sheets = stylesheetHrefs(html, base);
  for (const href of sheets) {
    try {
      const sheet = await fetchText(href, { timeoutMs: 12_000, referer: base });
      if (sheet.status >= 200 && sheet.status < 300 && sheet.body.length < 400_000) {
        cssChunks.push(`/* ${href} */\n${sheet.body}`);
      }
    } catch {
      /* keep going — look still works without every sheet */
    }
  }

  return {
    sourceUrl,
    finalUrl: base,
    title: extractTitle(html) || new URL(base).hostname,
    html,
    css: cssChunks.filter(Boolean).join("\n\n"),
    builder: stack.builder,
    cssKind: stack.cssKind,
    images: collectImages(html, base),
    headings: extractHeadings(html),
  };
}

export const scrapeBrowserUa = BROWSER_UA;
