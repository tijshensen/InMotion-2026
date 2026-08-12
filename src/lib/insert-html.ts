/**
 * Helpers for insert HTML content.
 *
 * Legacy MySQL import bug: escape sequences lost their backslash:
 *   "\\n" → "n"    "\\r" → "r"
 * Forms appear as:  `>n\t`  `>\tr\t`  `\n\tn\t<div`  `</tr>\n\t\tn\t</table>`
 */

/** Decode escapes and repair known import artifacts. */
export function normalizeInsertHtml(raw: string): string {
  if (!raw) return "";
  let s = raw;
  // Run multiple passes — order matters; keep iterating until stable
  for (let pass = 0; pass < 12; pass++) {
    const before = s;

    // Two-character escapes still present as text
    s = s
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\r/g, "\n");

    // Peel one orphan r/n after ">" even when more orphans follow
    // e.g. "/>n           n        </div>" → peel twice → newlines
    s = s.replace(/(>)([ \t]*)[rn]([ \t]+)/g, "$1$2\n$3");
    s = s.replace(/(>)([ \t]*)(?:rn|nn|r|n)([ \t]*)(?=<)/g, "$1$2\n$3");
    s = s.replace(/(>)([ \t]*)[rn]\s*$/gm, "$1$2");

    // Start of string / after newline: orphan n/r then whitespace then "<"
    s = s.replace(/(^|\n)(?:rn|nn|r|n)([ \t]*)(?=<)/g, "$1\n$2");

    // After newline + tabs/spaces: orphan n/r before more ws or "<"
    s = s.replace(/(\n[ \t]+)(?:rn|nn|n|r)([ \t]+)(?=<)/g, "$1\n$2");
    s = s.replace(/(\n[ \t]+)(?:rn|nn|n|r)(?=<)/g, "$1\n");
    s = s.replace(/(\n[ \t]+)(?:rn|nn|n|r)([ \t]*)(?=\n)/g, "$1\n$2");
    s = s.replace(/(\n[ \t]+)(?:rn|nn|n|r)(?=<\/)/g, "$1\n");
    // "\n           n        </div>" after partial peel
    s = s.replace(/(\n[ \t]+)[rn]([ \t]+)(?=<)/g, "$1\n$2");

    // Between tabs only: "\tn\t" / "\tr\t"
    s = s.replace(/(\t)(?:rn|nn|n|r)(\t)/g, "$1\n$2");

    // Right before closing tags after whitespace
    s = s.replace(/([ \t])(?:n|r)(?=<\/)/g, "$1\n");
    s = s.replace(/(\n)(?:n|r)(?=<\/)/g, "$1");

    // Trailing orphan at end of file: "</div>n"
    s = s.replace(/(>)([ \t]*)[rn]\s*$/g, "$1$2");

    // Normalize CR
    s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    // Lone r/n on their own line
    s = s.replace(/\n[rn]\n/g, "\n");
    // Collapse excessive blank lines from multi-orphan peels
    s = s.replace(/\n{3,}/g, "\n\n");

    if (s === before) break;
  }

  return s;
}

/** Pretty-print for the code editor. */
export function formatInsertHtml(raw: string): string {
  let s = normalizeInsertHtml(raw);
  if (!s.trim()) return s;

  if (!s.includes("\n") || s.split("\n").length < 3) {
    s = s.replace(/>\s*</g, ">\n<");
  }

  return s.replace(/\n{3,}/g, "\n\n").trim();
}
