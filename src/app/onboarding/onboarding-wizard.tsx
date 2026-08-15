"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function OnboardingWizard({ defaultBrief }: { defaultBrief: string }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [sourceUrl, setSourceUrl] = useState("");
  const [brief, setBrief] = useState(defaultBrief);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function goNext() {
    setError(null);
    try {
      const u = new URL(sourceUrl.trim());
      if (!/^https?:$/.test(u.protocol)) throw new Error("bad");
    } catch {
      setError("Enter a full URL, starting with https://");
      return;
    }
    setStep(2);
  }

  async function startBuild() {
    setError(null);
    setBusy(true);
    setStep(3);
    try {
      const res = await fetch("/api/onboarding/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          sourceUrl: sourceUrl.trim(),
          brief: brief.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Could not build the site",
        );
      }
      router.push(`/admin/pages/${data.pageId}`);
      router.refresh();
    } catch (e) {
      setBusy(false);
      setStep(2);
      setError(e instanceof Error ? e.message : "Could not build the site");
    }
  }

  return (
    <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
      {step === 1 ? (
        <>
          <div>
            <h2 className="text-lg font-medium text-slate-900">
              Which website should yours look like?
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Paste the homepage of a site you like. We&apos;ll use it as the
              starting point.
            </p>
          </div>
          <input
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://example.com"
            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
            autoFocus
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="button"
            onClick={goNext}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Next
          </button>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <div>
            <h2 className="text-lg font-medium text-slate-900">
              Anything we should keep or change?
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Optional. We already have a default brief. Add notes if you want
              a different tone or to keep the original copy.
            </p>
          </div>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={5}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep(1);
              }}
              className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Back
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void startBuild()}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              Build my site
            </button>
          </div>
        </>
      ) : null}

      {step === 3 ? (
        <div className="py-6 text-center space-y-2">
          <p className="text-lg font-medium text-slate-900">
            Building your first draft…
          </p>
          <p className="text-sm text-slate-600">
            This can take a minute. We&apos;re fetching the page and turning it
            into templates in the background.
          </p>
        </div>
      ) : null}
    </div>
  );
}
