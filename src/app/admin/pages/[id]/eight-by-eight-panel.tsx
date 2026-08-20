"use client";

import { useEffect, useState } from "react";
import type { CriterionResult, EightByEightResult } from "@/lib/eight-by-eight";

function tone(status: CriterionResult["status"]) {
  if (status === "pass") return "text-emerald-400";
  if (status === "partial") return "text-amber-300";
  return "text-rose-400";
}

function chip(total: number | null) {
  if (total == null) return "bg-slate-800 text-slate-400";
  if (total >= 75) return "bg-emerald-900/60 text-emerald-300";
  if (total >= 45) return "bg-amber-900/50 text-amber-200";
  return "bg-rose-950/50 text-rose-300";
}

export function EightByEightPanel({
  pageId,
  open,
  onClose,
  onScore,
}: {
  pageId: string;
  open: boolean;
  onClose: () => void;
  onScore?: (total: number | null) => void;
}) {
  const [data, setData] = useState<EightByEightResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadStored() {
    const res = await fetch(`/api/pages/${pageId}/eight-by-eight`);
    const json = await res.json().catch(() => ({}));
    if (json?.breakdown?.criteria) {
      setData(json.breakdown as EightByEightResult);
      onScore?.(json.total ?? null);
    } else {
      onScore?.(json.total ?? null);
    }
  }

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/pages/${pageId}/eight-by-eight`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Score failed");
      }
      setData(json as EightByEightResult);
      onScore?.(json.total ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Score failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (open) void loadStored();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pageId]);

  const tips = data?.criteria.filter((c) => c.group === "tips") || [];
  const knallers = data?.criteria.filter((c) => c.group === "knaller") || [];

  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="Close 8x8 score"
          className="fixed inset-0 z-[56] bg-slate-900/40"
          style={{ top: "var(--admin-header-h, 56px)" }}
          onClick={onClose}
        />
      ) : null}
      <aside
        className={[
          "fixed right-0 z-[57] flex w-full max-w-md flex-col border-l border-slate-800 bg-slate-900 text-slate-100 shadow-2xl transition-transform duration-200 ease-out",
          "bottom-0",
          open ? "translate-x-0" : "translate-x-full pointer-events-none",
        ].join(" ")}
        style={{ top: "var(--admin-header-h, 56px)" }}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 shrink-0">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-slate-500">
              IMU 8x8
            </p>
            <h2 className="font-semibold">Sales page score</h2>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-sm font-semibold ${chip(data?.total ?? null)}`}
          >
            {data?.total != null ? data.total : "—"}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 text-sm">
          <p className="text-xs text-slate-400">
            Tempt → Influence → Persuade → Sell, plus the 8 conversion tips.
          </p>
          {error ? <p className="text-sm text-rose-400">{error}</p> : null}
          {!data && !busy ? (
            <p className="text-slate-500 text-sm">
              Not scored yet. Click Score to run it.
            </p>
          ) : null}
          {tips.length ? (
            <section>
              <h3 className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">
                Layout (TIPS)
              </h3>
              <ul className="space-y-3">
                {tips.map((c) => (
                  <li key={c.id}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{c.label}</span>
                      <span className={`text-xs font-semibold ${tone(c.status)}`}>
                        {Math.round(c.score * 100)}%
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{c.note}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {knallers.length ? (
            <section>
              <h3 className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">
                8 conversion tips
              </h3>
              <ul className="space-y-3">
                {knallers.map((c) => (
                  <li key={c.id}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{c.label}</span>
                      <span className={`text-xs font-semibold ${tone(c.status)}`}>
                        {Math.round(c.score * 100)}%
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{c.note}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{c.hint}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
        <div className="border-t border-slate-800 px-4 py-3 shrink-0">
          <button
            type="button"
            disabled={busy}
            onClick={() => void run()}
            className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
          >
            {busy ? "Grok is scoring the copy…" : "Score this page"}
          </button>
        </div>
      </aside>
    </>
  );
}
