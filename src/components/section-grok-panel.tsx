"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCaughtError, waitForImportJob } from "@/lib/import-error";
import type { PageSection } from "@/components/visual-page-builder";

type VersionLite = {
  id: string;
  source: string;
  prompt: string;
  summary: string;
  createdAt: string;
};

type Props = {
  pageId: string;
  section: PageSection;
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

export function SectionGrokPanel({ pageId, section, onApplied }: Props) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionLite[]>([]);
  const [showHistory, setShowHistory] = useState(false);

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

  useEffect(() => {
    void loadVersions();
  }, [loadVersions]);

  async function onImprove(e: React.FormEvent) {
    e.preventDefault();
    if (prompt.trim().length < 4 || busy) return;
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

  return (
    <div className="mt-6 space-y-3 border-t border-slate-800 pt-4">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">
        Improve with Grok
      </p>
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
          disabled={busy || prompt.trim().length < 4}
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
