/**
 * Pure class-list matching for style presets (safe for client imports).
 */

import { stampLayoutNids } from "@/lib/layout-html";

const SKIP_TAGS = new Set([
  "br",
  "hr",
  "meta",
  "link",
  "source",
  "script",
  "style",
  "noscript",
]);

export const PRESET_MIN_SCORE = 0.55;
export const PRESET_MIN_INTERSECT = 2;

export type PresetHitKind = "pageBlock" | "templateBlock" | "shell";

export type PresetHit = {
  id: string;
  kind: PresetHitKind;
  targetId: string;
  nid: string;
  tag: string;
  className: string;
  score: number;
  pageId?: string;
  pageTitle?: string;
  sectionName?: string;
};

export type UndoItem = {
  kind: PresetHitKind;
  id: string;
  field: "content" | "defaultHtml" | "coreHtml";
  value: string;
};

export function normalizeClass(className: string): string {
  return [
    ...new Set(
      className
        .split(/\s+/)
        .filter((t) => t && t !== "is-layout-selected"),
    ),
  ].join(" ");
}

export function classTokens(className: string): string[] {
  return normalizeClass(className).split(/\s+/).filter(Boolean);
}

export function jaccard(a: string[], b: string[]): number {
  if (!a.length && !b.length) return 1;
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  return inter / (A.size + B.size - inter);
}

export function classSimilarity(a: string, b: string): number {
  return jaccard(classTokens(a), classTokens(b));
}

export function classIntersect(a: string, b: string): number {
  const B = new Set(classTokens(b));
  let n = 0;
  for (const t of classTokens(a)) if (B.has(t)) n += 1;
  return n;
}

export function isSimilarClass(
  source: string,
  candidate: string,
  sameTag: boolean,
): boolean {
  const src = normalizeClass(source);
  const cand = normalizeClass(candidate);
  if (!src || !cand) return false;
  if (src === cand) return false;
  if (classIntersect(src, cand) < PRESET_MIN_INTERSECT) return false;
  const score = classSimilarity(src, cand);
  return score >= (sameTag ? PRESET_MIN_SCORE : PRESET_MIN_SCORE + 0.18);
}

export type ExtractedEl = {
  tag: string;
  nid: string;
  className: string;
};

export function extractClassedElements(html: string): ExtractedEl[] {
  if (!html?.trim()) return [];
  const stamped = stampLayoutNids(html);
  const out: ExtractedEl[] = [];
  const re = /<([a-zA-Z][\w:-]*)([^>]*?)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stamped))) {
    const tag = m[1].toLowerCase();
    if (SKIP_TAGS.has(tag)) continue;
    const attrs = m[2];
    const cls = attrs.match(/\bclass\s*=\s*["']([^"']*)["']/i)?.[1] || "";
    if (!cls.trim()) continue;
    const nid = attrs.match(/\bdata-cms-nid\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!nid) continue;
    out.push({ tag, nid, className: normalizeClass(cls) });
  }
  return out;
}
