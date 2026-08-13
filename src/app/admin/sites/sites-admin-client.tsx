"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Org = { id: string; name: string; slug: string };

type SiteCard = {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  cssFramework: string;
  themeSlug: string;
  lastGeneratedAt: string | null;
  organizationName: string | null;
  pageCount: number;
  memberCount: number;
  insertCount: number;
  languages: string;
};

type Props = {
  sites: SiteCard[];
  canCreate: boolean;
  isSuperadmin: boolean;
  importPrompt: string;
  hasXaiKey: boolean;
  organizations: Org[];
};

export function SitesAdminClient({
  sites,
  canCreate,
  isSuperadmin,
  importPrompt,
  hasXaiKey,
  organizations,
}: Props) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [organizationId, setOrganizationId] = useState(
    organizations[0]?.id || "",
  );
  const [cssFramework, setCssFramework] = useState<
    "bootstrap" | "tailwind" | "none" | "custom"
  >("none");
  const [domain, setDomain] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [prompt, setPrompt] = useState(importPrompt);
  const [savePrompt, setSavePrompt] = useState(false);
  const [importing, setImporting] = useState(false);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!organizationId) {
      setError("Select an organization");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          name,
          slug: slug || undefined,
          domain: domain || null,
          cssFramework,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Create failed");
      setShowForm(false);
      setName("");
      setSlug("");
      setDomain("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function onImport(e: React.FormEvent) {
    e.preventDefault();
    if (!organizationId) {
      setError("Select an organization");
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/sites/import-from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          sourceUrl,
          name: name || undefined,
          prompt,
          savePromptAsDefault: savePrompt,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Import failed");
      if (data.pageId) {
        router.push(`/admin/pages/${data.pageId}`);
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  async function focusSite(siteId: string) {
    await fetch("/api/sites/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId }),
    });
    router.push("/admin/pages");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Websites</h1>
          <p className="text-slate-500 mt-1 text-sm max-w-2xl">
            Each site has its own CSS framework, templates, pages, and theme.
            Organization owners can create multiple websites under their
            workspace.
          </p>
        </div>
        {canCreate && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setShowImport((v) => !v);
                setShowForm(false);
                setError(null);
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
            >
              {showImport ? "Cancel" : "Import from URL"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm((v) => !v);
                setShowImport(false);
                setError(null);
              }}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {showForm ? "Cancel" : "New website"}
            </button>
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {showImport && canCreate && (
        <form
          onSubmit={(e) => void onImport(e)}
          className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 shadow-sm"
        >
          <div>
            <h2 className="font-semibold">Import from a website</h2>
            <p className="text-xs text-slate-500 mt-1">
              Grok reads the homepage HTML, then builds a Tailwind Home
              template (header/footer) and named editable sections for the
              canvas.
            </p>
          </div>
          {!hasXaiKey && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Set <code className="text-xs">XAI_API_KEY</code> in{" "}
              <code className="text-xs">.env</code> (from{" "}
              <a
                href="https://console.x.ai"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                console.x.ai
              </a>
              ) then restart the server.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="text-slate-600">Organization</span>
              <select
                required
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              >
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-slate-600">Website URL</span>
              <input
                required
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
                placeholder="https://example.com"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Site name (optional)</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                placeholder="Taken from the source title if empty"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-slate-600">Prompt</span>
              <textarea
                required
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
          </div>
          {isSuperadmin && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={savePrompt}
                onChange={(e) => setSavePrompt(e.target.checked)}
              />
              Save this as the default prompt for next imports
            </label>
          )}
          <button
            type="submit"
            disabled={importing || !hasXaiKey || !organizationId}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {importing
              ? "Reading page and generating with Grok…"
              : "Generate site with Grok"}
          </button>
        </form>
      )}

      {showForm && canCreate && (
        <form
          onSubmit={(e) => void onCreate(e)}
          className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 shadow-sm"
        >
          <h2 className="font-semibold">Create website</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="text-slate-600">Organization</span>
              <select
                required
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              >
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Name</span>
              <input
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slug) {
                    /* leave slug empty to auto */
                  }
                }}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                placeholder="My new site"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Slug (optional)</span>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
                placeholder="auto from name"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Domain (optional)</span>
              <input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                placeholder="www.example.com"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">CSS framework</span>
              <select
                value={cssFramework}
                onChange={(e) =>
                  setCssFramework(
                    e.target.value as typeof cssFramework,
                  )
                }
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              >
                <option value="none">None</option>
                <option value="bootstrap">Bootstrap</option>
                <option value="tailwind">Tailwind</option>
                <option value="custom">Custom</option>
              </select>
            </label>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create website"}
          </button>
        </form>
      )}

      <div className="grid gap-4">
        {sites.map((site) => (
          <div
            key={site.id}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex flex-wrap items-center justify-between gap-4"
          >
            <div>
              <h2 className="font-semibold text-lg">{site.name}</h2>
              <p className="text-sm text-slate-500">
                slug: <code className="text-xs">{site.slug}</code>
                {site.domain ? ` · ${site.domain}` : ""}
              </p>
              {site.organizationName && (
                <p className="text-xs text-slate-400 mt-0.5">
                  Org: {site.organizationName}
                </p>
              )}
              <p className="text-xs text-slate-400 mt-1">
                Framework:{" "}
                <strong className="text-slate-600">
                  {site.cssFramework || "none"}
                </strong>
                {" · "}
                theme:{" "}
                <code className="text-xs">
                  /theme/{site.themeSlug || site.slug}/
                </code>
                {site.lastGeneratedAt
                  ? ` · generated ${new Date(site.lastGeneratedAt).toLocaleString()}`
                  : " · not generated yet"}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {site.pageCount} pages · {site.memberCount} members ·{" "}
                {site.languages} · {site.insertCount} inserts
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/s/${site.slug}`}
                target="_blank"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
              >
                Live ↗
              </Link>
              {site.lastGeneratedAt && (
                <Link
                  href={`/sites/${site.slug}`}
                  target="_blank"
                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 hover:bg-emerald-100"
                >
                  Generated ↗
                </Link>
              )}
              <button
                type="button"
                onClick={() => void focusSite(site.id)}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
              >
                Manage pages
              </button>
            </div>
          </div>
        ))}
        {sites.length === 0 && (
          <p className="text-slate-500 text-sm">
            No websites yet.
            {canCreate
              ? " Create your first site above."
              : " Ask an organization owner for access."}
          </p>
        )}
      </div>
    </div>
  );
}
