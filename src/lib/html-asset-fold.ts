/**
 * Collapse <style> / <script> in a template shell for the HTML editor.
 * Stored HTML is unchanged: fold for display, unfold on edit/save.
 */

export type FoldedAsset = {
  id: string;
  tag: "style" | "script";
  full: string;
  label: string;
  bytes: number;
};

export type FoldedHtml = {
  folded: string;
  blocks: FoldedAsset[];
};

function foldableRe() {
  return /<(style|script)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
}

function foldCommentRe() {
  return /<!--\s*cms-fold:([a-zA-Z0-9_-]+)[^>]*-->/g;
}

function attr(attrs: string, name: string): string {
  const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  return (m?.[2] ?? m?.[3] ?? "").trim();
}

export function formatFoldBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

function labelFor(tag: string, attrs: string): string {
  if (/data-cms-cloned-css/i.test(attrs)) return "cloned CSS";
  if (/data-cms-clone-fix/i.test(attrs)) return "clone fixes";
  if (/data-cms-clone-revive/i.test(attrs)) return "clone revive";
  if (/data-cms-menu-snippet/i.test(attrs)) return "menu CSS";
  const type = attr(attrs, "type").toLowerCase();
  if (type.includes("ld+json")) return "JSON-LD";
  if (type.includes("importmap")) return "import map";
  const src = attr(attrs, "src");
  if (src) return "external script";
  return tag.toLowerCase() === "style" ? "CSS" : "JavaScript";
}

function placeholder(block: FoldedAsset): string {
  return `<!-- cms-fold:${block.id} ${block.label} · ${formatFoldBytes(block.bytes)} -->`;
}

export function foldHtmlAssets(html: string): FoldedHtml {
  const blocks: FoldedAsset[] = [];
  let cssN = 0;
  let jsN = 0;
  const folded = html.replace(foldableRe(), (full, tag: string, attrs: string) => {
    const kind = tag.toLowerCase() === "style" ? "style" : "script";
    const n = kind === "style" ? ++cssN : ++jsN;
    const block: FoldedAsset = {
      id: `${kind}-${n}`,
      tag: kind,
      full,
      label: labelFor(tag, attrs || ""),
      bytes: full.length,
    };
    blocks.push(block);
    return placeholder(block);
  });
  return { folded, blocks };
}

export function unfoldHtmlAssets(folded: string, blocks: FoldedAsset[]): string {
  const byId = new Map(blocks.map((b) => [b.id, b.full]));
  return folded.replace(foldCommentRe(), (_m, id: string) => {
    const full = byId.get(id);
    if (full == null) return "";
    byId.delete(id);
    return full;
  });
}

export function foldAssetSummary(blocks: FoldedAsset[]): {
  css: number;
  js: number;
  bytes: number;
} {
  let css = 0;
  let js = 0;
  let bytes = 0;
  for (const b of blocks) {
    bytes += b.bytes;
    if (b.tag === "style") css += 1;
    else js += 1;
  }
  return { css, js, bytes };
}
