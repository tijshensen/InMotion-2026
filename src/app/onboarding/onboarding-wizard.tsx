"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCaughtError, waitForImportJob } from "@/lib/import-error";

const PURPOSES = [
  { id: "product-launch", label: "Product launch" },
  { id: "event", label: "Event" },
  { id: "local-business", label: "Local business" },
  { id: "portfolio", label: "Portfolio" },
  { id: "restaurant", label: "Restaurant or café" },
  { id: "campaign", label: "Campaign" },
] as const;

type BuildResult = { siteId: string; pageId: string };
type ImportMode = "clone" | "inspired";

export function OnboardingWizard({ defaultBrief }: { defaultBrief: string }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [sourceUrl, setSourceUrl] = useState("");
  const [mode, setMode] = useState<ImportMode>("clone");
  const [brief, setBrief] = useState(defaultBrief);
  const [siteName, setSiteName] = useState("");
  const [purpose, setPurpose] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [build, setBuild] = useState<BuildResult | null>(null);
  const finishing = useRef(false);

  const detailsReady = siteName.trim().length > 0 && Boolean(purpose);

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
    setBuild(null);
    setStep(3);
    try {
      const data = await waitForImportJob<{
        siteId?: string;
        pageId?: string;
      }>("/api/onboarding/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          sourceUrl: sourceUrl.trim(),
          brief: mode === "inspired" ? brief.trim() : undefined,
          mode,
        }),
      });
      if (!data.siteId || !data.pageId) {
        throw new Error("Build finished but no page was returned.");
      }
      setBuild({ siteId: data.siteId, pageId: data.pageId });
    } catch (e) {
      setBusy(false);
      setStep(2);
      setError(formatCaughtError(e, "Could not build the site"));
    }
  }

  useEffect(() => {
    if (!build || !detailsReady || finishing.current) return;
    finishing.current = true;
    const name = siteName.trim();
    const why = purpose || "";
    void (async () => {
      try {
        await fetch(`/api/sites/${build.siteId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            name,
            siteTitle: name,
            purpose: why,
          }),
        });
      } catch {
        // Draft is still usable if the name save fails.
      }
      router.push(`/admin/pages/${build.pageId}`);
      router.refresh();
    })();
  }, [build, detailsReady, purpose, router, siteName]);

  return (
    <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
      {step === 1 ? (
        <>
          <div>
            <h2 className="text-lg font-medium text-slate-900">
              What&apos;s the website URL?
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Paste your current site, or a page you like as a starting point.
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
              How should we use this page?
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              You can keep the look as-is, or treat it as a sketch for a new
              page.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setMode("clone")}
              className={`rounded-xl border p-4 text-left text-sm ${
                mode === "clone"
                  ? "border-blue-600 bg-blue-50"
                  : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <span className="block font-medium text-slate-900">
                Keep it looking the same
              </span>
              <span className="mt-1 block text-xs text-slate-600">
                Best if you already have a site (WordPress, etc.) and just want
                to edit it here.
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMode("inspired")}
              className={`rounded-xl border p-4 text-left text-sm ${
                mode === "inspired"
                  ? "border-blue-600 bg-blue-50"
                  : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <span className="block font-medium text-slate-900">
                Use it as a starting point
              </span>
              <span className="mt-1 block text-xs text-slate-600">
                For a new landing or sales page inspired by this URL.
              </span>
            </button>
          </div>
          {mode === "inspired" ? (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-800">
                Anything we should keep or change?
              </span>
              <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
          ) : (
            <p className="text-sm text-slate-600">
              We&apos;ll copy the layout, styles, and images. You can change
              text in the editor after.
            </p>
          )}
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
              {mode === "clone" ? "Copy my site" : "Build my site"}
            </button>
          </div>
        </>
      ) : null}

      {step === 3 ? (
        <div className="space-y-5">
          <div>
            <p className="text-lg font-medium text-slate-900">
              {build
                ? "Draft is ready"
                : "Building your first draft…"}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {build
                ? "Last bits — then we open the editor."
                : mode === "clone"
                  ? "Copying styles and images. This is usually quick."
                  : "This can take a minute. Meanwhile, tell us about your site."}
            </p>
          </div>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-800">
              What is the website called?
            </span>
            <input
              type="text"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder="Acme Studio"
              maxLength={120}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
              autoFocus
            />
          </label>

          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-800">
              What is it for?
            </p>
            <div className="grid grid-cols-2 gap-2">
              {PURPOSES.map((opt) => {
                const selected = purpose === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPurpose(opt.id)}
                    className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                      selected
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {detailsReady && !build ? (
            <p className="text-sm text-slate-500">
              Thanks — finishing your draft in the background.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
