/**
 * Cloudflare Pages project name → https://{name}.pages.dev
 * Must be a valid DNS label: 1–58 chars, start with a letter,
 * lowercase letters / numbers / hyphens, no trailing hyphen.
 */

const RE = /^[a-z](?:[a-z0-9-]{0,56}[a-z0-9])?$/;

export function isValidPagesProjectName(raw: string): boolean {
  const s = raw.trim().toLowerCase();
  if (!s) return true;
  return s.length <= 58 && RE.test(s);
}

export function pagesProjectError(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (s !== s.toLowerCase()) {
    return "Use lowercase letters only (this becomes the URL)";
  }
  if (s.length > 58) return "Maximum 58 characters";
  if (!/^[a-z]/.test(s)) return "Must start with a letter";
  if (s.endsWith("-")) return "Cannot end with a hyphen";
  if (!/^[a-z0-9-]+$/.test(s)) {
    return "Only letters, numbers and hyphens — this must be a valid URL";
  }
  if (!RE.test(s)) return "Not a valid URL name";
  return null;
}

export function pagesDevUrl(projectOrSlug: string): string {
  const s = projectOrSlug.trim().toLowerCase();
  return s ? `https://${s}.pages.dev` : "";
}
