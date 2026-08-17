/**
 * Convert Bootstrap 3 class names (and related patterns) to Tailwind CSS utilities.
 * Used for legacy MotionCMS section/insert HTML.
 */

const COL_FRACTION: Record<string, string> = {
  "1": "1/12",
  "2": "1/6",
  "3": "1/4",
  "4": "1/3",
  "5": "5/12",
  "6": "1/2",
  "7": "7/12",
  "8": "2/3",
  "9": "3/4",
  "10": "5/6",
  "11": "11/12",
  "12": "full",
};

const EXACT: Record<string, string> = {
  // Layout
  container: "mx-auto w-full max-w-6xl px-4",
  "container-fluid": "mx-auto w-full px-4",
  row: "flex flex-wrap -mx-2",
  clearfix: "clear-both",
  "center-block": "mx-auto block",
  "pull-left": "float-left",
  "pull-right": "float-right",
  "text-left": "text-left",
  "text-center": "text-center",
  "text-right": "text-right",
  "text-justify": "text-justify",
  "text-muted": "text-slate-500",
  "text-primary": "text-blue-600",
  "text-success": "text-green-600",
  "text-info": "text-sky-600",
  "text-warning": "text-amber-600",
  "text-danger": "text-red-600",
  lead: "text-xl text-slate-600 leading-relaxed",
  "img-responsive": "max-w-full h-auto",
  "img-rounded": "rounded-lg",
  "img-circle": "rounded-full",
  "img-thumbnail": "rounded border border-slate-200 p-1 max-w-full h-auto",
  thumbnail: "block rounded border border-slate-200 p-1",
  // Visibility (BS3)
  "hidden-xs": "hidden sm:block",
  "hidden-sm": "sm:hidden md:block",
  "hidden-md": "md:hidden lg:block",
  "hidden-lg": "lg:hidden",
  "visible-xs": "block sm:hidden",
  "visible-sm": "hidden sm:block md:hidden",
  "visible-md": "hidden md:block lg:hidden",
  "visible-lg": "hidden lg:block",
  "sr-only": "sr-only",
  // Media object
  media: "flex gap-4 items-start",
  "media-body": "flex-1 min-w-0",
  "media-object": "shrink-0 max-w-full h-auto",
  "media-heading": "mt-0 mb-2 text-xl font-semibold",
  "media-left": "shrink-0 pr-4",
  "media-right": "shrink-0 pl-4",
  "media-middle": "self-center",
  "media-top": "self-start",
  "media-bottom": "self-end",
  // Forms
  "form-group": "mb-4",
  "form-control":
    "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30",
  "form-horizontal": "space-y-4",
  "control-label": "mb-1 block text-sm font-medium text-slate-700",
  "help-block": "mt-1 text-sm text-slate-500",
  checkbox: "flex items-center gap-2",
  radio: "flex items-center gap-2",
  // Buttons
  btn: "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors",
  "btn-primary": "bg-blue-600 text-white hover:bg-blue-700",
  "btn-default":
    "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
  "btn-success": "bg-green-600 text-white hover:bg-green-700",
  "btn-info": "bg-sky-600 text-white hover:bg-sky-700",
  "btn-warning": "bg-amber-500 text-white hover:bg-amber-600",
  "btn-danger": "bg-red-600 text-white hover:bg-red-700",
  "btn-link": "bg-transparent text-blue-600 underline hover:text-blue-800",
  "btn-lg": "px-5 py-2.5 text-base",
  "btn-sm": "px-3 py-1.5 text-xs",
  "btn-xs": "px-2 py-1 text-xs",
  "btn-block": "w-full",
  // Nav / navbar remnants
  navbar: "flex flex-wrap items-center gap-3",
  "navbar-form": "flex flex-wrap items-center gap-2",
  "navbar-right": "ml-auto",
  "navbar-left": "mr-auto",
  "nav": "flex flex-wrap gap-2 list-none p-0 m-0",
  "nav-tabs": "flex flex-wrap gap-1 border-b border-slate-200 list-none p-0 m-0",
  "nav-pills": "flex flex-wrap gap-2 list-none p-0 m-0",
  // Panels / wells
  well: "rounded-lg bg-slate-100 p-4",
  panel: "rounded-lg border border-slate-200 bg-white shadow-sm",
  "panel-body": "p-4",
  "panel-heading": "border-b border-slate-200 px-4 py-3 font-medium",
  "panel-footer": "border-t border-slate-200 px-4 py-3",
  // Carousel → scroll-snap strip (no Bootstrap JS)
  // Note: bare class "item" is NOT mapped here — legacy content cards also use it
  // (e.g. "item single_hw"). Carousel slides are handled structurally in convertBootstrapHtml.
  carousel: "relative w-full",
  slide: "",
  "carousel-inner":
    "flex w-full snap-x snap-mandatory overflow-x-auto scroll-smooth",
  "carousel-caption":
    "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 text-white sm:p-6",
  "carousel-control":
    "absolute top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60",
  left: "left-2",
  right: "right-2",
  "carousel-indicators":
    "absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-2 list-none p-0 m-0",
  "icon-prev": "text-xl leading-none",
  "icon-next": "text-xl leading-none",
  // Glyphicons / FA → utility (icons rendered as text elsewhere if needed)
  glyphicon: "inline-block",
  "glyphicon-chevron-left": "before:content-['‹'] text-2xl",
  "glyphicon-chevron-right": "before:content-['›'] text-2xl",
  fa: "inline-block",
  "fa-star": "text-amber-400",
  "fa-search": "",
  "fa-file-pdf-o": "text-red-600",
  "fa-3x": "text-3xl",
  // Common BS utilities that collide less
  close: "float-right text-xl leading-none opacity-70 hover:opacity-100",
  caret: "inline-block",
  badge: "inline-block rounded-full bg-slate-700 px-2 py-0.5 text-xs text-white",
  label: "inline-block rounded px-1.5 py-0.5 text-xs font-medium",
  "label-default": "bg-slate-500 text-white",
  "label-primary": "bg-blue-600 text-white",
  "label-success": "bg-green-600 text-white",
  "label-info": "bg-sky-600 text-white",
  "label-warning": "bg-amber-500 text-white",
  "label-danger": "bg-red-600 text-white",
  // Site helpers that used BS spacing names
  "fullwidth": "w-full",
};

/** Semantic site classes we keep but enhance with Tailwind. */
const ENHANCE: Record<string, string> = {
  "section-carousel": "mb-6 w-full",
  "items-container": "gap-y-4",
  single_hw:
    "h-full rounded-xl border border-slate-200 bg-white p-5 shadow-sm",
  single_activiteiten:
    "overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm",
  single_blue:
    "rounded-xl bg-sky-700 p-6 text-white shadow-md",
  "media-wrapper": "shrink-0 overflow-hidden rounded-lg",
  "media-visie": "",
  "media-werkwijze": "",
  "media-object": "max-w-full h-auto rounded-lg",
  activiteiten_area: "py-8",
  risico_area: "py-6",
  kiekeboe: "",
  bso: "",
  kinderopvang: "",
  "section-drie-afbeeldingen": "py-4",
  "section-afbeelding-rechts": "py-4",
  "section-afbeelding-links": "py-4",
  "section-oudercommissie": "py-4",
  "section-traktaties": "py-4",
  "section-pdf": "py-4",
  "average_rating_box": "rounded-xl border border-slate-200 bg-white p-4",
  "big_star_box": "text-center",
  "star_wrap": "inline-flex gap-0.5 text-amber-400",
  "rating_box_star_label": "text-sm text-slate-500",
  "rating_box_stars": "text-amber-400",
  "rating_box_average": "text-2xl font-semibold",
  "rating_box_total": "text-sm text-slate-500",
  block_music: "rounded-xl border border-slate-200 p-4",
  "block-music": "rounded-xl border border-slate-200 p-4",
  liedje: "space-y-2",
  pdf: "inline-flex items-center gap-2 text-red-700",
  fotoalbum: "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4",
  embed: "aspect-video w-full overflow-hidden rounded-lg",
  kunstwerken: "grid gap-4 sm:grid-cols-2 md:grid-cols-3",
  content: "",
  section: "mb-6",
  footer: "",
  img: "max-w-full h-auto",
};

function mapColClass(token: string): string | null {
  // col-md-4, col-sm-6, col-xs-12, col-lg-3, col-4
  const m = token.match(/^col-(?:(xs|sm|md|lg|xl)-)?(\d{1,2})$/);
  if (!m) return null;
  const bp = m[1] || "xs";
  const n = m[2];
  const frac = COL_FRACTION[n];
  if (!frac) return null;
  // Always add horizontal padding for former grid gutters
  const pad = "px-2";
  // BS3: columns are full-width below their breakpoint
  if (bp === "xs") {
    return frac === "full" ? `w-full ${pad}` : `w-${frac} ${pad}`;
  }
  const prefix =
    bp === "sm" ? "sm:" : bp === "md" ? "md:" : bp === "lg" ? "lg:" : "xl:";
  const atBp = frac === "full" ? `${prefix}w-full` : `${prefix}w-${frac}`;
  return `w-full ${atBp} ${pad}`;
}

function mapOffsetClass(token: string): string | null {
  // col-sm-offset-4
  const m = token.match(/^col-(?:(xs|sm|md|lg|xl)-)?offset-(\d{1,2})$/);
  if (!m) return null;
  const bp = m[1] || "xs";
  const n = m[2];
  const frac = COL_FRACTION[n];
  if (!frac || frac === "full") return null;
  const ml = `ml-${frac}`;
  if (bp === "xs") return ml;
  const prefix = bp === "sm" ? "sm:" : bp === "md" ? "md:" : bp === "lg" ? "lg:" : "xl:";
  return `${prefix}${ml}`;
}

function mapVisibleBlock(token: string): string | null {
  // visible-xs-block, visible-sm-inline, etc.
  const m = token.match(
    /^visible-(xs|sm|md|lg)-(block|inline|inline-block)$/,
  );
  if (!m) return null;
  const bp = m[1];
  const display = m[2] === "inline-block" ? "inline-block" : m[2];
  // hide by default, show at breakpoint
  if (bp === "xs") return display;
  const prefix = bp === "sm" ? "sm:" : bp === "md" ? "md:" : "lg:";
  return `hidden ${prefix}${display}`;
}

/** Map a single class token to zero or more Tailwind tokens. */
export function mapBootstrapClass(token: string): string[] {
  if (!token) return [];

  // Already looks like Tailwind — keep
  if (
    /^(sm:|md:|lg:|xl:|2xl:|hover:|focus:|dark:)/.test(token) ||
    /^(flex|grid|gap-|p-|px-|py-|m-|mx-|my-|mt-|mb-|ml-|mr-|w-|h-|max-|min-|rounded|shadow|bg-|text-|border|items-|justify-|space-|overflow|relative|absolute|inset|top-|left-|right-|bottom-|z-|sr-only|snap-|scroll|min-w-|shrink|grow)/.test(
      token,
    )
  ) {
    // but still map if it's an exact BS match we want to expand
    if (!EXACT[token] && !ENHANCE[token] && !token.startsWith("col-")) {
      return [token];
    }
  }

  const offset = mapOffsetClass(token);
  if (offset) return offset.split(/\s+/);

  const col = mapColClass(token);
  if (col) return col.split(/\s+/).filter(Boolean);

  const vis = mapVisibleBlock(token);
  if (vis) return vis.split(/\s+/);

  if (EXACT[token] !== undefined) {
    return EXACT[token] ? EXACT[token].split(/\s+/).filter(Boolean) : [];
  }

  if (ENHANCE[token] !== undefined) {
    const base = ENHANCE[token] ? ENHANCE[token].split(/\s+/).filter(Boolean) : [];
    // Keep original semantic class for any custom CSS hooks
    return [token, ...base];
  }

  // Unknown — keep (site-specific or custom)
  return [token];
}

export function convertClassString(classAttr: string): string {
  const tokens = classAttr.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();

  // If any col-* present, ensure parent-friendly width behavior is on children
  for (const t of tokens) {
    for (const m of mapBootstrapClass(t)) {
      if (!m || seen.has(m)) continue;
      seen.add(m);
      out.push(m);
    }
  }

  return out.join(" ");
}

/**
 * Replace class="…" / class='…' attributes in HTML.
 * Also strips Bootstrap CSS/JS CDN links.
 */
export function convertBootstrapHtml(html: string): string {
  if (!html) return html;
  let s = html;

  // Remove Bootstrap CDN stylesheets / scripts
  s = s.replace(
    /<link[^>]+bootstrap[^>]*>/gi,
    "<!-- bootstrap removed; using Tailwind -->",
  );
  s = s.replace(/<script[^>]+bootstrap[^>]*><\/script>/gi, "");
  s = s.replace(/<script[^>]+bootstrap[^>]*\/>/gi, "");

  // class="..." and class='...'
  s = s.replace(
    /\bclass\s*=\s*(["'])([\s\S]*?)\1/gi,
    (_m, q: string, classes: string) => {
      const next = convertClassString(classes);
      if (!next) return "";
      return `class=${q}${next}${q}`;
    },
  );

  // data-ride="carousel" no longer needed
  s = s.replace(/\s*data-ride\s*=\s*["']carousel["']/gi, "");

  // Repair mistaken carousel utilities on content cards (class="item single_hw")
  // and strip bare BS "item"/"active" outside carousels
  s = s.replace(/\bclass=(["'])([^"']*)\1/gi, (_m, q: string, cls: string) => {
    let next = cls;
    // Content cards that wrongly received slide utilities
    if (/\bsingle_hw\b|\bsingle_activiteiten\b|\bsingle_blue\b/.test(next)) {
      next = next
        .replace(/\bmin-w-full\b/g, "")
        .replace(/\bshrink-0\b/g, "")
        .replace(/\bsnap-center\b/g, "")
        .replace(/\bsnap-x\b/g, "")
        .replace(/\bsnap-mandatory\b/g, "");
      // Only strip bare relative/w-full left over from the old item→slide mapping
      // when the card is not intentionally full-bleed
      if (/\bsingle_hw\b/.test(next)) {
        next = next.replace(/\brelative\b/g, "");
      }
    }
    // Drop legacy BS carousel item markers (styling via .carousel-inner > * CSS)
    if (!/\bcarousel-inner\b/.test(next)) {
      next = next.replace(/\bitem\b/g, "").replace(/\bactive\b/g, "");
    }
    next = next.replace(/\s+/g, " ").trim();
    return next ? `class=${q}${next}${q}` : "";
  });

  // Empty class attributes
  s = s.replace(/\sclass=(["'])\1/g, "");

  return s;
}

/** Tailwind-ready public page shell (no Bootstrap). */
export const TAILWIND_SHELL = `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{{page.title}} — {{site.title}}</title>
  <meta name="description" content="{{page.metaDescription}}" />
  <script src="https://cdn.tailwindcss.com/3.4.17"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            brand: { DEFAULT: '#0f172a', light: '#1e293b' }
          }
        }
      }
    }
  </script>
  <style type="text/css">
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
    .cms-sections img, .cms-section img { height: auto; }
    .cms-sections img:not([class*="max-w-"]), .cms-section img:not([class*="max-w-"]) { max-width: 100%; }
    .cms-sections video.cms-video, .cms-section video.cms-video { max-width: 100%; height: auto; display: block; }
    .cms-sections iframe.cms-video-frame, .cms-section iframe.cms-video-frame { max-width: 100%; width: 100%; aspect-ratio: 16 / 9; border: 0; display: block; }
    .single_activiteiten img { width: 100%; display: block; object-fit: cover; }
    .single_activiteiten h5 { margin: 0; padding: 0.75rem 1rem; font-size: 0.95rem; font-weight: 600; }
    .single_blue a { color: #e0f2fe; text-decoration: underline; }
    .carousel-inner > * { min-width: 100%; flex-shrink: 0; scroll-snap-align: center; position: relative; }
    .carousel-inner::-webkit-scrollbar { height: 6px; }
    .carousel-inner::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 999px; }
    /* Nav: keep desktop submenus above content; mobile open state */
    .cms-nav .cms-menu, .cms-nav .cms-submenu { list-style: none; margin: 0; padding: 0; }
    .cms-nav-panel.cms-nav-open { display: block !important; }
    @media (min-width: 768px) {
      .cms-nav-panel { display: block !important; }
      .cms-nav .cms-submenu-toggle { display: none !important; }
    }
  </style>
</head>
<body class="min-h-screen bg-slate-50 text-slate-900 antialiased">
  <header class="bg-slate-900 text-white shadow">
    <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:py-4">
      <a href="/s/{{site.slug}}" class="text-lg font-semibold tracking-tight text-white hover:text-white">{{site.title}}</a>
      {{menu}}
    </div>
  </header>
  <main class="cms-sections mx-auto max-w-6xl px-4 py-8">
    {{sections}}
  </main>
  <footer class="border-t border-slate-200 bg-white py-8 text-center text-sm text-slate-500">
    {{insert:footer}}
  </footer>
</body>
</html>`;
