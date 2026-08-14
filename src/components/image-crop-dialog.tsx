"use client";

/**
 * Interactive crop dialog for section image sizes (MotionCMS size="W/H").
 * The full image is shown; a fixed-aspect crop box is dragged over it.
 * Zoom shrinks the box so a left/right (or top/bottom) slice can be chosen.
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

const VIEW_MAX_W = 560;
const VIEW_MAX_H = 440;

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
  const stageRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  /** Crop box top-left in view (displayed image) pixels. */
  const [box, setBox] = useState({ x: 0, y: 0 });
  const drag = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const aspect = targetWidth / targetHeight;

  const view = useMemo(() => {
    if (!natural.w || !natural.h) {
      return { w: VIEW_MAX_W, h: Math.round(VIEW_MAX_W / aspect), scale: 1 };
    }
    const scale = Math.min(VIEW_MAX_W / natural.w, VIEW_MAX_H / natural.h);
    return {
      w: Math.max(1, Math.round(natural.w * scale)),
      h: Math.max(1, Math.round(natural.h * scale)),
      scale,
    };
  }, [natural, aspect]);

  /** Largest crop of the target aspect that fits inside the displayed image. */
  const maxBox = useMemo(() => {
    let w = view.w;
    let h = w / aspect;
    if (h > view.h) {
      h = view.h;
      w = h * aspect;
    }
    return { w, h };
  }, [view, aspect]);

  const boxW = maxBox.w / zoom;
  const boxH = maxBox.h / zoom;
  const canPanX = view.w - boxW > 0.5;
  const canPanY = view.h - boxH > 0.5;

  const clampBox = useCallback(
    (x: number, y: number, w: number, h: number) => ({
      x: Math.min(Math.max(0, x), Math.max(0, view.w - w)),
      y: Math.min(Math.max(0, y), Math.max(0, view.h - h)),
    }),
    [view],
  );

  useEffect(() => {
    if (!open) return;
    setNatural({ w: 0, h: 0 });
    setZoom(1);
    setBox({ x: 0, y: 0 });
  }, [open, imageUrl]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  // Wheel-zoom on the stage (non-passive so we can prevent page scroll)
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !open) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      if (busy || !natural.w) return;
      const next = Math.min(4, Math.max(1, zoom + (e.deltaY < 0 ? 0.12 : -0.12)));
      applyZoom(next, e.offsetX, e.offsetY);
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // applyZoom is recreated each render; bind to the values it reads
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, busy, natural.w, zoom, box.x, box.y, boxW, boxH]);

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    setNatural({ w, h });
    setZoom(1);
    const scale = Math.min(VIEW_MAX_W / w, VIEW_MAX_H / h);
    const vw = Math.max(1, Math.round(w * scale));
    const vh = Math.max(1, Math.round(h * scale));
    let cw = vw;
    let ch = cw / aspect;
    if (ch > vh) {
      ch = vh;
      cw = ch * aspect;
    }
    setBox({
      x: (vw - cw) / 2,
      y: (vh - ch) / 2,
    });
  }

  function applyZoom(next: number, pivotX?: number, pivotY?: number) {
    const nextW = maxBox.w / next;
    const nextH = maxBox.h / next;
    const px = pivotX ?? box.x + boxW / 2;
    const py = pivotY ?? box.y + boxH / 2;
    const relX = boxW > 0 ? (px - box.x) / boxW : 0.5;
    const relY = boxH > 0 ? (py - box.y) / boxH : 0.5;
    setZoom(next);
    setBox(clampBox(px - relX * nextW, py - relY * nextH, nextW, nextH));
  }

  function onPointerDown(e: React.PointerEvent) {
    if (busy) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: box.x,
      origY: box.y,
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    setBox(
      clampBox(drag.current.origX + dx, drag.current.origY + dy, boxW, boxH),
    );
  }

  function onPointerUp() {
    drag.current = null;
  }

  function computeCrop(): CropRect | null {
    if (!natural.w || !natural.h || !view.w || !view.h) return null;
    const scaleX = view.w / natural.w;
    const scaleY = view.h / natural.h;
    return {
      left: Math.max(0, box.x / scaleX),
      top: Math.max(0, box.y / scaleY),
      width: Math.min(natural.w, boxW / scaleX),
      height: Math.min(natural.h, boxH / scaleY),
    };
  }

  if (!open) return null;

  const ready = natural.w > 0;
  const hint =
    ready && zoom <= 1.01 && !canPanX && canPanY
      ? "Zoom in to crop a left or right slice, then drag the frame."
      : ready && zoom <= 1.01 && canPanX && !canPanY
        ? "Zoom in to crop a top or bottom slice, then drag the frame."
        : "Drag the frame to choose the area. Zoom in for a tighter crop.";

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
          <p className="text-xs text-slate-500">{hint}</p>

          <div className="flex justify-center">
            <div
              ref={stageRef}
              className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-900 shadow-inner touch-none select-none cursor-grab active:cursor-grabbing"
              style={{ width: view.w, height: view.h }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {!ready && (
                <p className="absolute inset-0 z-10 flex items-center justify-center text-xs text-slate-400 pointer-events-none">
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
                className="absolute left-0 top-0 max-w-none pointer-events-none"
                style={{
                  width: view.w,
                  height: view.h,
                  opacity: ready ? 1 : 0,
                }}
              />
              {ready && (
                <div
                  className="absolute z-[1] box-border border-2 border-blue-400"
                  style={{
                    left: box.x,
                    top: box.y,
                    width: boxW,
                    height: boxH,
                    boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.55)",
                  }}
                >
                  <div className="pointer-events-none absolute inset-0 border border-white/50" />
                  <div className="pointer-events-none absolute left-1/3 top-0 bottom-0 w-px bg-white/25" />
                  <div className="pointer-events-none absolute left-2/3 top-0 bottom-0 w-px bg-white/25" />
                  <div className="pointer-events-none absolute top-1/3 left-0 right-0 h-px bg-white/25" />
                  <div className="pointer-events-none absolute top-2/3 left-0 right-0 h-px bg-white/25" />
                </div>
              )}
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
              onChange={(e) => applyZoom(parseFloat(e.target.value))}
              className="flex-1 accent-blue-600"
            />
            <span className="text-xs tabular-nums text-slate-500 w-10 text-right">
              {zoom.toFixed(1)}×
            </span>
          </div>

          {ready && (
            <p className="text-[11px] text-slate-400">
              Source {natural.w}×{natural.h}px
              {canPanX ? " · drag left/right" : ""}
              {canPanY ? " · drag up/down" : ""}
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
