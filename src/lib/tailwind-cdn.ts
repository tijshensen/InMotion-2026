/** Tailwind Play CDN — JIT so arbitrary classes (max-w-[130px]) work. */
export const TAILWIND_PLAY_CDN = "https://cdn.tailwindcss.com";

export function isTailwindFramework(cssFramework?: string | null) {
  return (cssFramework || "").toLowerCase() === "tailwind";
}

export function htmlHasTailwindPlayScript(html: string) {
  return /<script[^>]+src=["']https?:\/\/cdn\.tailwindcss\.com/i.test(html);
}

/**
 * Play CDN is a JS compiler, not a stylesheet. A <link rel="stylesheet">
 * never generates utilities — especially arbitrary values.
 */
export function ensureTailwindPlayCdn(html: string): string {
  if (!html) return html;
  const next = html.replace(
    /<link[^>]+href=["']https?:\/\/cdn\.tailwindcss\.com[^"']*["'][^>]*>\s*/gi,
    "",
  );
  if (htmlHasTailwindPlayScript(next)) return next;
  const tag = `<script src="${TAILWIND_PLAY_CDN}"></script>\n`;
  if (/<\/head>/i.test(next)) return next.replace(/<\/head>/i, `${tag}</head>`);
  return tag + next;
}

export function refreshTailwindInWindow(win: Window | null | undefined) {
  const tw = (
    win as unknown as { tailwind?: { refresh?: () => void } } | null | undefined
  )?.tailwind;
  if (typeof tw?.refresh === "function") tw.refresh();
}
