"use client";

/**
 * MotionCMS crop: the frame is the *image holder* (size="W/H" / width×height
 * on the <img>), not the photo. The photo cover-fits that slot — same as
 * crop.js imgSize() — so a wider photo can be dragged left/right, a taller
 * one up/down. Zoom unlocks the other axis. Output is exactly W×H.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

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
  onUseOriginal?: () => void;
};

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
  const imgRef = useRef<HTMLImageElement>(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [framePx, setFramePx] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const holderAspect =
    targetWidth > 0 && targetHeight > 0
      ? targetWidth / targetHeight
      : 16 / 9;

  function readNatural(img: HTMLImageElement | null) {
    if (!img?.naturalWidth || !img.naturalHeight) return;
    setNatural({ w: img.naturalWidth, h: img.naturalHeight });
  }

  useEffect(() => {
    if (!open) return;
    setNatural({ w: 0, h: 0 });
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, [open, imageUrl]);

  useEffect(() => {
    if (!open) return;
    const img = imgRef.current;
    if (img?.complete) readNatural(img);
  }, [open, imageUrl]);

  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el || !open) return;
    const measure = () => {
      setFramePx({ w: el.clientWidth, h: el.clientHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, holderAspect]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  // Cover: image always fills the holder (old crop.js imgSize)
  const minScale =
    natural.w > 0 && natural.h > 0 && framePx.w > 0 && framePx.h > 0
      ? Math.max(framePx.w / natural.w, framePx.h / natural.h)
      : 1;
  const displayScale = minScale * zoom;
  const imgDisplayW = natural.w * displayScale;
  const imgDisplayH = natural.h * displayScale;
  const canPanX = imgDisplayW - framePx.w > 0.5;
  const canPanY = imgDisplayH - framePx.h > 0.5;

  const clampOffset = useCallback(
    (x: number, y: number, scale: number) => {
      const dw = natural.w * scale;
      const dh = natural.h * scale;
      const minX = Math.min(0, framePx.w - dw);
      const minY = Math.min(0, framePx.h - dh);
      return {
        x: Math.min(0, Math.max(minX, x)),
        y: Math.min(0, Math.max(minY, y)),
      };
    },
    [natural, framePx],
  );

  function centerOffset(scale: number) {
    return clampOffset(
      (framePx.w - natural.w * scale) / 2,
      (framePx.h - natural.h * scale) / 2,
      scale,
    );
  }

  useEffect(() => {
    if (!natural.w || !framePx.w) return;
    setOffset(centerOffset(minScale * zoom));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the photo or holder size is known
  }, [natural.w, natural.h, framePx.w, framePx.h]);

  function onZoomChange(next: number) {
    const prevScale = minScale * zoom;
    const nextScale = minScale * next;
    if (prevScale <= 0) {
      setZoom(next);
      return;
    }
    const cx = framePx.w / 2;
    const cy = framePx.h / 2;
    const imgCx = (cx - offset.x) / prevScale;
    const imgCy = (cy - offset.y) / prevScale;
    setZoom(next);
    setOffset(
      clampOffset(cx - imgCx * nextScale, cy - imgCy * nextScale, nextScale),
    );
  }

  useEffect(() => {
    const el = frameRef.current;
    if (!el || !open) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      if (busy || !natural.w) return;
      const next = Math.min(
        4,
        Math.max(1, zoom + (e.deltaY < 0 ? 0.12 : -0.12)),
      );
      onZoomChange(next);
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, busy, natural.w, zoom, offset.x, offset.y, displayScale, framePx]);

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
    setOffset(
      clampOffset(
        drag.current.origX + (e.clientX - drag.current.startX),
        drag.current.origY + (e.clientY - drag.current.startY),
        displayScale,
      ),
    );
  }

  function onPointerUp() {
    drag.current = null;
  }

  function computeCrop(): CropRect | null {
    if (!natural.w || !natural.h || !framePx.w || displayScale <= 0) return null;
    return {
      left: Math.max(0, -offset.x / displayScale),
      top: Math.max(0, -offset.y / displayScale),
      width: Math.min(natural.w, framePx.w / displayScale),
      height: Math.min(natural.h, framePx.h / displayScale),
    };
  }

  if (!open) return null;

  const ready = natural.w > 0 && natural.h > 0;
  const hint = !ready
    ? "Loading…"
    : canPanX && !canPanY
      ? "Drag left or right to choose the part that fills this slot."
      : !canPanX && canPanY
        ? "Drag up or down to choose the part that fills this slot."
        : canPanX && canPanY
          ? "Drag to choose the part that fills this slot."
          : "Zoom in, then drag to choose the part that fills this slot.";

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
      <div className="flex w-full max-w-3xl max-h-[92vh] flex-col rounded-2xl bg-white shadow-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="font-semibold text-slate-900">Crop image</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Image slot{" "}
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

        <div className="px-5 py-4 space-y-4 overflow-y-auto min-h-0">
          <p className="text-xs text-slate-500">{hint}</p>

          <div
            ref={frameRef}
            className="relative w-full overflow-hidden rounded-xl border-2 border-blue-500 bg-slate-200 shadow-inner touch-none select-none cursor-grab active:cursor-grabbing"
            style={{ aspectRatio: `${holderAspect}` }}
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
              ref={imgRef}
              src={imageUrl}
              alt=""
              draggable={false}
              onLoad={(e) => readNatural(e.currentTarget)}
              onError={() => setNatural({ w: 0, h: 0 })}
              className="absolute pointer-events-none"
              style={{
                width: imgDisplayW || undefined,
                height: imgDisplayH || undefined,
                maxWidth: "none",
                maxHeight: "none",
                left: offset.x,
                top: offset.y,
                opacity: ready ? 1 : 0,
              }}
            />
            <div className="pointer-events-none absolute inset-0 border border-white/40" />
            <div className="pointer-events-none absolute left-1/3 top-0 bottom-0 w-px bg-white/20" />
            <div className="pointer-events-none absolute left-2/3 top-0 bottom-0 w-px bg-white/20" />
            <div className="pointer-events-none absolute top-1/3 left-0 right-0 h-px bg-white/20" />
            <div className="pointer-events-none absolute top-2/3 left-0 right-0 h-px bg-white/20" />
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
              Photo {natural.w}×{natural.h}px · slot {targetWidth}×
              {targetHeight}px
              {canPanX ? " · drag left/right" : ""}
              {canPanY ? " · drag up/down" : ""}
            </p>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50 shrink-0">
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
