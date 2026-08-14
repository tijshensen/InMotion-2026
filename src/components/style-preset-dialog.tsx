"use client";

import { useEffect, useMemo, useState } from "react";
import type { PresetHit } from "@/lib/style-preset-match";

export type SavedPreset = {
  id: string;
  name: string;
  className: string;
  tag: string;
};

type Props = {
  siteId: string;
  pageBlockId: string;
  nid: string;
  tag: string;
  className: string;
  onApplyClass: (className: string) => void;
  onReplaced: (payload: {
    updatedPageBlocks: { id: string; content: string }[];
    updatedTemplateBlocks: { id: string; defaultHtml: string }[];
  }) => void;
};

export function StylePresetBar({
  siteId,
  pageBlockId,
  nid,
  tag,
  className,
  onApplyClass,
  onReplaced,
}: Props) {
  const [presets, setPresets] = useState<SavedPreset[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState<SavedPreset | null>(null);
  const [matches, setMatches] = useState<PresetHit[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [undoHint, setUndoHint] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/sites/${siteId}/style-presets`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : { presets: [] }))
      .then((data) => {
        if (!cancelled && Array.isArray(data.presets)) setPresets(data.presets);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  function resetForm() {
    setName(tagLabel(tag));
    setError(null);
    setPreset(null);
    setMatches([]);
    setSelected(new Set());
    setUndoHint(null);
  }

  async function savePreset() {
    const trimmed = name.trim();
    if (!trimmed || !className.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/sites/${siteId}/style-presets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          name: trimmed,
          className,
          tag,
          exclude: { pageBlockId, nid },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Save failed");
        return;
      }
      const saved = data.preset as SavedPreset;
      setPreset(saved);
      setPresets((prev) => [saved, ...prev.filter((p) => p.id !== saved.id)]);
      const found = (data.matches || []) as PresetHit[];
      setMatches(found);
      setSelected(new Set(found.map((m) => m.id)));
    } catch {
      setError("Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function replaceSelected() {
    if (!preset) return;
    const hits = matches
      .filter((m) => selected.has(m.id))
      .map((m) => ({ kind: m.kind, targetId: m.targetId, nid: m.nid }));
    if (!hits.length) {
      setOpen(false);
      return;
    }
    setApplying(true);
    setError(null);
    try {
      const res = await fetch(`/api/sites/${siteId}/style-presets/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ presetId: preset.id, hits }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Replace failed");
        return;
      }
      onReplaced({
        updatedPageBlocks: data.updatedPageBlocks || [],
        updatedTemplateBlocks: data.updatedTemplateBlocks || [],
      });
      setUndoHint(`Replaced ${data.replaced} element${data.replaced === 1 ? "" : "s"}`);
      setMatches([]);
    } catch {
      setError("Replace failed");
    } finally {
      setApplying(false);
    }
  }

  async function undoLast() {
    if (!preset) return;
    setApplying(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/style-presets/undo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ presetId: preset.id }),
      });
      const data = await res.json();
      if (res.ok) {
        onReplaced({
          updatedPageBlocks: data.updatedPageBlocks || [],
          updatedTemplateBlocks: data.updatedTemplateBlocks || [],
        });
        setUndoHint(
          data.restored
            ? `Undid ${data.restored} change${data.restored === 1 ? "" : "s"}`
            : "Nothing to undo",
        );
      }
    } finally {
      setApplying(false);
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, PresetHit[]>();
    for (const m of matches) {
      const key = m.pageTitle || m.sectionName || m.kind;
      const list = map.get(key) || [];
      list.push(m);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [matches]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            resetForm();
            setOpen(true);
          }}
          disabled={!className.trim()}
          className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          Save as preset
        </button>
        {presets.length > 0 ? (
          <select
            className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-700"
            defaultValue=""
            onChange={(e) => {
              const p = presets.find((x) => x.id === e.target.value);
              if (p) onApplyClass(p.className);
              e.target.value = "";
            }}
          >
            <option value="">Apply a preset…</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {open ? (
        <div className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-900/40 px-4 py-10">
          <div className="flex max-h-[calc(100vh-5rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">
                  Style preset
                </p>
                <h3 className="font-semibold text-slate-900">
                  {preset ? preset.name : "Save as preset"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {!preset ? (
                <>
                  <label className="block space-y-1 text-sm">
                    <span className="text-slate-500">Name</span>
                    <input
                      autoFocus
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Buy Button"
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <p className="rounded-md bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-600 break-words">
                    {className}
                  </p>
                </>
              ) : undoHint && !matches.length ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                  <p>{undoHint}.</p>
                  <button
                    type="button"
                    onClick={() => void undoLast()}
                    disabled={applying}
                    className="mt-2 text-xs font-medium text-blue-700 underline"
                  >
                    Undo
                  </button>
                </div>
              ) : matches.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Saved. No similar class lists on other pages or layouts.
                </p>
              ) : (
                <>
                  <p className="text-sm text-slate-600">
                    Found {matches.length} similar element
                    {matches.length === 1 ? "" : "s"}. Replace with “{preset.name}”?
                  </p>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <button
                      type="button"
                      className="underline"
                      onClick={() =>
                        setSelected(new Set(matches.map((m) => m.id)))
                      }
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      className="underline"
                      onClick={() => setSelected(new Set())}
                    >
                      Select none
                    </button>
                  </div>
                  <div className="space-y-3">
                    {grouped.map(([group, rows]) => (
                      <div key={group}>
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          {group}
                        </p>
                        <ul className="space-y-1.5">
                          {rows.map((m) => (
                            <li key={m.id}>
                              <label className="flex items-start gap-2 rounded-md border border-slate-100 px-2 py-1.5 text-xs">
                                <input
                                  type="checkbox"
                                  className="mt-0.5"
                                  checked={selected.has(m.id)}
                                  onChange={(e) => {
                                    setSelected((prev) => {
                                      const next = new Set(prev);
                                      if (e.target.checked) next.add(m.id);
                                      else next.delete(m.id);
                                      return next;
                                    });
                                  }}
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="font-mono text-slate-700">
                                    &lt;{m.tag}&gt;
                                  </span>
                                  {m.sectionName && m.pageTitle ? (
                                    <span className="text-slate-400">
                                      {" "}
                                      · {m.sectionName}
                                    </span>
                                  ) : null}
                                  <span className="ml-1 text-slate-400">
                                    {Math.round(m.score * 100)}%
                                  </span>
                                  <span className="mt-0.5 block truncate font-mono text-[10px] text-slate-400">
                                    {m.className}
                                  </span>
                                </span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {error ? (
                <p className="text-xs text-red-600">{error}</p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-4 py-3">
              {!preset ? (
                <>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={saving || !name.trim()}
                    onClick={() => void savePreset()}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                  >
                    {saving ? "Scanning…" : "Save & scan"}
                  </button>
                </>
              ) : matches.length ? (
                <>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
                  >
                    Skip
                  </button>
                  <button
                    type="button"
                    disabled={applying || selected.size === 0}
                    onClick={() => void replaceSelected()}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                  >
                    {applying
                      ? "Replacing…"
                      : `Replace ${selected.size} element${selected.size === 1 ? "" : "s"}`}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white"
                >
                  Done
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function tagLabel(tag: string) {
  const t = tag.toLowerCase();
  if (t === "a") return "Link";
  if (t === "button") return "Button";
  if (/^h[1-6]$/.test(t)) return "Heading";
  if (t === "img") return "Image";
  return t ? t[0].toUpperCase() + t.slice(1) : "Style";
}
