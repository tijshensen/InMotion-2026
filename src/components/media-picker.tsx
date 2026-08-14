"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatBytes } from "@/lib/media-format";
import {
  ImageCropDialog,
  type CropRect,
} from "@/components/image-crop-dialog";

export type MediaItem = {
  id: string;
  filename: string;
  path: string;
  mimeType: string;
  sizeBytes: number;
  alt: string;
  posterPath?: string;
  createdAt: string;
};

type Props = {
  open: boolean;
  siteId: string;
  onClose: () => void;
  onSelect: (asset: MediaItem) => void;
  /**
   * When set (from section img width/height or size="W/H"),
   * selecting an image opens the crop dialog to match that size.
   */
  targetWidth?: number | null;
  targetHeight?: number | null;
  /** Image fields accept MP4 too; poster pickers stay image-only. */
  acceptKinds?: "all" | "image";
};

function canCropMime(mime: string) {
  if (!mime) return true;
  if (mime.includes("svg")) return false;
  return (
    mime.startsWith("image/") ||
    mime === "image/jpeg" ||
    mime === "image/png" ||
    mime === "image/gif" ||
    mime === "image/webp"
  );
}

function isVideoItem(item: Pick<MediaItem, "mimeType" | "path">) {
  return (
    item.mimeType.startsWith("video/") || /\.mp4(\?|#|$)/i.test(item.path)
  );
}

export function MediaPicker({
  open,
  siteId,
  onClose,
  onSelect,
  targetWidth,
  targetHeight,
  acceptKinds = "all",
}: Props) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cropSource, setCropSource] = useState<MediaItem | null>(null);
  const [cropping, setCropping] = useState(false);
  const [cropError, setCropError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const imagesOnly = acceptKinds === "image";
  const hasCropTarget =
    !imagesOnly &&
    typeof targetWidth === "number" &&
    typeof targetHeight === "number" &&
    targetWidth > 0 &&
    targetHeight > 0;

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/media?siteId=${encodeURIComponent(siteId)}`);
      if (!res.ok) throw new Error("Failed to load media");
      const data = (await res.json()) as MediaItem[];
      setItems(
        imagesOnly
          ? data.filter((item) => !isVideoItem(item))
          : data,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [siteId, imagesOnly]);

  // Only reset picker state when the dialog opens / site changes — not when
  // `load` identity changes mid-crop (that used to abort the crop dialog).
  useEffect(() => {
    if (!open) return;
    setSelectedId(null);
    setCropSource(null);
    setCropError(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: open/siteId only
  }, [open, siteId]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !cropSource) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, cropSource]);

  async function onUpload(files: FileList | null) {
    if (!files?.length || !siteId) return;
    setUploading(true);
    setError(null);
    try {
      let last: MediaItem | null = null;
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.set("siteId", siteId);
        form.set("file", file);
        form.set("alt", file.name.replace(/\.[^.]+$/, ""));
        const res = await fetch("/api/media", { method: "POST", body: form });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Upload failed: ${file.name}`);
        }
        last = (await res.json()) as MediaItem;
      }
      await load();
      // After single upload with crop target, jump straight into crop
      if (last && hasCropTarget && canCropMime(last.mimeType)) {
        setSelectedId(last.id);
        setCropSource(last);
      } else if (last) {
        setSelectedId(last.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function beginSelect(item: MediaItem) {
    if (hasCropTarget && canCropMime(item.mimeType)) {
      setCropSource(item);
      setCropError(null);
      return;
    }
    onSelect(item);
  }

  async function confirmCrop(crop: CropRect) {
    if (!cropSource || !hasCropTarget) return;
    setCropping(true);
    setCropError(null);
    try {
      const res = await fetch("/api/media/crop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          sourcePath: cropSource.path,
          mediaId: cropSource.id,
          alt: cropSource.alt,
          targetWidth,
          targetHeight,
          crop,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Crop failed");
      }
      const asset = data as MediaItem;
      if (!asset?.path) {
        throw new Error("Crop succeeded but no image path was returned");
      }
      setCropSource(null);
      // Call onSelect before any further state that might unmount the tree
      onSelect(asset);
    } catch (e) {
      setCropError(e instanceof Error ? e.message : "Crop failed");
    } finally {
      setCropping(false);
    }
  }

  const selected = items.find((i) => i.id === selectedId) || null;

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50"
        role="dialog"
        aria-modal="true"
        aria-label="Media library"
        onClick={(e) => {
          if (e.target === e.currentTarget && !cropSource) onClose();
        }}
      >
        <div className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl bg-white shadow-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div>
              <h2 className="font-semibold text-slate-900">Media library</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {imagesOnly
                  ? "Upload or pick an image (JPEG, PNG, GIF, WebP, SVG · max 5 MB)"
                  : "Upload or pick an image or MP4 (images max 5 MB · video max 50 MB)"}
                {hasCropTarget && (
                  <span className="text-blue-600">
                    {" "}
                    · images will crop to {targetWidth}×{targetHeight}px
                  </span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 text-sm"
            >
              Close
            </button>
          </div>

          <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept={
                imagesOnly
                  ? "image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
                  : "image/jpeg,image/png,image/gif,image/webp,image/svg+xml,video/mp4,.mp4"
              }
              multiple
              className="hidden"
              onChange={(e) => void onUpload(e.target.files)}
            />
            <button
              type="button"
              disabled={uploading || !siteId}
              onClick={() => fileRef.current?.click()}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {uploading
                ? "Uploading…"
                : imagesOnly
                  ? "Upload images"
                  : "Upload images or MP4"}
            </button>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
            >
              Refresh
            </button>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          <div className="flex-1 overflow-y-auto p-5 min-h-[240px]">
            {loading && (
              <p className="text-sm text-slate-500 text-center py-12">
                Loading…
              </p>
            )}
            {!loading && items.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-12">
                {imagesOnly
                  ? "No images yet. Upload your first image."
                  : "No media yet. Upload your first image or MP4."}
              </p>
            )}
            {!loading && items.length > 0 && (
              <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {items.map((item) => {
                  const active = item.id === selectedId;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(item.id)}
                        onDoubleClick={() => beginSelect(item)}
                        className={[
                          "w-full text-left rounded-xl border overflow-hidden transition-shadow",
                          active
                            ? "border-blue-500 ring-2 ring-blue-200 shadow-sm"
                            : "border-slate-200 hover:border-slate-300",
                        ].join(" ")}
                      >
                        <div className="aspect-square bg-slate-100 flex items-center justify-center overflow-hidden relative">
                          {isVideoItem(item) ? (
                            item.posterPath ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={item.posterPath}
                                alt={item.alt || item.filename}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <video
                                src={item.path}
                                muted
                                playsInline
                                preload="metadata"
                                className="h-full w-full object-cover"
                              />
                            )
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.path}
                              alt={item.alt || item.filename}
                              className="h-full w-full object-cover"
                              onError={(e) => {
                                const el = e.currentTarget;
                                el.className =
                                  "max-h-full max-w-full object-contain opacity-40";
                                el.alt = "Preview unavailable";
                              }}
                            />
                          )}
                          {isVideoItem(item) && (
                            <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
                              MP4
                            </span>
                          )}
                        </div>
                        <div className="px-2 py-1.5">
                          <p className="text-xs font-medium text-slate-800 truncate">
                            {item.filename}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {formatBytes(item.sizeBytes)}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-slate-100 bg-slate-50">
            <p className="text-xs text-slate-500 truncate min-w-0">
              {selected
                ? `Selected: ${selected.filename}`
                : hasCropTarget
                  ? `Select an image to crop to ${targetWidth}×${targetHeight}`
                  : imagesOnly
                    ? "Select an image, or double-click to insert"
                    : "Select an image or video, or double-click to insert"}
            </p>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!selected}
                onClick={() => selected && beginSelect(selected)}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {hasCropTarget && selected && canCropMime(selected.mimeType)
                  ? "Crop & insert"
                  : "Insert"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {cropSource && hasCropTarget && (
        <ImageCropDialog
          open
          imageUrl={cropSource.path}
          imageLabel={cropSource.filename}
          targetWidth={targetWidth!}
          targetHeight={targetHeight!}
          busy={cropping}
          error={cropError}
          onCancel={() => {
            if (!cropping) {
              setCropSource(null);
              setCropError(null);
            }
          }}
          onUseOriginal={() => {
            if (cropping) return;
            const item = cropSource;
            setCropSource(null);
            onSelect(item);
          }}
          onConfirm={(crop) => void confirmCrop(crop)}
        />
      )}
    </>
  );
}
