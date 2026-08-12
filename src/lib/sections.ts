/**
 * Section-based page builder (MotionCMS-style).
 *
 * Layout markers (verified against cms/inc/templaternew.inc.php):
 *   <singleline name="…">…</singleline>   + optional link (_link, _link_target, _link_title)
 *   <multiline name="…">…</multiline>     rich HTML
 *   <img editable="true" name="…" src width height alt />
 *       + optional _link, _link_target, _link_title, _alt
 *       (legacy also used label="…" instead of name)
 *   <file name="…">label</file>           file URL + description
 *
 * Stored as: { "v": 1, "fields": { key: value, key__alt: "…", key__link: "…" } }
 *
 * Editor UX (pages.edit.view.php + pages.view.view.php):
 *   - Main area = full rendered page (iframe)
 *   - Click a block → parent.openSidebar() + field editors from Templater::edit()
 */

import {
  convertBootstrapHtml,
  TAILWIND_SHELL,
} from "./bootstrap-to-tailwind";
import { normalizeInsertHtml } from "./insert-html";
import {
  resolveInternalLinks,
  type LinkablePage,
} from "./internal-links";

export type FieldType = "singleline" | "multiline" | "image" | "file";

export type SectionField = {
  key: string;
  type: FieldType;
  label: string;
  defaultValue: string;
  raw: string;
  width?: string;
  height?: string;
  alt?: string;
  size?: string;
};

export type SectionFieldsPayload = {
  v: 1;
  fields: Record<string, string>;
};

export const META = {
  link: "__link",
  linkTarget: "__link_target",
  linkTitle: "__link_title",
  alt: "__alt",
  fileLabel: "__label",
} as const;

const SINGLE_RE =
  /<singleline(\s[^>]*)?>([\s\S]*?)<\/singleline>/gi;
const MULTI_RE =
  /<multiline(\s[^>]*)?>([\s\S]*?)<\/multiline>/gi;
const IMG_RE =
  /<img\b[^>]*\beditable\s*=\s*["']true["'][^>]*\/?>/gi;
const FILE_RE = /<file(\s[^>]*)?>([\s\S]*?)<\/file>/gi;

function attr(attrs: string | undefined, name: string): string {
  if (!attrs) return "";
  const m = attrs.match(
    new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"),
  );
  return m?.[1] ?? "";
}

function stripTags(html: string) {
  return html.replace(/<[^>]+>/g, "").trim();
}

function makeKey(label: string, type: FieldType, used: Map<string, number>) {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || type;
  const n = (used.get(base) || 0) + 1;
  used.set(base, n);
  return n === 1 ? base : `${base}_${n}`;
}

/** Fix legacy import artifacts (literal r/n for newlines) on section HTML. */
export function normalizeSectionHtml(html: string): string {
  return normalizeInsertHtml(html || "");
}

/** Pretty-print section HTML for the code editor. */
export function formatSectionHtmlForEditor(html: string): string {
  let s = normalizeSectionHtml(html);
  if (!s.trim()) return s;
  if (!s.includes("\n") || s.split("\n").length < 3) {
    s = s.replace(/>\s*</g, ">\n<");
  }
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

/** Strip leftover SimpleXML artifacts from imported field values. */
function cleanFieldValue(value: string): string {
  if (!value) return "";
  let v = value;
  // <?xml ...?><multiline>...</multiline> or similar
  v = v.replace(/<\?xml[^?]*\?>\s*/gi, "");
  v = v.replace(/^<\/?(?:singleline|multiline|file)[^>]*>/i, "");
  v = v.replace(/<\/(?:singleline|multiline|file)>\s*$/i, "");
  // HTML comment wrappers from bad import
  v = v.replace(/^<!--\?xml[\s\S]*?-->/i, "");
  // Multiline HTML may still carry literal n/r from import
  if (/[<>]/.test(v) && /[>\/]\s*[rn]|[rn]\s*</.test(v)) {
    v = normalizeInsertHtml(v);
  }
  return v.trim();
}

export function parseSectionFields(html: string): SectionField[] {
  const fields: SectionField[] = [];
  const used = new Map<string, number>();

  let rest = normalizeSectionHtml(html);
  let guard = 0;
  while (rest && guard++ < 200) {
    SINGLE_RE.lastIndex = 0;
    MULTI_RE.lastIndex = 0;
    IMG_RE.lastIndex = 0;
    FILE_RE.lastIndex = 0;

    const candidates: {
      index: number;
      type: FieldType;
      match: RegExpExecArray;
    }[] = [];

    const s = SINGLE_RE.exec(rest);
    if (s) candidates.push({ index: s.index, type: "singleline", match: s });
    const m = MULTI_RE.exec(rest);
    if (m) candidates.push({ index: m.index, type: "multiline", match: m });
    const i = IMG_RE.exec(rest);
    if (i) candidates.push({ index: i.index, type: "image", match: i });
    const f = FILE_RE.exec(rest);
    if (f) candidates.push({ index: f.index, type: "file", match: f });

    if (!candidates.length) break;
    candidates.sort((a, b) => a.index - b.index);
    const next = candidates[0];
    const full = next.match[0];

    if (next.type === "singleline") {
      const attrs = next.match[1] || "";
      const inner = next.match[2] || "";
      const label = attr(attrs, "name") || "Text";
      fields.push({
        key: makeKey(label, "singleline", used),
        type: "singleline",
        label,
        defaultValue: stripTags(inner),
        raw: full,
      });
    } else if (next.type === "multiline") {
      const attrs = next.match[1] || "";
      const inner = next.match[2] || "";
      const label = attr(attrs, "name") || "Content";
      fields.push({
        key: makeKey(label, "multiline", used),
        type: "multiline",
        label,
        defaultValue: inner.trim(),
        raw: full,
      });
    } else if (next.type === "image") {
      const attrs = full.replace(/^<img\b/i, "").replace(/\/?>$/, "");
      // Original used name=; some templates used label=
      const label =
        attr(attrs, "name") ||
        attr(attrs, "label") ||
        attr(attrs, "alt") ||
        "Image";
      // Prefer explicit dimensions; size="W/H" was MotionCMS crop hint
      const size = attr(attrs, "size") || "";
      const [sizeW, sizeH] = size.includes("/")
        ? size.split("/")
        : [undefined, undefined];
      fields.push({
        key: makeKey(label, "image", used),
        type: "image",
        label,
        defaultValue: attr(attrs, "src") || "",
        raw: full,
        width: attr(attrs, "width") || sizeW || undefined,
        height: attr(attrs, "height") || sizeH || undefined,
        alt: attr(attrs, "alt") || undefined,
        size: size || undefined,
      });
    } else {
      const attrs = next.match[1] || "";
      const inner = next.match[2] || "";
      const label = attr(attrs, "name") || "File";
      fields.push({
        key: makeKey(label, "file", used),
        type: "file",
        label,
        defaultValue: stripTags(inner) || "",
        raw: full,
      });
    }

    rest = rest.slice(next.index + full.length);
  }

  return fields;
}

export function emptyFieldsFromTemplate(html: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const f of parseSectionFields(html)) {
    fields[f.key] = f.defaultValue;
    if (f.type === "image" && f.alt) {
      fields[f.key + META.alt] = f.alt;
    }
  }
  return fields;
}

export function parseStoredContent(
  content: string,
  templateHtml?: string,
): SectionFieldsPayload {
  if (!content || !content.trim()) {
    return {
      v: 1,
      fields: templateHtml ? emptyFieldsFromTemplate(templateHtml) : {},
    };
  }

  try {
    const data = JSON.parse(content);
    if (data && typeof data === "object" && data.v === 1 && data.fields) {
      return { v: 1, fields: { ...data.fields } };
    }
    if (Array.isArray(data) && templateHtml) {
      const defs = parseSectionFields(templateHtml);
      const fields: Record<string, string> =
        emptyFieldsFromTemplate(templateHtml);
      data.forEach((item: { name?: string; value?: string }, idx: number) => {
        if (defs[idx]) fields[defs[idx].key] = String(item?.value ?? "");
      });
      return { v: 1, fields };
    }
    if (data && typeof data === "object" && !Array.isArray(data)) {
      return { v: 1, fields: data as Record<string, string> };
    }
  } catch {
    if (templateHtml) {
      const defs = parseSectionFields(templateHtml);
      const fields = emptyFieldsFromTemplate(templateHtml);
      const multi = defs.find((d) => d.type === "multiline");
      if (multi) fields[multi.key] = content;
      else if (defs[0]) fields[defs[0].key] = content;
      return { v: 1, fields };
    }
  }

  return { v: 1, fields: {} };
}

export function serializeFields(fields: Record<string, string>): string {
  return JSON.stringify({ v: 1, fields });
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(s: string) {
  return escapeHtml(s).replaceAll("'", "&#39;");
}

/**
 * Public (and canvas) render — final HTML as visitors see it.
 */
export function renderSectionHtml(
  templateHtml: string,
  contentJson: string,
  sectionCss?: string,
): string {
  const normalized = normalizeSectionHtml(templateHtml);
  const { fields } = parseStoredContent(contentJson, normalized);
  const defs = parseSectionFields(normalized);
  let html = normalized;

  for (const def of defs) {
    const value = cleanFieldValue(fields[def.key] ?? def.defaultValue ?? "");
    const link = fields[def.key + META.link] || "";
    const linkTarget = fields[def.key + META.linkTarget] || "";
    const linkTitle = fields[def.key + META.linkTitle] || "";
    const alt = cleanFieldValue(
      fields[def.key + META.alt] || def.alt || def.label,
    );

    if (def.type === "singleline") {
      let text = escapeHtml(value);
      if (link) {
        const t = linkTarget ? ` target="${escapeAttr(linkTarget)}"` : "";
        const ti = linkTitle ? ` title="${escapeAttr(linkTitle)}"` : "";
        text = `<a href="${escapeAttr(link)}"${t}${ti}>${text}</a>`;
      }
      html = html.replace(def.raw, text);
    } else if (def.type === "multiline") {
      html = html.replace(def.raw, value || "");
    } else if (def.type === "image") {
      let img = def.raw;
      // If import stored a caption/label instead of a URL, fall back to template src
      const looksLikeSrc =
        !value ||
        /^(https?:\/\/|\/|data:|blob:|\.\/|\.\.\/)/i.test(value) ||
        /\.(jpe?g|png|gif|webp|svg|avif)(\?|#|$)/i.test(value);
      const src = looksLikeSrc ? value || def.defaultValue || "" : def.defaultValue || value || "";
      if (/src\s*=\s*["'][^"']*["']/i.test(img)) {
        img = img.replace(
          /src\s*=\s*["'][^"']*["']/i,
          `src="${escapeAttr(src)}"`,
        );
      } else {
        img = img.replace(/<img/i, `<img src="${escapeAttr(src)}"`);
      }
      if (/alt\s*=\s*["'][^"']*["']/i.test(img)) {
        img = img.replace(
          /alt\s*=\s*["'][^"']*["']/i,
          `alt="${escapeAttr(alt)}"`,
        );
      } else {
        img = img.replace(/<img/i, `<img alt="${escapeAttr(alt)}"`);
      }
      img = img.replace(/\s*editable\s*=\s*["']true["']/i, "");
      img = img.replace(/\s*label\s*=\s*["'][^"']*["']/i, "");
      if (def.width && !/\bwidth\s*=/i.test(img)) {
        img = img.replace(/<img/i, `<img width="${escapeAttr(def.width)}"`);
      }
      if (def.height && !/\bheight\s*=/i.test(img)) {
        img = img.replace(/<img/i, `<img height="${escapeAttr(def.height)}"`);
      }
      if (link) {
        const t = linkTarget ? ` target="${escapeAttr(linkTarget)}"` : "";
        const ti = linkTitle ? ` title="${escapeAttr(linkTitle)}"` : "";
        img = `<a href="${escapeAttr(link)}"${t}${ti}>${img}</a>`;
      }
      html = html.replace(def.raw, img);
    } else if (def.type === "file") {
      const label = cleanFieldValue(
        fields[def.key + META.fileLabel] || def.defaultValue || def.label,
      );
      const href = value || "#";
      html = html.replace(
        def.raw,
        `<a class="cms-file-link" href="${escapeAttr(href)}" download>${escapeHtml(label)}</a>`,
      );
    }
  }

  html = html
    .replace(SINGLE_RE, (_m, _a, inner) => stripTags(inner || ""))
    .replace(MULTI_RE, (_m, _a, inner) => convertBootstrapHtml(inner || ""))
    .replace(FILE_RE, (_m, _a, inner) => stripTags(inner || ""))
    .replace(/\s*editable\s*=\s*["']true["']/gi, "");

  // Bootstrap → Tailwind on the assembled section markup
  html = convertBootstrapHtml(html);

  if (sectionCss?.trim()) {
    html = `<div class="cms-section"><style>${sectionCss}</style>${html}</div>`;
  }

  return html;
}

export type EditorPreviewSection = {
  id: string;
  templateHtml: string;
  content: string;
  css?: string;
  isHidden?: boolean;
  name?: string;
};

/**
 * Full document HTML for the page editor canvas (like original /pages/view iframe).
 * Each section is wrapped so the iframe can postMessage selection to the parent.
 */
export function buildEditorPreviewHtml(opts: {
  shellHtml: string;
  pageTitle: string;
  siteTitle: string;
  metaDescription?: string;
  menuHtml: string;
  sections: EditorPreviewSection[];
  inserts?: { tag: string; content: string }[];
  selectedSectionId?: string | null;
  siteSlug?: string;
  linkPages?: LinkablePage[];
}): string {
  const sectionsHtml = opts.sections
    .map((s, idx) => {
      let body = renderSectionHtml(
        s.templateHtml,
        s.content,
        s.css,
      );
      if (opts.siteSlug && opts.linkPages?.length) {
        body = resolveInternalLinks(body, opts.siteSlug, opts.linkPages);
      }
      const active = opts.selectedSectionId === s.id;
      const hidden = s.isHidden ? " is-hidden" : "";
      const ring = active ? " is-selected" : "";
      const label = escapeAttr(s.name || `Section ${idx + 1}`);
      return `<div class="cms-edit-section${hidden}${ring}" data-section-id="${escapeAttr(s.id)}" data-section-label="${label}" title="Click to edit: ${label}">
  <div class="cms-edit-badge">${idx + 1}. ${escapeHtml(s.name || "Section")}${s.isHidden ? " (hidden)" : ""}</div>
  <div class="cms-edit-body">${body || '<p style="padding:1rem;color:#94a3b8">Empty section</p>'}</div>
</div>`;
    })
    .join("\n");

  let shell = opts.shellHtml || TAILWIND_SHELL || defaultEditorShell();
  // Upgrade legacy Bootstrap shells so the editor matches public output
  if (
    /bootstrap/i.test(shell) ||
    (!shell.includes("tailwindcss") && !shell.includes("{{sections}}"))
  ) {
    shell = TAILWIND_SHELL;
  }
  if (!shell.includes("tailwindcss") && !shell.includes("cdn.tailwindcss.com")) {
    // Inject Tailwind CDN into head if missing
    shell = shell.replace(
      /<\/head>/i,
      `<script src="https://cdn.tailwindcss.com"><\/script></head>`,
    );
  }

  let html = shell
    .replaceAll("{{page.title}}", escapeHtml(opts.pageTitle))
    .replaceAll(
      "{{page.metaDescription}}",
      escapeHtml(opts.metaDescription || ""),
    )
    .replaceAll("{{site.title}}", escapeHtml(opts.siteTitle))
    .replaceAll("{{menu}}", opts.menuHtml || "")
    .replaceAll("{{sections}}", sectionsHtml);

  if (!html.includes(sectionsHtml)) {
    if (html.includes("</main>")) {
      html = html.replace("</main>", `${sectionsHtml}</main>`);
    } else if (html.includes("cms-sections")) {
      html = html.replace(
        /(<div[^>]*cms-sections[^>]*>)/i,
        `$1${sectionsHtml}`,
      );
    } else if (html.includes("</body>")) {
      html = html.replace("</body>", `${sectionsHtml}</body>`);
    } else {
      html += sectionsHtml;
    }
  }

  html = html.replace(/\{\{block:[a-zA-Z0-9_-]+\}\}/g, "");

  const inserts = opts.inserts || [];
  html = html.replace(
    /\{\{insert:([a-zA-Z0-9_\[\]-]+)\}\}/g,
    (_m, tag: string) => {
      const insert = inserts.find((i) => i.tag === tag);
      if (!insert) return "";
      return normalizeInsertHtml(insert.content);
    },
  );

  // Editor chrome + click bridge (mirrors pages.view.view.php CMS_edit_container)
  const bridge = `
<style id="cms-editor-chrome">
  .cms-edit-section {
    position: relative;
    cursor: pointer;
    outline: 2px solid transparent;
    outline-offset: -2px;
    transition: outline-color .15s, opacity .15s;
    min-height: 1.5rem;
  }
  .cms-edit-section:hover {
    outline-color: rgba(37, 99, 235, 0.55);
  }
  .cms-edit-section.is-selected {
    outline-color: #2563eb;
    outline-width: 3px;
    z-index: 2;
  }
  .cms-edit-section.is-hidden {
    opacity: 0.35;
  }
  .cms-edit-section .cms-edit-badge {
    position: absolute;
    top: 6px;
    left: 6px;
    z-index: 20;
    background: rgba(15, 23, 42, 0.9);
    color: #fff;
    font: 600 11px/1.2 system-ui, sans-serif;
    padding: 4px 8px;
    border-radius: 4px;
    opacity: 0;
    pointer-events: none;
    transition: opacity .15s;
    max-width: 70%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cms-edit-section:hover .cms-edit-badge,
  .cms-edit-section.is-selected .cms-edit-badge {
    opacity: 1;
  }
  .cms-edit-body { pointer-events: none; }
  .cms-edit-body img { max-width: 100%; height: auto; }
</style>
<script id="cms-editor-bridge">
(function () {
  function selectSection(id) {
    try {
      window.parent.postMessage({ type: "cms-select-section", sectionId: id }, "*");
    } catch (e) {}
  }
  document.addEventListener("click", function (e) {
    var el = e.target;
    while (el && el !== document && !(el.getAttribute && el.getAttribute("data-section-id"))) {
      el = el.parentNode;
    }
    if (el && el.getAttribute) {
      e.preventDefault();
      e.stopPropagation();
      selectSection(el.getAttribute("data-section-id"));
    }
  }, true);
  // prevent navigation inside preview
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a") : null;
    if (a) { e.preventDefault(); }
  }, true);
})();
</script>`;

  if (html.includes("</body>")) {
    html = html.replace("</body>", `${bridge}</body>`);
  } else {
    html += bridge;
  }

  return html;
}

function defaultEditorShell() {
  // Keep in sync with TAILWIND_SHELL (public) — Tailwind CDN for true page look
  return `<!DOCTYPE html>
<html lang="nl"><head><meta charset="utf-8"/><title>{{page.title}}</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<script src="https://cdn.tailwindcss.com"><\/script>
<style>
  body { font-family: system-ui, sans-serif; }
  .cms-sections img, .cms-edit-body img { max-width: 100%; height: auto; }
  .menu { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.25rem 1.25rem; }
  .submenu { list-style: none; margin: 0.35rem 0 0; padding-left: 0.5rem; border-left: 2px solid #334155; display: flex; flex-direction: column; gap: 0.25rem; }
  .menu a { color: #cbd5e1; text-decoration: none; }
  .single_activiteiten img { width: 100%; display: block; object-fit: cover; }
  .single_activiteiten h5 { margin: 0; padding: 0.75rem 1rem; font-size: 0.95rem; font-weight: 600; }
</style>
</head>
<body class="min-h-screen bg-slate-50 text-slate-900">
<header class="bg-slate-900 text-white">
  <div class="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
    <strong class="text-lg">{{site.title}}</strong>
    <nav class="text-sm">{{menu}}</nav>
  </div>
</header>
<main class="cms-sections mx-auto max-w-6xl px-4 py-8">{{sections}}</main>
</body></html>`;
}

/** @deprecated use renderSectionHtml for canvas (true page look) */
export function renderSectionForEditor(
  templateHtml: string,
  contentJson: string,
  _sectionId: string,
): string {
  return renderSectionHtml(templateHtml, contentJson);
}

export function renderAllSections(
  sections: {
    templateHtml: string;
    content: string;
    css?: string;
    isHidden?: boolean;
  }[],
): string {
  return sections
    .filter((s) => !s.isHidden)
    .map((s) => renderSectionHtml(s.templateHtml, s.content, s.css))
    .join("\n");
}

export const SECTION_LAYOUT_EXAMPLES = {
  title: `<div class="section mb-6">
  <h1 class="text-3xl font-semibold tracking-tight"><singleline name="Title">Page heading</singleline></h1>
</div>`,
  textImage: `<div class="section mb-6 flex flex-wrap items-start gap-6">
  <div class="min-w-[240px] flex-1">
    <h2 class="mb-3 text-2xl font-semibold"><singleline name="Heading">Heading</singleline></h2>
    <multiline name="Body"><p class="leading-relaxed text-slate-700">Write your text here…</p></multiline>
  </div>
  <div class="w-full shrink-0 sm:w-auto">
    <img editable="true" name="Photo" src="" width="365" height="240" alt="Photo" class="h-auto max-w-full rounded-lg shadow-sm" />
  </div>
</div>`,
  threeImages: `<div class="section mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
  <img editable="true" name="Image 1" src="" width="280" height="180" alt="" class="h-auto w-full rounded-lg object-cover" />
  <img editable="true" name="Image 2" src="" width="280" height="180" alt="" class="h-auto w-full rounded-lg object-cover" />
  <img editable="true" name="Image 3" src="" width="280" height="180" alt="" class="h-auto w-full rounded-lg object-cover" />
</div>`,
  fullWidth: `<div class="section mb-6">
  <h2 class="mb-3 text-2xl font-semibold"><singleline name="Title">Section title</singleline></h2>
  <multiline name="Content"><p class="leading-relaxed text-slate-700">Full width content…</p></multiline>
</div>`,
};
