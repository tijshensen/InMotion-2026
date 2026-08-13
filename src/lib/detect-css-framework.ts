export type CssFramework = "bootstrap" | "tailwind" | "none";

export function normalizeFramework(
  raw: string | null | undefined,
): CssFramework {
  const v = (raw || "").trim().toLowerCase();
  if (v === "bootstrap" || v === "bs" || v === "bs3" || v === "bs4" || v === "bs5") {
    return "bootstrap";
  }
  if (v === "tailwind" || v === "tailwindcss" || v === "tw") {
    return "tailwind";
  }
  return "none";
}

export function frameworkLabel(fw: CssFramework): string {
  if (fw === "bootstrap") return "Bootstrap";
  if (fw === "tailwind") return "Tailwind";
  return "custom / none";
}

export function slugifyPage(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Heuristic scan of raw HTML (stylesheets + class names).
 * Used before we spend a Grok call on a page import.
 */
export function detectCssFramework(html: string): {
  framework: CssFramework;
  confidence: "high" | "medium" | "low";
  evidence: string[];
} {
  const evidence: string[] = [];
  let bootstrap = 0;
  let tailwind = 0;

  const hrefs = Array.from(
    html.matchAll(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/gi),
  ).map((m) => m[1]);

  if (hrefs.some((h) => /bootstrap/i.test(h))) {
    bootstrap += 8;
    evidence.push("Bootstrap stylesheet");
  }
  if (hrefs.some((h) => /tailwind/i.test(h)) || /cdn\.tailwindcss\.com/i.test(html)) {
    tailwind += 8;
    evidence.push("Tailwind stylesheet / CDN");
  }

  const bsClasses = [
    [/\bcol-(?:xs|sm|md|lg|xl|xxl)-\d{1,2}\b/, "Bootstrap grid columns"],
    [/\bnavbar-(?:nav|brand|default|inverse|toggle)\b/, "Bootstrap navbar"],
    [/\bcontainer-fluid\b/, "container-fluid"],
    [/\bbtn-default\b/, "btn-default"],
    [/\b(?:visible|hidden)-(?:xs|sm|md|lg)\b/, "Bootstrap visibility"],
    [/\bimg-responsive\b/, "img-responsive"],
    [/\bglyphicon\b/, "Glyphicons"],
    [/\bform-horizontal\b/, "form-horizontal"],
  ] as const;
  for (const [re, label] of bsClasses) {
    if (re.test(html)) {
      bootstrap += 2;
      evidence.push(label);
    }
  }

  const twClasses = [
    [/\b(?:sm|md|lg|xl|2xl):[a-z0-9\/\[\]%-]+\b/, "Tailwind responsive prefixes"],
    [/\b(?:flex|inline-flex|grid)\s+(?:items|justify|gap)-/, "Tailwind flex/grid utilities"],
    [/\b(?:px|py|pt|pb|mt|mb|gap)-\d{1,2}\b/, "Tailwind spacing scale"],
    [/\b(?:text|bg|border)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/, "Tailwind palette"],
    [/\b(?:rounded-(?:md|lg|xl|2xl|full)|shadow-(?:sm|md|lg))\b/, "Tailwind radius/shadow"],
  ] as const;
  for (const [re, label] of twClasses) {
    if (re.test(html)) {
      tailwind += 2;
      evidence.push(label);
    }
  }

  if (bootstrap === 0 && tailwind === 0) {
    return { framework: "none", confidence: "low", evidence: [] };
  }

  const lead = bootstrap >= tailwind ? bootstrap : tailwind;
  const other = bootstrap >= tailwind ? tailwind : bootstrap;
  const framework: CssFramework =
    bootstrap === 0 && tailwind === 0
      ? "none"
      : bootstrap >= tailwind
        ? "bootstrap"
        : "tailwind";

  const confidence: "high" | "medium" | "low" =
    lead >= 8 && lead >= other * 2
      ? "high"
      : lead >= 4
        ? "medium"
        : "low";

  const unique = [...new Set(evidence)].slice(0, 6);
  return { framework, confidence, evidence: unique };
}

/** Same classes can stay. Site "none" also keeps the source as-is. */
export function needsFrameworkRewrite(
  source: CssFramework,
  site: CssFramework,
): boolean {
  if (site === "none") return false;
  if (source === site) return false;
  return true;
}
