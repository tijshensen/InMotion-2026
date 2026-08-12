"use client";

/**
 * Interactive crop dialog for section image sizes (MotionCMS size="W/H").
 * Fixed aspect-ratio frame; drag the image and zoom to choose the crop.
 * On confirm, returns crop rect in natural image pixels.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type CropRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type Props = {
  open: boolean;
  imageUrl: string;
  imageLabel?: string;
  targetWidth: number;
  targetHeight: number;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (crop: CropRect) => void;
  /** Skip crop and use original image URL as-is */
  onUseOriginal?: () => void;
};

const VIEW_MAX_W = 520;
const VIEW_MAX_H = 420;

export function ImageCropDialog({
  open,
  imageUrl,
  imageLabel,
  targetWidth,
  targetHeight,
  busy = false,
  error = null,
  onCancel,
  onConfirm,
  onUseOriginal,
}: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // image top-left inside frame
  const drag = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const aspect = targetWidth / targetHeight;

  const frameSize = useMemo(() => {
    let w = VIEW_MAX_W;
    let h = w / aspect;
    if (h > VIEW_MAX_H) {
      h = VIEW_MAX_H;
      w = h * aspect;
    }
    return { w: Math.round(w), h: Math.round(h) };
  }, [aspect]);

  // Minimum scale so image covers the crop frame
  const minScale = useMemo(() => {
    if (!natural.w || !natural.h) return 1;
    return Math.max(frameSize.w / natural.w, frameSize.h / natural.h);
  }, [natural, frameSize]);

  const displayScale = minScale * zoom;
  const imgDisplayW = natural.w * displayScale;
  const imgDisplayH = natural.h * displayScale;

  const clampOffset = useCallback(
    (x: number, y: number, scale: number) => {
      const dw = natural.w * scale;
      const dh = natural.h * scale;
      // Image must cover the frame: offset in [frame - img, 0]
      const minX = Math.min(0, frameSize.w - dw);
      const minY = Math.min(0, frameSize.h - dh);
      return {
        x: Math.min(0, Math.max(minX, x)),
        y: Math.min(0, Math.max(minY, y)),
      };
    },
    [natural, frameSize],
  );

  // Reset when image / open changes
  useEffect(() => {
    if (!open) return;
    setNatural({ w: 0, h: 0 });
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, [open, imageUrl]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    setNatural({ w, h });
    const cover = Math.max(frameSize.w / w, frameSize.h / h);
    // Center image in frame
    const dw = w * cover;
    const dh = h * cover;
    setZoom(1);
    setOffset({
      x: (frameSize.w - dw) / 2,
      y: (frameSize.h - dh) / 2,
    });
  }

  function onPointerDown(e: React.PointerEvent) {
    if (busy) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: offset.x,
      origY: offset.y,
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    setOffset(
      clampOffset(
        drag.current.origX + dx,
        drag.current.origY + dy,
        displayScale,
      ),
    );
  }

  function onPointerUp() {
    drag.current = null;
  }

  function onZoomChange(next: number) {
    const prevScale = minScale * zoom;
    const nextScale = minScale * next;
    // Keep center of frame fixed while zooming
    const cx = frameSize.w / 2;
    const cy = frameSize.h / 2;
    const imgCx = (cx - offset.x) / prevScale;
    const imgCy = (cy - offset.y) / prevScale;
    const nx = cx - imgCx * nextScale;
    const ny = cy - imgCy * nextScale;
    setZoom(next);
    setOffset(clampOffset(nx, ny, nextScale));
  }

  function computeCrop(): CropRect | null {
    if (!natural.w || !natural.h) return null;
    const scale = displayScale;
    // Frame maps to natural pixels
    const left = -offset.x / scale;
    const top = -offset.y / scale;
    const width = frameSize.w / scale;
    const height = frameSize.h / scale;
    return {
      left: Math.max(0, left),
      top: Math.max(0, top),
      width: Math.min(natural.w, width),
      height: Math.min(natural.h, height),
    };
  }

  if (!open) return null;

  const ready = natural.w > 0;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60"
      role="dialog"
      aria-modal="true"
      aria-label="Crop image"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-semibold text-slate-900">Crop image</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Target size{" "}
              <span className="font-medium text-slate-700">
                {targetWidth}×{targetHeight}px
              </span>
              {imageLabel ? ` · ${imageLabel}` : ""}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 text-sm disabled:opacity-50"
          >
            Close
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-xs text-slate-500">
            Drag the image to position. Use zoom so the important area fills the
            frame — it will be saved at exactly {targetWidth}×{targetHeight}.
          </p>

          <div className="flex justify-center">
            <div
              ref={frameRef}
              className="relative overflow-hidden rounded-xl border-2 border-blue-500 bg-slate-200 shadow-inner touch-none select-none cursor-grab active:cursor-grabbing"
              style={{ width: frameSize.w, height: frameSize.h }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {!ready && (
                <p className="absolute inset-0 z-10 flex items-center justify-center text-xs text-slate-500 pointer-events-none">
                  Loading image…
                </p>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt=""
                draggable={false}
                onLoad={onImageLoad}
                onError={() => {
                  setNatural({ w: 0, h: 0 });
                }}
                className="absolute max-w-none pointer-events-none"
                style={{
                  width: imgDisplayW || undefined,
                  height: imgDisplayH || undefined,
                  left: offset.x,
                  top: offset.y,
                  opacity: ready ? 1 : 0,
                }}
              />
              {/* Corner guides */}
              <div className="pointer-events-none absolute inset-0 border border-white/40" />
              <div className="pointer-events-none absolute left-1/3 top-0 bottom-0 w-px bg-white/20" />
              <div className="pointer-events-none absolute left-2/3 top-0 bottom-0 w-px bg-white/20" />
              <div className="pointer-events-none absolute top-1/3 left-0 right-0 h-px bg-white/20" />
              <div className="pointer-events-none absolute top-2/3 left-0 right-0 h-px bg-white/20" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs text-slate-600 w-12 shrink-0">Zoom</label>
            <input
              type="range"
              min={1}
              max={4}
              step={0.01}
              value={zoom}
              disabled={!ready || busy}
              onChange={(e) => onZoomChange(parseFloat(e.target.value))}
              className="flex-1 accent-blue-600"
            />
            <span className="text-xs tabular-nums text-slate-500 w-10 text-right">
              {zoom.toFixed(1)}×
            </span>
          </div>

          {ready && (
            <p className="text-[11px] text-slate-400">
              Source {natural.w}×{natural.h}px · cover scale{" "}
              {displayScale.toFixed(3)}
            </p>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50">
          <div>
            {onUseOriginal && (
              <button
                type="button"
                disabled={busy}
                onClick={onUseOriginal}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
              >
                Use original (no crop)
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!ready || busy}
              onClick={() => {
                const crop = computeCrop();
                if (crop) onConfirm(crop);
              }}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? "Cropping…" : `Crop to ${targetWidth}×${targetHeight}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
