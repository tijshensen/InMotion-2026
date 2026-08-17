/** Turn fetch/Grok/Prisma failures into a message the editor can show. */

export function formatCaughtError(
  err: unknown,
  fallback = "Import failed",
): string {
  if (err && typeof err === "object" && "name" in err) {
    const name = String((err as { name?: string }).name || "");
    if (name === "AbortError") {
      return "Grok timed out. Try a smaller page, or try again.";
    }
  }
  if (err instanceof TypeError && /fetch|network/i.test(err.message)) {
    return "Could not reach the server. Check your connection and try again.";
  }
  if (err instanceof Error && err.message.trim()) {
    if (/aborted|abort/i.test(err.message)) {
      return "Grok timed out. Try a smaller page, or try again.";
    }
    return err.message.trim();
  }
  return fallback;
}

export async function errorFromResponse(
  res: Response,
  fallback = "Import failed",
): Promise<string> {
  const text = await res.text();
  try {
    const data = JSON.parse(text) as { error?: unknown; message?: unknown };
    const msg =
      typeof data.error === "string"
        ? data.error
        : typeof data.message === "string"
          ? data.message
          : "";
    if (msg.trim()) return msg.trim();
  } catch {
    /* HTML / empty body from a proxy timeout */
  }

  if (res.status === 504 || res.status === 524 || res.status === 408) {
    return "Timed out waiting for Grok (over 3 minutes). Try a smaller page or try again.";
  }
  if (res.status === 413) {
    return "The source page is too large to import.";
  }
  if (res.status === 401) return "You need to sign in again.";
  if (res.status === 403) {
    return "You don't have permission to import here.";
  }
  if (res.status === 502 || res.status === 503) {
    return "Generate is temporarily unavailable. Try again in a moment.";
  }
  if (text && text.length < 280 && !/^\s*</.test(text)) {
    return text.trim();
  }
  return `${fallback} (HTTP ${res.status})`;
}

export function formatServerImportError(err: unknown): string {
  if (err && typeof err === "object" && "name" in err) {
    const name = String((err as { name?: string }).name || "");
    if (name === "AbortError") {
      return "Grok timed out after 3 minutes. Try again.";
    }
  }
  if (err instanceof Error && err.message.trim()) {
    const m = err.message.trim();
    if (/Unique constraint/i.test(m)) {
      return "A template or page with that name already exists.";
    }
    if (/Unable to open the database/i.test(m)) {
      return "Database is not ready. Retry in a few seconds.";
    }
    return m;
  }
  return "Import failed for an unknown reason.";
}
