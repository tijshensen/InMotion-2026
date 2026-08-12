"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export type SiteOption = {
  id: string;
  name: string;
  slug: string;
  cssFramework: string;
  lastGeneratedAt: string | null;
};

type Props = {
  sites: SiteOption[];
  activeSiteId: string;
  activeSlug: string;
  cssFramework: string;
  lastGeneratedAt: string | null;
};

export function AdminSiteBar({
  sites,
  activeSiteId,
  activeSlug,
  cssFramework,
  lastGeneratedAt,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function onSiteChange(siteId: string) {
    setStatus(null);
    const res = await fetch("/api/sites/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId }),
    });
    if (!res.ok) {
      setStatus("Could not switch site");
      return;
    }
    startTransition(() => {
      router.refresh();
    });
  }

  async function onGenerate() {
    setGenerating(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/sites/${activeSiteId}/generate`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(data.error || "Generate failed");
        return;
      }
      setStatus(
        `Generated ${data.pagesWritten} page(s) → /sites/${data.siteSlug}/`,
      );
      startTransition(() => router.refresh());
    } catch {
      setStatus("Generate failed");
    } finally {
      setGenerating(false);
    }
  }

  const generatedHref = `/sites/${activeSlug}/`;
  const liveHref = `/s/${activeSlug}/`;
  const hasGenerated = Boolean(lastGeneratedAt);

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 bg-slate-950 px-4 py-2.5 text-sm">
      <label className="flex items-center gap-2 text-slate-300">
        <span className="text-[11px] uppercase tracking-wide text-slate-500">
          Website
        </span>
        <select
          value={activeSiteId}
          disabled={pending}
          onChange={(e) => void onSiteChange(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-white min-w-[12rem]"
        >
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-400">
        CSS: {cssFramework || "none"}
      </span>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <a
          href={liveHref}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
        >
          Live preview ↗
        </a>
        <a
          href={hasGenerated ? generatedHref : liveHref}
          target="_blank"
          rel="noreferrer"
          className={[
            "rounded-lg px-2.5 py-1.5 text-xs font-medium",
            hasGenerated
              ? "bg-emerald-600 text-white hover:bg-emerald-500"
              : "border border-slate-700 text-slate-400 hover:bg-slate-800",
          ].join(" ")}
          title={
            hasGenerated
              ? "Open statically generated website"
              : "Generate first to publish static files"
          }
        >
          {hasGenerated ? "Generated website ↗" : "Generated website"}
        </a>
        <button
          type="button"
          disabled={generating}
          onClick={() => void onGenerate()}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-60"
        >
          {generating ? "Generating…" : "Generate site"}
        </button>
      </div>

      {status && (
        <p className="w-full text-[11px] text-slate-400 md:w-auto md:ml-0">
          {status}
          {lastGeneratedAt && !status.startsWith("Generated") && (
            <span className="ml-2 text-slate-600">
              Last: {new Date(lastGeneratedAt).toLocaleString()}
            </span>
          )}
        </p>
      )}
    </div>
  );
}
