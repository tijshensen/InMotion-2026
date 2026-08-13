"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  frameworkLabel,
  normalizeFramework,
  slugifyPage,
  type CssFramework,
} from "@/lib/detect-css-framework";

type Template = { id: string; name: string };
type TemplateSet = { id: string; name: string; templates: Template[] };
type Language = { id: string; name: string; code: string };
type Site = {
  id: string;
  name: string;
  languages: Language[];
  templateSets: TemplateSet[];
};

type Preview = {
  sourceUrl: string;
  sourceFramework: CssFramework;
  siteFramework: CssFramework;
  match: boolean;
  needsRewrite: boolean;
  guessedTitle: string;
  evidence: string[];
  confidence: "high" | "medium" | "low";
};

export function CreatePageSlide({
  site,
  cssFramework,
}: {
  site: Site | null;
  cssFramework: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [fromUrl, setFromUrl] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [menuTitle, setMenuTitle] = useState("");

  const templates = useMemo(
    () => site?.templateSets.flatMap((ts) => ts.templates) || [],
    [site],
  );
  const languages = site?.languages || [];
  const siteFw = normalizeFramework(cssFramework);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !loading) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, loading]);

  function reset() {
    setError(null);
    setLoading(false);
    setChecking(false);
    setFromUrl(false);
    setSourceUrl("");
    setPreview(null);
    setTitle("");
    setSlug("");
    setSlugTouched(false);
    setMenuTitle("");
  }

  function close() {
    if (loading) return;
    setOpen(false);
    reset();
  }

  function onTitleChange(value: string) {
    setTitle(value);
    if (!slugTouched) setSlug(slugifyPage(value));
  }

  async function checkUrl() {
    if (!site || !sourceUrl.trim()) return;
    setChecking(true);
    setError(null);
    setPreview(null);
    try {
      const res = await fetch("/api/pages/import-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: site.id, sourceUrl: sourceUrl.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not check URL");
      const next = data as Preview;
      setPreview(next);
      if (!title && next.guessedTitle) {
        onTitleChange(next.guessedTitle);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check URL");
    } finally {
      setChecking(false);
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!site) return;
    setError(null);

    if (fromUrl && sourceUrl.trim()) {
      if (!preview || preview.sourceUrl !== sourceUrl.trim()) {
        await checkUrl();
        return;
      }
      setLoading(true);
      try {
        const form = new FormData(e.currentTarget);
        const res = await fetch("/api/pages/import-from-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            siteId: site.id,
            languageId: form.get("languageId"),
            templateId: form.get("templateId") || null,
            title: title || undefined,
            slug: slug || undefined,
            menuTitle: menuTitle || undefined,
            sourceUrl: sourceUrl.trim(),
            rewrite: preview.needsRewrite,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 409 && data.preview) {
          setPreview(data.preview);
          setLoading(false);
          return;
        }
        if (!res.ok) throw new Error(data.error || "Could not import page");
        router.push(`/admin/pages/${data.pageId}`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not import page");
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteId: site.id,
        languageId: form.get("languageId"),
        templateId: form.get("templateId") || null,
        title,
        slug,
        menuTitle: menuTitle || undefined,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(
        typeof data.error === "string" ? data.error : "Could not create page",
      );
      return;
    }
    const page = await res.json();
    router.push(`/admin/pages/${page.id}`);
    router.refresh();
  }

  const importReady = Boolean(preview && preview.sourceUrl === sourceUrl.trim());
  const submitLabel = loading
    ? fromUrl
      ? preview?.needsRewrite
        ? "Rewriting…"
        : "Importing…"
      : "Creating…"
    : !fromUrl
      ? "Create page"
      : !importReady
        ? "Check URL"
        : preview?.needsRewrite
          ? "Rewrite & create page"
          : "Create page from URL";

  return (
    <>
      <button
        type="button"
        disabled={!site}
        onClick={() => setOpen(true)}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        New page
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[56] bg-slate-900/30"
          style={{ top: "var(--admin-header-h, 56px)" }}
          onClick={close}
        />
      )}

      <aside
        className={[
          "fixed right-0 z-[57] flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-200 ease-out",
          "bottom-0",
          open ? "translate-x-0" : "translate-x-full pointer-events-none",
        ].join(" ")}
        style={{ top: "var(--admin-header-h, 56px)" }}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 shrink-0">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-400">
              Pages
            </p>
            <h3 className="font-semibold text-slate-900">Create page</h3>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        {!site ? (
          <p className="m-4 text-sm text-amber-800 bg-amber-50 rounded-lg px-4 py-3">
            Select a website in the top bar first.
          </p>
        ) : (
          <form
            onSubmit={onSubmit}
            className="flex-1 overflow-y-auto p-4 space-y-4"
          >
            <p className="text-sm text-slate-500">
              Website:{" "}
              <strong className="text-slate-700">{site.name}</strong>
              <span className="text-slate-400">
                {" "}
                · {frameworkLabel(siteFw)}
              </span>
            </p>

            <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={fromUrl}
                onChange={(e) => {
                  setFromUrl(e.target.checked);
                  setPreview(null);
                  setError(null);
                }}
              />
              <span>
                <span className="font-medium text-slate-800">
                  Start from a URL
                </span>
                <span className="block text-xs text-slate-500 mt-0.5">
                  Paste a public page. We check its CSS framework before
                  importing the content into this site.
                </span>
              </span>
            </label>

            {fromUrl && (
              <div className="space-y-2">
                <label className="space-y-1 text-sm block">
                  <span className="text-slate-600">Page URL</span>
                  <input
                    type="url"
                    value={sourceUrl}
                    onChange={(e) => {
                      setSourceUrl(e.target.value);
                      setPreview(null);
                    }}
                    placeholder="https://example.com/about"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2"
                    required={fromUrl}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void checkUrl()}
                  disabled={checking || !sourceUrl.trim()}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {checking ? "Checking…" : "Check framework"}
                </button>

                {preview && (
                  <div
                    className={[
                      "rounded-lg border px-3 py-2 text-sm",
                      preview.needsRewrite
                        ? "border-amber-200 bg-amber-50 text-amber-950"
                        : "border-emerald-200 bg-emerald-50 text-emerald-950",
                    ].join(" ")}
                  >
                    {preview.needsRewrite ? (
                      <>
                        <p className="font-medium">Different CSS framework</p>
                        <p className="mt-1 text-xs leading-relaxed">
                          That page looks like{" "}
                          <strong>
                            {frameworkLabel(preview.sourceFramework)}
                          </strong>
                          . This site uses{" "}
                          <strong>{frameworkLabel(preview.siteFramework)}</strong>
                          . Next we will rewrite the markup so the imported
                          sections match this site — content stays, classes
                          change.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-medium">Same framework</p>
                        <p className="mt-1 text-xs leading-relaxed">
                          Source and site both use{" "}
                          <strong>
                            {frameworkLabel(preview.siteFramework)}
                          </strong>
                          . Classes will be kept; we only split the body into
                          editable sections.
                        </p>
                      </>
                    )}
                    {preview.evidence.length > 0 && (
                      <p className="mt-1 text-[11px] opacity-70">
                        Detected: {preview.evidence.join(" · ")}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            <label className="space-y-1 text-sm block">
              <span className="text-slate-600">Language</span>
              <select
                name="languageId"
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
                defaultValue={languages[0]?.id}
              >
                {languages.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.code})
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm block">
              <span className="text-slate-600">Title</span>
              <input
                name="title"
                required={!fromUrl}
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm block">
              <span className="text-slate-600">Slug</span>
              <input
                name="slug"
                required={!fromUrl}
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value);
                }}
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*"
                placeholder="my-page"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
              />
            </label>
            <label className="space-y-1 text-sm block">
              <span className="text-slate-600">Menu title</span>
              <input
                name="menuTitle"
                value={menuTitle}
                onChange={(e) => setMenuTitle(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm block">
              <span className="text-slate-600">Template</span>
              <select
                name="templateId"
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
                defaultValue={templates[0]?.id || ""}
              >
                <option value="">— none —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading || checking}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {submitLabel}
            </button>
            {fromUrl && importReady && (
              <p className="text-[11px] text-slate-400">
                Import can take up to a minute. Header and footer stay this
                site’s template.
              </p>
            )}
          </form>
        )}
      </aside>
    </>
  );
}
