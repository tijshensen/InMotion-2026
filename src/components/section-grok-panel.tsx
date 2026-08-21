"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatCaughtError, waitForImportJob } from "@/lib/import-error";
import type { PageSection } from "@/components/visual-page-builder";

type VersionLite = {
  id: string;
  source: string;
  prompt: string;
  summary: string;
  createdAt: string;
};

type SuggestGap = { title: string; detail: string };

type SuggestResult = {
  gaps: SuggestGap[];
  prompts: string[];
  notice: string;
  hasOriginal?: boolean;
};

type Props = {
  pageId: string;
  section: PageSection;
  /** Changes when the canvas Improve button is clicked for this section. */
  autoSuggestKey?: string;
  onApplied: (patch: { content: string; css: string; js: string }) => void;
};

function sourceLabel(source: string) {
  if (source === "scrape") return "Original";
  if (source === "restore") return "Restore";
  return "Grok";
}

function timeLabel(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function chipLabel(prompt: string) {
  if (prompt.length <= 88) return prompt;
  return prompt.slice(0, 85) + "…";
}

export function SectionGrokPanel({
  pageId,
  section,
  autoSuggestKey = "",
  onApplied,
}: Props) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionLite[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestResult | null>(null);
  const suggestReq = useRef(0);

  const loadVersions = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/pages/${pageId}/sections/${section.id}/versions`,
        { credentials: "same-origin" },
      );
      if (!res.ok) return;
      const data = (await res.json()) as { versions?: VersionLite[] };
      setVersions(data.versions || []);
    } catch {
      /* ignore */
    }
  }, [pageId, section.id]);

  const loadSuggestions = useCallback(async () => {
    const id = ++suggestReq.current;
    setSuggesting(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(
        `/api/pages/${pageId}/sections/${section.id}/suggest`,
        { method: "POST", credentials: "same-origin" },
      );
      const data = (await res.json().catch(() => ({}))) as SuggestResult & {
        error?: string;
      };
      if (id !== suggestReq.current) return;
      if (!res.ok) {
        throw new Error(
          data.error || `Could not review this section (HTTP ${res.status})`,
        );
      }
      setSuggestions({
        gaps: Array.isArray(data.gaps) ? data.gaps : [],
        prompts: Array.isArray(data.prompts) ? data.prompts : [],
        notice: data.notice || "",
        hasOriginal: data.hasOriginal,
      });
    } catch (err) {
      if (id !== suggestReq.current) return;
      setError(formatCaughtError(err, "Could not review this section"));
    } finally {
      if (id === suggestReq.current) setSuggesting(false);
    }
  }, [pageId, section.id]);

  useEffect(() => {
    void loadVersions();
  }, [loadVersions]);

  useEffect(() => {
    setPrompt("");
    setSuggestions(null);
    setError(null);
    setStatus(null);
  }, [section.id]);

  useEffect(() => {
    if (!autoSuggestKey) return;
    void loadSuggestions();
  }, [autoSuggestKey, loadSuggestions]);

  async function onImprove(e: React.FormEvent) {
    e.preventDefault();
    if (prompt.trim().length < 4 || busy || suggesting) return;
    setBusy(true);
    setError(null);
    setStatus("Grok is rewriting this section…");
    try {
      const result = await waitForImportJob<{
        section?: { content?: string; css?: string; js?: string };
        summary?: string;
        versions?: VersionLite[];
      }>(`/api/pages/${pageId}/sections/${section.id}/improve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      if (result.section) {
        onApplied({
          content: result.section.content || section.content,
          css: result.section.css ?? section.css,
          js: result.section.js ?? section.js ?? "",
        });
      }
      if (result.versions) setVersions(result.versions);
      else void loadVersions();
      setStatus(result.summary || "Section updated.");
      setShowHistory(true);
    } catch (err) {
      setError(formatCaughtError(err, "Grok could not update this section"));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  async function onRestore(versionId: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setStatus("Restoring…");
    try {
      const res = await fetch(
        `/api/pages/${pageId}/sections/${section.id}/versions/${versionId}/restore`,
        { method: "POST", credentials: "same-origin" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        section?: { content?: string; css?: string; js?: string };
        versions?: VersionLite[];
      };
      if (!res.ok) throw new Error(data.error || "Restore failed");
      if (data.section) {
        onApplied({
          content: data.section.content || section.content,
          css: data.section.css ?? section.css,
          js: data.section.js ?? "",
        });
      }
      if (data.versions) setVersions(data.versions);
      setStatus("Restored previous version.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  const locked = busy || suggesting;

  return (
    <div className="space-y-3 border-b border-slate-800 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wide text-slate-500">
          Improve with Grok
        </p>
        <button
          type="button"
          disabled={locked}
          onClick={() => void loadSuggestions()}
          className="text-[11px] font-medium text-blue-400 hover:underline disabled:opacity-40"
        >
          {suggesting ? "Reviewing…" : "Suggest prompts"}
        </button>
      </div>

      {suggesting && (
        <p className="text-xs text-slate-400">
          Comparing fields, repeats, and the original…
        </p>
      )}

      {suggestions && !suggesting && (
        <div className="space-y-2">
          {suggestions.notice ? (
            <p className="text-xs text-slate-400">{suggestions.notice}</p>
          ) : null}
          {suggestions.gaps.length > 0 && (
            <ul className="space-y-1">
              {suggestions.gaps.map((g, i) => (
                <li key={`${g.title}-${i}`} className="text-xs text-slate-300">
                  <span className="font-medium text-slate-200">{g.title}.</span>{" "}
                  {g.detail}
                </li>
              ))}
            </ul>
          )}
          {suggestions.prompts.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {suggestions.prompts.map((p, i) => (
                <button
                  key={`${i}-${p.slice(0, 24)}`}
                  type="button"
                  disabled={locked}
                  title={p}
                  onClick={() => setPrompt(p)}
                  className={[
                    "rounded-lg border px-2.5 py-1.5 text-left text-[11px] leading-snug",
                    prompt === p
                      ? "border-blue-500 bg-blue-950/50 text-slate-100"
                      : "border-slate-700 bg-slate-800/80 text-slate-200 hover:border-slate-500",
                  ].join(" ")}
                >
                  {chipLabel(p)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <form onSubmit={(e) => void onImprove(e)} className="space-y-2">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={busy}
          rows={3}
          placeholder="e.g. Restore the monthly/yearly price toggle from the original site"
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
        />
        <button
          type="submit"
          disabled={locked || prompt.trim().length < 4}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {busy ? "Working…" : "Ask Grok"}
        </button>
      </form>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {status && !error && <p className="text-xs text-emerald-400">{status}</p>}

      <div>
        <button
          type="button"
          onClick={() => {
            setShowHistory((v) => !v);
            if (!showHistory) void loadVersions();
          }}
          className="text-xs text-slate-400 hover:text-slate-200"
        >
          {showHistory ? "Hide history" : `Version history${versions.length ? ` (${versions.length})` : ""}`}
        </button>
        {showHistory && (
          <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
            {versions.length === 0 && (
              <li className="text-xs text-slate-500">
                No snapshots yet. The original is saved on the first Grok run.
              </li>
            )}
            {versions.map((v) => (
              <li
                key={v.id}
                className="rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 py-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-slate-200">
                      {sourceLabel(v.source)}
                      <span className="ml-2 font-normal text-slate-500">
                        {timeLabel(v.createdAt)}
                      </span>
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {v.summary || v.prompt || "—"}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onRestore(v.id)}
                    className="shrink-0 text-[11px] font-medium text-blue-400 hover:underline disabled:opacity-40"
                  >
                    Restore
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
