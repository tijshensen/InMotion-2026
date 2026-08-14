/**
 * Stable element ids on section HTML so Layout mode can rewrite class
 * attributes without a CSS object model.
 */

const NID = "data-cms-nid";

function nextNid(used: Set<string>): string {
  let i = 1;
  while (used.has(`n${i}`)) i += 1;
  return `n${i}`;
}

/** Add data-cms-nid to every element that does not already have one. */
export function stampLayoutNids(html: string): string {
  if (!html?.trim()) return html;
  const used = new Set<string>();
  for (const m of html.matchAll(/data-cms-nid=["']([^"']+)["']/gi)) {
    used.add(m[1]);
  }

  return html.replace(/<([a-zA-Z][\w:-]*)([^>]*?)(\s*\/?)>/g, (full, tag, attrs, close) => {
    if (/^\/\s*$/.test(close) && !attrs) return full;
    if (/\bdata-cms-nid\s*=/i.test(attrs)) return full;
    const t = String(tag).toLowerCase();
    if (t === "br" || t === "hr" || t === "meta" || t === "link" || t === "source") {
      return full;
    }
    const nid = nextNid(used);
    used.add(nid);
    const slash = close.includes("/") ? " /" : "";
    return `<${tag}${attrs} ${NID}="${nid}"${slash}>`;
  });
}

export function setClassAtNid(
  html: string,
  nid: string,
  className: string,
): string {
  if (!html || !nid) return html;
  const safe = nid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `(<[^>]*\\bdata-cms-nid=["']${safe}["'][^>]*)>`,
    "i",
  );
  return html.replace(re, (full, start: string) => {
    const clean = className.replace(/\s+/g, " ").trim();
    if (/\bclass\s*=/i.test(start)) {
      const next = start.replace(
        /\bclass\s*=\s*(["'])[\s\S]*?\1/i,
        clean ? `class="${clean}"` : "",
      );
      return `${next.replace(/\s+$/, "")}>`;
    }
    if (!clean) return `${start}>`;
    return `${start} class="${clean}">`;
  });
}

export function getClassAtNid(html: string, nid: string): string {
  if (!html || !nid) return "";
  const safe = nid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `<[^>]*\\bdata-cms-nid=["']${safe}["'][^>]*>`,
    "i",
  );
  const tag = html.match(re)?.[0] || "";
  return tag.match(/\bclass\s*=\s*["']([^"']*)["']/i)?.[1] || "";
}
