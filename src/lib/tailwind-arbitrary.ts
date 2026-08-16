/**
 * Compile Tailwind arbitrary utilities (max-w-[130px], text-[#111], md:p-[8px])
 * into a style tag. The Play CDN is unreliable in srcDoc iframes; this is
 * the canvas/public source of truth for bracket classes.
 */

const MEDIA: Record<string, string> = {
  sm: "(min-width: 640px)",
  md: "(min-width: 768px)",
  lg: "(min-width: 1024px)",
  xl: "(min-width: 1280px)",
  "2xl": "(min-width: 1536px)",
};

const PSEUDO: Record<string, string> = {
  hover: ":hover",
  focus: ":focus",
  "focus-visible": ":focus-visible",
  active: ":active",
  disabled: ":disabled",
  visited: ":visited",
  "group-hover": ":is(:where(.group):hover *)",
};

const BOX: Record<string, string | string[]> = {
  p: "padding",
  px: ["padding-left", "padding-right"],
  py: ["padding-top", "padding-bottom"],
  pt: "padding-top",
  pr: "padding-right",
  pb: "padding-bottom",
  pl: "padding-left",
  ps: "padding-inline-start",
  pe: "padding-inline-end",
  m: "margin",
  mx: ["margin-left", "margin-right"],
  my: ["margin-top", "margin-bottom"],
  mt: "margin-top",
  mr: "margin-right",
  mb: "margin-bottom",
  ml: "margin-left",
  ms: "margin-inline-start",
  me: "margin-inline-end",
  inset: ["top", "right", "bottom", "left"],
  "inset-x": ["left", "right"],
  "inset-y": ["top", "bottom"],
  top: "top",
  right: "right",
  bottom: "bottom",
  left: "left",
  start: "inset-inline-start",
  end: "inset-inline-end",
  gap: "gap",
  "gap-x": "column-gap",
  "gap-y": "row-gap",
  w: "width",
  "min-w": "min-width",
  "max-w": "max-width",
  h: "height",
  "min-h": "min-height",
  "max-h": "max-height",
  size: ["width", "height"],
  basis: "flex-basis",
  indent: "text-indent",
  leading: "line-height",
  tracking: "letter-spacing",
  z: "z-index",
  opacity: "opacity",
  grow: "flex-grow",
  shrink: "flex-shrink",
  order: "order",
  aspect: "aspect-ratio",
  columns: "columns",
  "outline-offset": "outline-offset",
  "outline-w": "outline-width",
  "border-spacing": "border-spacing",
  rounded: "border-radius",
  "rounded-t": ["border-top-left-radius", "border-top-right-radius"],
  "rounded-b": ["border-bottom-left-radius", "border-bottom-right-radius"],
  "rounded-l": ["border-top-left-radius", "border-bottom-left-radius"],
  "rounded-r": ["border-top-right-radius", "border-bottom-right-radius"],
  "rounded-tl": "border-top-left-radius",
  "rounded-tr": "border-top-right-radius",
  "rounded-bl": "border-bottom-left-radius",
  "rounded-br": "border-bottom-right-radius",
  border: "border-width",
  "border-t": "border-top-width",
  "border-r": "border-right-width",
  "border-b": "border-bottom-width",
  "border-l": "border-left-width",
  "translate-x": "--tw-translate-x",
  "translate-y": "--tw-translate-y",
  rotate: "--tw-rotate",
  "scale-x": "--tw-scale-x",
  "scale-y": "--tw-scale-y",
  scale: ["--tw-scale-x", "--tw-scale-y"],
  duration: "transition-duration",
  delay: "transition-delay",
  "object": "object-position",
};

const STYLE_ID = "cms-tw-jit";

function escapeSelector(cls: string) {
  return cls.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
}

function decodeArbitrary(raw: string) {
  return raw.replace(/_/g, " ").replace(/\\ /g, "_");
}

function looksLikeColor(value: string) {
  return /^(#|rgb|hsl|oklch|oklab|hwb|lab|lch|color-mix|var\(--)/i.test(value);
}

function looksLikeImage(value: string) {
  return /^(url\(|linear-gradient|radial-gradient|conic-gradient)/i.test(value);
}

function declsFor(util: string, value: string): string[] {
  if (util === "text") {
    const prop = looksLikeColor(value) ? "color" : "font-size";
    return [`${prop}: ${value}`];
  }
  if (util === "bg") {
    if (looksLikeImage(value)) return [`background-image: ${value}`];
    return [`background-color: ${value}`];
  }
  if (util === "from") return [`--tw-gradient-from: ${value}`];
  if (util === "via") return [`--tw-gradient-via: ${value}`];
  if (util === "to") return [`--tw-gradient-to: ${value}`];
  if (util === "border-color" || (util === "border" && looksLikeColor(value))) {
    return [`border-color: ${value}`];
  }
  if (util === "outline" && looksLikeColor(value)) {
    return [`outline-color: ${value}`];
  }
  if (util === "shadow") return [`box-shadow: ${value}`];
  if (util === "flex") return [`flex: ${value}`];
  if (util === "grid-cols") {
    return [`grid-template-columns: ${value}`];
  }
  if (util === "grid-rows") {
    return [`grid-template-rows: ${value}`];
  }
  if (util === "col-span") return [`grid-column: span ${value} / span ${value}`];
  if (util === "row-span") return [`grid-row: span ${value} / span ${value}`];
  const mapped = BOX[util];
  if (!mapped) return [`${util}: ${value}`];
  const props = Array.isArray(mapped) ? mapped : [mapped];
  return props.map((p) => `${p}: ${value}`);
}

type Parsed = {
  important: boolean;
  media: string | null;
  pseudo: string;
  util: string;
  value: string;
};

function parseArbitrary(cls: string): Parsed | null {
  let rest = cls;
  let important = false;
  if (rest.startsWith("!")) {
    important = true;
    rest = rest.slice(1);
  }

  const variants: string[] = [];
  while (true) {
    const cut = rest.indexOf(":");
    if (cut <= 0) break;
    const head = rest.slice(0, cut);
    if (!(head in MEDIA) && !(head in PSEUDO) && head !== "dark") break;
    // Don't treat `text-[#fff]` as variant — no, that's after last colon inside []
    // Variants are only before the utility. Stop if remaining has `[` before another issue.
    variants.push(head);
    rest = rest.slice(cut + 1);
    if (rest.startsWith("!")) {
      important = true;
      rest = rest.slice(1);
    }
  }

  let util: string;
  let value: string;
  const propMatch = rest.match(/^\[([^:\]]+:.+)\]$/);
  if (propMatch?.[1]) {
    util = "__prop";
    value = decodeArbitrary(propMatch[1]);
  } else {
    const m = rest.match(/^([a-z][a-z0-9-]*)-\[(.+)\]$/i);
    if (!m?.[1] || m[2] == null) return null;
    util = m[1];
    value = decodeArbitrary(m[2]);
  }

  let media: string | null = null;
  let pseudo = "";
  for (const v of variants) {
    if (MEDIA[v]) media = MEDIA[v];
    else if (PSEUDO[v]) pseudo += PSEUDO[v];
  }

  return { important, media, pseudo, util, value };
}

function cssForClass(cls: string): { media: string | null; rule: string } | null {
  const parsed = parseArbitrary(cls);
  if (!parsed) return null;
  const decls =
    parsed.util === "__prop"
      ? [parsed.value]
      : declsFor(parsed.util, parsed.value);
  if (!decls.length) return null;
  const body = decls
    .map((d) => (parsed.important ? `${d} !important` : d))
    .join("; ");
  const sel = `.${escapeSelector(cls)}${parsed.pseudo}`;
  return { media: parsed.media, rule: `${sel} { ${body}; }` };
}

export function collectClassTokens(htmlOrList: string): string[] {
  const found = new Set<string>();
  const attr = htmlOrList.matchAll(/\bclass(?:Name)?=["']([^"']+)["']/gi);
  let sawAttr = false;
  for (const m of attr) {
    sawAttr = true;
    for (const token of (m[1] || "").split(/\s+/)) {
      if (token.includes("[")) found.add(token);
    }
  }
  if (!sawAttr) {
    for (const token of htmlOrList.split(/\s+/)) {
      if (token.includes("[")) found.add(token);
    }
  }
  return [...found];
}

export function compileArbitraryCss(classes: string[]): string {
  const plain: string[] = [];
  const byMedia = new Map<string, string[]>();
  for (const cls of classes) {
    const compiled = cssForClass(cls);
    if (!compiled) continue;
    if (compiled.media) {
      const list = byMedia.get(compiled.media) || [];
      list.push(compiled.rule);
      byMedia.set(compiled.media, list);
    } else {
      plain.push(compiled.rule);
    }
  }
  const chunks = [...plain];
  for (const [query, rules] of byMedia) {
    chunks.push(`@media ${query} {\n${rules.join("\n")}\n}`);
  }
  return chunks.join("\n");
}

export function styleTagForArbitrary(html: string): string {
  const css = compileArbitraryCss(collectClassTokens(html));
  if (!css) return "";
  return `<style id="${STYLE_ID}">${css}</style>\n`;
}

export function injectArbitraryCssIntoHtml(html: string): string {
  const tag = styleTagForArbitrary(html);
  if (!tag) {
    return html.replace(
      new RegExp(`<style id="${STYLE_ID}">[\\s\\S]*?<\\/style>\\s*`, "i"),
      "",
    );
  }
  const next = html.replace(
    new RegExp(`<style id="${STYLE_ID}">[\\s\\S]*?<\\/style>\\s*`, "i"),
    "",
  );
  if (/<\/head>/i.test(next)) return next.replace(/<\/head>/i, `${tag}</head>`);
  return tag + next;
}

export function injectArbitraryCssIntoDocument(doc: Document) {
  const tokens = new Set<string>();
  doc.querySelectorAll("[class]").forEach((el) => {
    const cls = typeof el.className === "string" ? el.className : "";
    for (const token of cls.split(/\s+/)) {
      if (token.includes("[")) tokens.add(token);
    }
  });
  const css = compileArbitraryCss([...tokens]);
  let el = doc.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!css) {
    el?.remove();
    return;
  }
  if (!el) {
    el = doc.createElement("style");
    el.id = STYLE_ID;
    doc.head.appendChild(el);
  }
  el.textContent = css;
}
