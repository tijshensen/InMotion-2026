/**
 * Section-based page builder (MotionCMS-style).
 *
 * Layout markers (verified against cms/inc/templaternew.inc.php):
 *   <singleline name="…">…</singleline>   + optional link (_link, _link_target, _link_title)
 *   <multiline name="…">…</multiline>     rich HTML
 *   <img editable="true" name="…" src width height alt />
 *       + optional _link, _link_target, _link_title, _alt, _poster
 *       value may be an image, MP4, YouTube, or Vimeo URL
 *       (legacy also used label="…" instead of name)
 *   <file name="…">label</file>           file URL + description
 *
 * Stored as: { "v": 1, "fields": { key: value, key__alt: "…", key__link: "…" } }
 *
 * Editor UX (pages.edit.view.php + pages.view.view.php):
 *   - Main area = full rendered page (iframe)
 *   - Click a block → parent.openSidebar() + field editors from Templater::edit()
 */

import { TAILWIND_SHELL } from "./bootstrap-to-tailwind";
import { normalizeInsertHtml } from "./insert-html";
import { stampLayoutNids } from "./layout-html";
import {
  resolveInternalLinks,
  type LinkablePage,
} from "./internal-links";
import {
  applySiteLogo,
  isFullThemeShell,
  rewriteThemeAssetUrls,
} from "./theme";
import { detectVideoSource, isLikelyMediaSrc } from "./video-media";

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

export type RepeatGroupDef = {
  key: string;
  itemHtml: string;
  label?: string;
};

export type RepeatItemRender = {
  groupKey: string;
  content: string;
  isHidden?: boolean;
};

export type SectionFieldsPayload = {
  v: 1;
  fields: Record<string, string>;
  /** Page-instance Tailwind/HTML layout (class strings live on elements). */
  layoutHtml?: string;
  /** Templates for {{repeat:key}} slots inside layoutHtml. */
  repeatGroups?: RepeatGroupDef[];
};

export const META = {
  link: "__link",
  linkTarget: "__link_target",
  linkTitle: "__link_title",
  alt: "__alt",
  fileLabel: "__label",
  poster: "__poster",
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
      // MotionCMS crop frame is size="W/H" (the img holder). Fall back to width/height.
      const size = attr(attrs, "size") || "";
      const [sizeW, sizeH] = size.includes("/")
        ? size.split("/")
        : [undefined, undefined];
      const rawW = sizeW || attr(attrs, "width") || "";
      const rawH = sizeH || attr(attrs, "height") || "";
      const width = rawW.replace(/px$/i, "").trim() || undefined;
      const height = rawH.replace(/px$/i, "").trim() || undefined;
      fields.push({
        key: makeKey(label, "image", used),
        type: "image",
        label,
        defaultValue: attr(attrs, "src") || "",
        raw: full,
        width,
        height,
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
      return {
        v: 1,
        fields: { ...data.fields },
        ...(typeof data.layoutHtml === "string" && data.layoutHtml
          ? { layoutHtml: data.layoutHtml }
          : {}),
        ...(Array.isArray(data.repeatGroups) && data.repeatGroups.length
          ? { repeatGroups: data.repeatGroups as RepeatGroupDef[] }
          : {}),
      };
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
  return serializeContent({ fields });
}

/** Merge a patch into stored section JSON without dropping layout/repeats. */
export function rewriteStoredContent(
  content: string,
  templateHtml: string,
  patch: Partial<
    Pick<SectionFieldsPayload, "fields" | "layoutHtml" | "repeatGroups">
  >,
): string {
  const parsed = parseStoredContent(content, templateHtml);
  return serializeContent({
    fields: patch.fields ?? parsed.fields,
    layoutHtml:
      patch.layoutHtml !== undefined ? patch.layoutHtml : parsed.layoutHtml,
    repeatGroups:
      patch.repeatGroups !== undefined
        ? patch.repeatGroups
        : parsed.repeatGroups,
  });
}

export function serializeContent(payload: {
  fields: Record<string, string>;
  layoutHtml?: string;
  repeatGroups?: RepeatGroupDef[];
}): string {
  const out: SectionFieldsPayload = { v: 1, fields: payload.fields };
  if (payload.layoutHtml?.trim()) out.layoutHtml = payload.layoutHtml;
  if (payload.repeatGroups?.length) out.repeatGroups = payload.repeatGroups;
  return JSON.stringify(out);
}

export function resolveSectionTemplate(
  templateHtml: string,
  contentJson: string,
): string {
  const parsed = parseStoredContent(contentJson, templateHtml);
  return parsed.layoutHtml?.trim() || templateHtml;
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

function presentationalAttrs(
  rawImg: string,
  def: SectionField,
  extraClass: string,
): string {
  const attrs = rawImg.replace(/^<img\b/i, "").replace(/\/?>$/, "");
  const existingClass = attr(attrs, "class");
  const cls = [extraClass, existingClass].filter(Boolean).join(" ");
  let out = cls ? ` class="${escapeAttr(cls)}"` : "";
  for (const name of ["id", "style", "data-cms-nid"] as const) {
    const v = attr(attrs, name);
    if (v) out += ` ${name}="${escapeAttr(v)}"`;
  }
  const width = def.width || attr(attrs, "width");
  const height = def.height || attr(attrs, "height");
  if (width) out += ` width="${escapeAttr(width)}"`;
  if (height) out += ` height="${escapeAttr(height)}"`;
  return out;
}

function renderImageOrVideoTag(
  def: SectionField,
  src: string,
  alt: string,
  poster: string,
): string {
  const video = detectVideoSource(src);

  if (video?.kind === "youtube" || video?.kind === "vimeo") {
    const embed = video.embedUrl || src;
    const extra = presentationalAttrs(def.raw, def, "cms-video-frame");
    return `<iframe${extra} src="${escapeAttr(embed)}" title="${escapeAttr(alt || def.label)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  }

  if (video?.kind === "file") {
    const extra = presentationalAttrs(def.raw, def, "cms-video");
    const posterAttr = poster ? ` poster="${escapeAttr(poster)}"` : "";
    return `<video${extra} controls playsinline preload="metadata"${posterAttr}><source src="${escapeAttr(src)}" type="video/mp4" /></video>`;
  }

  let img = def.raw;
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
  return img;
}

export function expandRepeatTokens(
  html: string,
  groups: RepeatGroupDef[] | undefined,
  items: RepeatItemRender[] = [],
): string {
  if (!html || !groups?.length) return html;
  return html.replace(/\{\{repeat:([a-z0-9_-]+)\}\}/gi, (_m, key: string) => {
    const group = groups.find((g) => g.key === key);
    if (!group?.itemHtml) return "";
    return items
      .filter((it) => it.groupKey === key && !it.isHidden)
      .map((it) =>
        renderSectionHtml(group.itemHtml, it.content, undefined, {
          skipRepeats: true,
        }),
      )
      .join("\n");
  });
}

/**
 * Public (and canvas) render — final HTML as visitors see it.
 */
export function renderSectionHtml(
  templateHtml: string,
  contentJson: string,
  sectionCss?: string,
  opts?: {
    keepNids?: boolean;
    repeatItems?: RepeatItemRender[];
    skipRepeats?: boolean;
  },
): string {
  const normalized = normalizeSectionHtml(templateHtml);
  const parsed = parseStoredContent(contentJson, normalized);
  const { fields } = parsed;
  let source = normalizeSectionHtml(parsed.layoutHtml || normalized);
  if (!opts?.skipRepeats) {
    source = expandRepeatTokens(
      source,
      parsed.repeatGroups,
      opts?.repeatItems || [],
    );
  }
  if (opts?.keepNids) source = stampLayoutNids(source);
  const defs = parseSectionFields(source);
  let html = source;

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
      const poster = cleanFieldValue(fields[def.key + META.poster] || "");
      // Empty / placeholder junk from legacy imports
      const empty =
        !value ||
        value === "." ||
        value === "#" ||
        value === "null" ||
        value === "undefined";
      // If import stored a caption/label instead of a URL, fall back to template src
      const looksLikeSrc = empty || isLikelyMediaSrc(value);
      const src = empty
        ? def.defaultValue || ""
        : looksLikeSrc
          ? value
          : def.defaultValue || value || "";
      let media = renderImageOrVideoTag(def, src, alt, poster);
      if (link && !detectVideoSource(src)) {
        const t = linkTarget ? ` target="${escapeAttr(linkTarget)}"` : "";
        const ti = linkTitle ? ` title="${escapeAttr(linkTitle)}"` : "";
        media = `<a href="${escapeAttr(link)}"${t}${ti}>${media}</a>`;
      }
      html = html.replace(def.raw, media);
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
    .replace(MULTI_RE, (_m, _a, inner) => inner || "")
    .replace(FILE_RE, (_m, _a, inner) => stripTags(inner || ""))
    .replace(/\s*editable\s*=\s*["']true["']/gi, "");

  // Do NOT auto-convert Bootstrap→Tailwind here — framework is per-site.
  // Bootstrap sites (e.g. Kiekeboe) keep col-md-*, container, navbar, etc.

  if (sectionCss?.trim()) {
    html = `<div class="cms-section"><style>${sectionCss}</style>${html}</div>`;
  }

  if (!opts?.keepNids) {
    html = html.replace(/\s*data-cms-nid=(["'])[^"']*\1/gi, "");
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
  repeatItems?: RepeatItemRender[];
};

/**
 * Root-relative URLs (/uploads/…, /theme/…) break or resolve oddly inside
 * srcDoc iframes (base is about:srcdoc). Make them absolute for the editor canvas.
 */
export function absolutizeRootUrls(html: string, origin: string): string {
  if (!html || !origin) return html;
  const o = origin.replace(/\/$/, "");
  return html
    .replace(/(src|href)=(["'])\/(?!\/)/gi, `$1=$2${o}/`)
    .replace(/url\(\s*(['"]?)\/(?!\/)/gi, `url($1${o}/`);
}

/**
 * Render a section for the live editor canvas (absolute media URLs optional).
 */
export function renderSectionHtmlForEditor(
  templateHtml: string,
  contentJson: string,
  sectionCss?: string,
  opts?: {
    siteSlug?: string;
    linkPages?: LinkablePage[];
    origin?: string;
    repeatItems?: RepeatItemRender[];
  },
): string {
  let body = renderSectionHtml(templateHtml, contentJson, sectionCss, {
    keepNids: true,
    repeatItems: opts?.repeatItems,
  });
  if (opts?.siteSlug && opts.linkPages?.length) {
    body = resolveInternalLinks(body, opts.siteSlug, opts.linkPages);
  }
  if (opts?.origin) {
    body = absolutizeRootUrls(body, opts.origin);
  }
  return body;
}

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
  logoPath?: string;
  linkPages?: LinkablePage[];
  /** window.location.origin — required so /uploads images load in srcDoc */
  origin?: string;
}): string {
  const origin = opts.origin || "";
  const sectionsHtml = opts.sections
    .map((s, idx) => {
      const body = renderSectionHtmlForEditor(
        s.templateHtml,
        s.content,
        s.css,
        {
          siteSlug: opts.siteSlug,
          linkPages: opts.linkPages,
          origin,
          repeatItems: s.repeatItems,
        },
      );
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

  // Keep full site themes (Bootstrap/custom) as-is so the builder matches live CSS
  let shell = (opts.shellHtml || "").trim() || TAILWIND_SHELL || defaultEditorShell();
  const fullTheme = isFullThemeShell(shell);
  if (!fullTheme && !shell.includes("{{sections}}") && shell.length < 500) {
    shell = TAILWIND_SHELL;
  }
  // Only inject Tailwind CDN for Tailwind/minimal shells — never for full Bootstrap themes
  if (
    !fullTheme &&
    !shell.includes("cdn.tailwindcss.com") &&
    !shell.includes("kiekeboe.css")
  ) {
    shell = shell.replace(
      /<\/head>/i,
      `<script src="https://cdn.tailwindcss.com"><\/script></head>`,
    );
  }

  shell = rewriteThemeAssetUrls(shell, opts.siteSlug || "kiekeboe");
  shell = applySiteLogo(shell, opts.logoPath, opts.siteSlug);
  if (origin) {
    shell = absolutizeRootUrls(shell, origin);
  }

  // Ensure root-relative assets resolve inside srcDoc (about:srcdoc has no host)
  if (origin && !/<base\s/i.test(shell)) {
    const baseTag = `<base href="${escapeAttr(origin.endsWith("/") ? origin : origin + "/")}" />`;
    if (/<head[^>]*>/i.test(shell)) {
      shell = shell.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
    } else {
      shell = baseTag + shell;
    }
  }

  let html = shell
    .replaceAll("{{page.title}}", escapeHtml(opts.pageTitle))
    .replaceAll(
      "{{page.metaDescription}}",
      escapeHtml(opts.metaDescription || ""),
    )
    .replaceAll("{{site.title}}", escapeHtml(opts.siteTitle))
    .replaceAll("{{site.slug}}", escapeHtml(opts.siteSlug || ""))
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
  .cms-edit-section.is-delete-pending {
    opacity: 1 !important;
    z-index: 8;
  }
  .cms-edit-delete-mask {
    position: absolute;
    inset: 0;
    z-index: 40;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(15, 23, 42, 0.62);
    pointer-events: auto;
  }
  .cms-edit-delete-card {
    text-align: center;
    color: #fff;
    font: 500 13px/1.45 system-ui, sans-serif;
    padding: 1rem 1.25rem;
    max-width: 90%;
  }
  .cms-edit-delete-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
    margin-top: 0.75rem;
  }
  .cms-edit-delete-actions button {
    border-radius: 0.5rem;
    padding: 0.4rem 0.9rem;
    font: 600 12px/1 system-ui, sans-serif;
    cursor: pointer;
  }
  .cms-edit-delete-cancel {
    border: 1px solid rgba(255,255,255,0.4);
    background: transparent;
    color: #fff;
  }
  .cms-edit-delete-confirm {
    border: 0;
    background: #dc2626;
    color: #fff;
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
  html[data-cms-mode="layout"] .cms-edit-body { pointer-events: auto; }
  html[data-cms-mode="layout"] .cms-edit-section { cursor: default; }
  html[data-cms-mode="view"] .cms-edit-body { pointer-events: auto; }
  html[data-cms-mode="view"] .cms-edit-section {
    cursor: default;
    outline: none !important;
  }
  html[data-cms-mode="view"] .cms-edit-section:hover,
  html[data-cms-mode="view"] .cms-edit-section.is-selected {
    outline: none !important;
  }
  html[data-cms-mode="view"] .cms-edit-badge { display: none !important; }
  html[data-cms-mode="layout"] .cms-edit-body [data-cms-nid]:hover {
    outline: 1px dashed #60a5fa;
    outline-offset: 1px;
  }
  html[data-cms-mode="layout"] .cms-edit-body .is-layout-selected {
    outline: 2px solid #2563eb !important;
    outline-offset: 2px;
  }
  .cms-edit-body img {
    max-width: 100%;
    height: auto;
    /* Bootstrap visible-xs / hidden-* hide images on desktop; show them in the editor */
    display: inline-block !important;
    visibility: visible !important;
    opacity: 1 !important;
  }
  .cms-edit-body video.cms-video,
  .cms-sections video.cms-video {
    max-width: 100%;
    height: auto;
    display: block;
  }
  .cms-edit-body iframe.cms-video-frame,
  .cms-sections iframe.cms-video-frame {
    max-width: 100%;
    width: 100%;
    aspect-ratio: 16 / 9;
    border: 0;
    display: block;
  }
  html[data-cms-mode="layout"] .cms-edit-body iframe.cms-video-frame,
  html[data-cms-mode="layout"] .cms-edit-body video.cms-video {
    pointer-events: none;
  }
  .cms-edit-body .hidden,
  .cms-edit-body .hidden-xs,
  .cms-edit-body .hidden-sm,
  .cms-edit-body .hidden-md,
  .cms-edit-body .hidden-lg,
  .cms-edit-body .visible-xs,
  .cms-edit-body .visible-sm,
  .cms-edit-body .visible-md,
  .cms-edit-body .visible-lg {
    /* Keep layout wrappers usable when they only exist for responsive breakpoints */
  }
  .cms-edit-body img.visible-xs,
  .cms-edit-body img.visible-sm,
  .cms-edit-body img.hidden-sm,
  .cms-edit-body img.hidden-md,
  .cms-edit-body img.hidden-lg,
  .cms-edit-body img.hidden-xs {
    display: inline-block !important;
    visibility: visible !important;
  }
</style>
<script id="cms-editor-bridge">
(function () {
  function selectSection(id) {
    // Highlight immediately in-iframe so parent does not need to rewrite srcDoc
    // (rewriting reloaded the document and caused scroll jump to top).
    try {
      var all = document.querySelectorAll(".cms-edit-section.is-selected");
      for (var i = 0; i < all.length; i++) all[i].classList.remove("is-selected");
      var target = document.querySelector('.cms-edit-section[data-section-id="' + id.replace(/"/g, '') + '"]');
      if (target) target.classList.add("is-selected");
    } catch (e) {}
    try {
      window.parent.postMessage({ type: "cms-select-section", sectionId: id }, "*");
    } catch (e) {}
  }
  document.addEventListener("click", function (e) {
    var mode = document.documentElement.getAttribute("data-cms-mode") || "content";
    if (e.target && e.target.closest && e.target.closest(".cms-edit-delete-mask")) {
      return;
    }
    if (mode === "view") {
      var link = e.target && e.target.closest ? e.target.closest("a") : null;
      if (link) {
        var href = link.getAttribute("href") || "";
        var cmsRef = href.indexOf("#internalURI") === 0 || href.indexOf("#page:") === 0;
        var inPageHash = href.charAt(0) === "#" && !cmsRef;
        var stay = !href || href === "#" || inPageHash || href.indexOf("javascript:") === 0;
        if (!stay || cmsRef) {
          e.preventDefault();
          e.stopPropagation();
          try {
            window.parent.postMessage({
              type: "cms-view-navigate",
              href: href,
              resolved: link.href || ""
            }, "*");
          } catch (err) {}
        }
      }
      return;
    }
    if (mode === "layout") {
      e.preventDefault();
      e.stopPropagation();
      var hit = e.target;
      if (!hit || !hit.closest) return;
      var section = hit.closest(".cms-edit-section");
      var body = hit.closest(".cms-edit-body");
      if (!section || !body) return;
      if (hit === body || hit.classList && hit.classList.contains("cms-edit-badge")) {
        hit = body.querySelector("[data-cms-nid]") || body.firstElementChild || hit;
      }
      var node = hit.closest ? hit.closest("[data-cms-nid]") : hit;
      if (!node || !body.contains(node)) {
        node = body.querySelector("[data-cms-nid]");
      }
      if (!node) return;
      var all = document.querySelectorAll(".is-layout-selected");
      for (var i = 0; i < all.length; i++) all[i].classList.remove("is-layout-selected");
      node.classList.add("is-layout-selected");
      var parent = node.parentElement;
      while (parent && parent !== body && !parent.getAttribute("data-cms-nid")) {
        parent = parent.parentElement;
      }
      function box(el) {
        if (!el) return null;
        var cs = window.getComputedStyle(el);
        return {
          display: cs.display,
          padding: cs.padding,
          margin: cs.margin,
          fontSize: cs.fontSize,
          fontWeight: cs.fontWeight,
          lineHeight: cs.lineHeight,
          color: cs.color,
          backgroundColor: cs.backgroundColor,
          textAlign: cs.textAlign,
          borderRadius: cs.borderRadius,
          boxShadow: cs.boxShadow === "none" ? "" : cs.boxShadow
        };
      }
      var cls = (node.getAttribute("class") || "").replace(/\\bis-layout-selected\\b/g, "").trim();
      try {
        window.parent.postMessage({
          type: "cms-select-element",
          sectionId: section.getAttribute("data-section-id"),
          nid: node.getAttribute("data-cms-nid"),
          tag: node.tagName.toLowerCase(),
          className: cls,
          parentNid: parent && parent.getAttribute ? parent.getAttribute("data-cms-nid") : null,
          computed: box(node),
          parentComputed: box(parent && parent !== body ? parent : null)
        }, "*");
      } catch (err) {}
      return;
    }
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
  // prevent navigation inside preview (View mode handles its own links)
  document.addEventListener("click", function (e) {
    var mode = document.documentElement.getAttribute("data-cms-mode") || "content";
    if (mode === "view") return;
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
  .cms-sections video.cms-video, .cms-edit-body video.cms-video { max-width: 100%; height: auto; display: block; }
  .cms-sections iframe.cms-video-frame, .cms-edit-body iframe.cms-video-frame { max-width: 100%; width: 100%; aspect-ratio: 16 / 9; border: 0; display: block; }
  .single_activiteiten img { width: 100%; display: block; object-fit: cover; }
  .single_activiteiten h5 { margin: 0; padding: 0.75rem 1rem; font-size: 0.95rem; font-weight: 600; }
  .cms-nav .cms-menu, .cms-nav .cms-submenu { list-style: none; margin: 0; padding: 0; }
  .cms-nav-panel.cms-nav-open { display: block !important; }
  @media (min-width: 768px) {
    .cms-nav-panel { display: block !important; }
    .cms-nav .cms-submenu-toggle { display: none !important; }
  }
</style>
</head>
<body class="min-h-screen bg-slate-50 text-slate-900">
<header class="bg-slate-900 text-white shadow">
  <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:py-4">
    <strong class="text-lg font-semibold tracking-tight">{{site.title}}</strong>
    {{menu}}
  </div>
</header>
<main class="cms-sections mx-auto max-w-6xl px-4 py-8">{{sections}}</main>
</body></html>`;
}

/** @deprecated use renderSectionHtml / renderSectionHtmlForEditor */
export function renderSectionForEditor(
  templateHtml: string,
  contentJson: string,
  sectionId?: string,
): string {
  void sectionId;
  return renderSectionHtml(templateHtml, contentJson);
}

export function renderAllSections(
  sections: {
    templateHtml: string;
    content: string;
    css?: string;
    isHidden?: boolean;
    repeatItems?: RepeatItemRender[];
  }[],
): string {
  return sections
    .filter((s) => !s.isHidden)
    .map((s) =>
      renderSectionHtml(s.templateHtml, s.content, s.css, {
        repeatItems: s.repeatItems,
      }),
    )
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
