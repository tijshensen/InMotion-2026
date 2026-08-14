"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MediaPicker, type MediaItem } from "@/components/media-picker";
import {
  pagesDevUrl,
  pagesProjectError,
} from "@/lib/pages-project-name";

type Org = { id: string; name: string; slug: string };

type SiteCard = {
  id: string;
  name: string;
  siteTitle: string;
  logoPath: string;
  slug: string;
  domain: string | null;
  cssFramework: string;
  themeSlug: string;
  lastGeneratedAt: string | null;
  cloudflareProject: string;
  cloudflareUrl: string;
  organizationName: string | null;
  pageCount: number;
  memberCount: number;
  insertCount: number;
  languages: string;
};

type CloudflareStatus = {
  configured: boolean;
  ok: boolean;
  accountIdSuffix: string;
  projectCount: number | null;
  error: string | null;
};

type Props = {
  sites: SiteCard[];
  canCreate: boolean;
  isSuperadmin: boolean;
  importPrompt: string;
  hasXaiKey: boolean;
  hasCloudflare: boolean;
  cloudflare: CloudflareStatus;
  organizations: Org[];
};

export function SitesAdminClient({
  sites,
  canCreate,
  isSuperadmin,
  importPrompt,
  hasXaiKey,
  cloudflare,
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Websites</h1>
          <p className="text-slate-500 mt-1 text-sm max-w-2xl">
            Set the public title, logo, and the Cloudflare project name used in
            the live URL.
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
              className="text-sm text-slate-600 hover:text-slate-900"
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
              className="text-sm font-medium text-blue-700 hover:text-blue-900"
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

      {cloudflare.ok ? (
        <p className="text-xs text-slate-400">
          Cloudflare connected · …{cloudflare.accountIdSuffix}
          {cloudflare.projectCount != null
            ? ` · ${cloudflare.projectCount} project(s)`
            : ""}
        </p>
      ) : cloudflare.configured ? (
        <p className="text-xs text-red-600">
          Cloudflare API check failed: {cloudflare.error}
        </p>
      ) : (
        <p className="text-xs text-slate-400">
          Cloudflare Pages is not configured yet.
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
              <code className="text-xs">.env</code> then restart the server.
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
                onChange={(e) => setName(e.target.value)}
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
                  setCssFramework(e.target.value as typeof cssFramework)
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
          <SiteEditor key={site.id} site={site} />
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

function SiteEditor({ site }: { site: SiteCard }) {
  const router = useRouter();
  const [title, setTitle] = useState(site.siteTitle || site.name);
  const [project, setProject] = useState(
    site.cloudflareProject || site.slug,
  );
  const [logo, setLogo] = useState(site.logoPath || "");
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mediaOpen, setMediaOpen] = useState(false);

  useEffect(() => {
    setTitle(site.siteTitle || site.name);
    setProject(site.cloudflareProject || site.slug);
    setLogo(site.logoPath || "");
  }, [site.siteTitle, site.name, site.cloudflareProject, site.slug, site.logoPath]);

  const projectErr = pagesProjectError(project);
  const liveProject = (project.trim() || site.slug).toLowerCase();
  const previewUrl = pagesDevUrl(liveProject);

  async function patch(body: Record<string, string>, field: string) {
    setSaving(field);
    setError(null);
    setSaved(null);
    try {
      const res = await fetch(`/api/sites/${site.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save");
      setSaved(field);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(null);
    }
  }

  async function saveTitle() {
    const next = title.trim();
    if (!next) {
      setError("Website title cannot be empty");
      return;
    }
    if (next === (site.siteTitle || site.name)) return;
    await patch({ siteTitle: next, name: next }, "title");
  }

  async function saveProject() {
    const next = project.trim().toLowerCase();
    const invalid = pagesProjectError(next);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (next === (site.cloudflareProject || site.slug)) return;
    await patch({ cloudflareProject: next }, "project");
  }

  async function focusSite() {
    await fetch("/api/sites/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId: site.id }),
    });
    router.push("/admin/pages");
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="shrink-0">
          <button
            type="button"
            onClick={() => setMediaOpen(true)}
            className="group relative h-20 w-28 overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
            title="Change logo"
          >
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logo}
                alt=""
                className="h-full w-full object-contain p-1"
              />
            ) : (
              <span className="flex h-full items-center justify-center px-2 text-center text-[11px] text-slate-400">
                Add logo
              </span>
            )}
            <span className="absolute inset-x-0 bottom-0 bg-slate-900/60 py-0.5 text-center text-[10px] text-white opacity-0 group-hover:opacity-100">
              Change
            </span>
          </button>
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wide text-slate-400">
              Website title
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => void saveTitle()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  (e.currentTarget as HTMLInputElement).blur();
                }
              }}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium"
              placeholder="Shown in the header and browser tab"
            />
          </label>

          <div>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-slate-400">
                Project name
              </span>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <input
                  value={project}
                  onChange={(e) => {
                    setProject(e.target.value);
                    setError(null);
                  }}
                  onBlur={() => void saveProject()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      (e.currentTarget as HTMLInputElement).blur();
                    }
                  }}
                  spellCheck={false}
                  className={[
                    "min-w-[12rem] flex-1 rounded-lg border px-3 py-2 font-mono text-sm",
                    projectErr
                      ? "border-red-300 bg-red-50"
                      : "border-slate-200",
                  ].join(" ")}
                  placeholder={site.slug}
                  aria-invalid={Boolean(projectErr)}
                />
                <span className="text-xs text-slate-400">.pages.dev</span>
              </div>
            </label>
            {projectErr ? (
              <p className="mt-1 text-xs text-red-600">{projectErr}</p>
            ) : (
              <p className="mt-1 text-xs text-slate-400">
                Live URL{" "}
                <span className="font-mono text-slate-500">{previewUrl}</span>
                {site.domain ? ` · ${site.domain}` : ""}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <button
              type="button"
              onClick={() => void focusSite()}
              className="text-blue-700 hover:underline"
            >
              Pages
            </button>
            <Link
              href={`/s/${site.slug}`}
              target="_blank"
              className="hover:underline"
            >
              Preview
            </Link>
            {site.cloudflareUrl && (
              <a
                href={site.cloudflareUrl}
                target="_blank"
                rel="noreferrer"
                className="hover:underline"
              >
                Cloudflare
              </a>
            )}
            {site.organizationName && (
              <span className="text-slate-400">{site.organizationName}</span>
            )}
            {saving && <span className="text-slate-400">Saving…</span>}
            {!saving && saved && <span className="text-emerald-600">Saved</span>}
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </div>

      {mediaOpen && (
        <MediaPicker
          open
          siteId={site.id}
          acceptKinds="image"
          onClose={() => setMediaOpen(false)}
          onSelect={(asset: MediaItem) => {
            const path = asset.path || "";
            setLogo(path);
            setMediaOpen(false);
            void patch({ logoPath: path }, "logo");
          }}
        />
      )}
    </div>
  );
}
