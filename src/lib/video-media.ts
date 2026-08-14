/**
 * Detect image-field values that are actually video
 * (uploaded MP4, direct .mp4 URL, YouTube, Vimeo).
 * Client-safe — no Node APIs.
 */

export type VideoKind = "youtube" | "vimeo" | "file";

export type VideoSource = {
  kind: VideoKind;
  /** Canonical playback URL (mp4 src or watch URL). */
  src: string;
  /** Provider id when kind is youtube/vimeo. */
  id?: string;
  /** Safe iframe src for YouTube/Vimeo. */
  embedUrl?: string;
  /** Best-effort poster (YouTube always; others may be empty). */
  posterUrl: string;
};

const YT_ID = /^[a-zA-Z0-9_-]{11}$/;

export function youtubePosterUrl(id: string, quality: "hqdefault" | "maxresdefault" = "hqdefault") {
  return `https://i.ytimg.com/vi/${id}/${quality}.jpg`;
}

export function extractYouTubeId(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (YT_ID.test(value)) return value;

  let url: URL;
  try {
    url = new URL(value.startsWith("http") ? value : `https://${value}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0] || "";
    return YT_ID.test(id) ? id : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    const v = url.searchParams.get("v") || "";
    if (YT_ID.test(v)) return v;
    const parts = url.pathname.split("/").filter(Boolean);
    const kind = parts[0];
    const id = parts[1] || "";
    if (
      (kind === "embed" || kind === "shorts" || kind === "live" || kind === "v") &&
      YT_ID.test(id)
    ) {
      return id;
    }
  }
  return null;
}

export function extractVimeoId(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^\d{6,12}$/.test(value)) return value;

  let url: URL;
  try {
    url = new URL(value.startsWith("http") ? value : `https://${value}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");
  if (host === "player.vimeo.com") {
    const m = url.pathname.match(/\/video\/(\d{6,12})/);
    return m?.[1] ?? null;
  }
  if (host === "vimeo.com") {
    const m = url.pathname.match(
      /^(?:\/(?:channels\/[^/]+|groups\/[^/]+\/videos|video))?\/(\d{6,12})(?:\/|$)/,
    );
    return m?.[1] ?? null;
  }
  return null;
}

export function isDirectVideoFile(raw: string): boolean {
  const value = raw.trim();
  if (!value) return false;
  if (/^data:video\//i.test(value)) return true;
  return /\.(mp4|m4v)(\?|#|$)/i.test(value);
}

export function detectVideoSource(raw: string): VideoSource | null {
  const src = (raw || "").trim();
  if (!src || src === "." || src === "#" || src === "null" || src === "undefined") {
    return null;
  }

  const yt = extractYouTubeId(src);
  if (yt) {
    return {
      kind: "youtube",
      src,
      id: yt,
      embedUrl: `https://www.youtube-nocookie.com/embed/${yt}`,
      posterUrl: youtubePosterUrl(yt),
    };
  }

  const vimeo = extractVimeoId(src);
  if (vimeo) {
    return {
      kind: "vimeo",
      src,
      id: vimeo,
      embedUrl: `https://player.vimeo.com/video/${vimeo}`,
      posterUrl: "",
    };
  }

  if (isDirectVideoFile(src)) {
    return { kind: "file", src, posterUrl: "" };
  }

  return null;
}

export function isLikelyMediaSrc(value: string): boolean {
  if (!value) return false;
  if (/^(https?:\/\/|\/|data:|blob:|\.\/|\.\.\/)/i.test(value)) return true;
  if (/\.(jpe?g|png|gif|webp|svg|avif|mp4|m4v)(\?|#|$)/i.test(value)) return true;
  return Boolean(detectVideoSource(value));
}

export function isVideoMime(mime: string | null | undefined): boolean {
  return Boolean(mime && mime.startsWith("video/"));
}
