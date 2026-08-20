"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MediaPicker, type MediaItem } from "@/components/media-picker";
import {
  pagesDevUrl,
  pagesProjectError,
} from "@/lib/pages-project-name";
import { formatCaughtError, waitForImportJob } from "@/lib/import-error";

type Org = { id: string; name: string; slug: string };

const LANGUAGE_OPTIONS = [
  { name: "English", code: "en" },
  { name: "Nederlands", code: "nl" },
  { name: "Deutsch", code: "de" },
  { name: "Français", code: "fr" },
  { name: "Español", code: "es" },
];

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
  multiLanguage: boolean;
  languages: { id: string; name: string; code: string; isDefault: boolean }[];
};

type Props = {
  sites: SiteCard[];
  canCreate: boolean;
  isSuperadmin: boolean;
  importPrompt: string;
  hasXaiKey: boolean;
  activeSiteId: string;
  organizations: Org[];
};

export function SitesAdminClient({
  sites,
  canCreate,
  isSuperadmin,
  importPrompt,
  hasXaiKey,
  activeSiteId,
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
  const [importMode, setImportMode] = useState<"clone" | "inspired">("clone");
  const [selectedId, setSelectedId] = useState(activeSiteId);

  useEffect(() => {
    setSelectedId(activeSiteId);
  }, [activeSiteId]);

  async function selectSite(siteId: string) {
    if (siteId === selectedId) return;
    setSelectedId(siteId);
    try {
      const res = await fetch("/api/sites/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      });
      if (!res.ok) throw new Error("Could not switch website");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not switch website");
      setSelectedId(activeSiteId);
    }
  }

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
      const data = await waitForImportJob<{ pageId?: string }>(
        "/api/sites/import-from-url",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            sourceUrl,
            name: name || undefined,
            prompt: importMode === "inspired" ? prompt : undefined,
            savePromptAsDefault: savePrompt,
            mode: importMode,
          }),
        },
      );
      if (data.pageId) {
        router.push(`/admin/pages/${data.pageId}`);
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(formatCaughtError(err, "Could not import site"));
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
            Click a website to work on it. Pages, media, and publish then
            use that site.
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

      {showImport && canCreate && (
        <form
          onSubmit={(e) => void onImport(e)}
          className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 shadow-sm"
        >
          <div>
            <h2 className="font-semibold">Import from a website</h2>
            <p className="text-xs text-slate-500 mt-1">
              Keep the original look, or use the page as a sketch for a new
              Tailwind site.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex cursor-pointer gap-2 rounded-lg border border-slate-200 p-3 text-sm has-[:checked]:border-blue-600 has-[:checked]:bg-blue-50">
              <input
                type="radio"
                name="importMode"
                checked={importMode === "clone"}
                onChange={() => setImportMode("clone")}
              />
              <span>
                <span className="font-medium">Keep it looking the same</span>
                <span className="block text-xs text-slate-500">
                  Copy layout, CSS, and images. No Grok.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer gap-2 rounded-lg border border-slate-200 p-3 text-sm has-[:checked]:border-blue-600 has-[:checked]:bg-blue-50">
              <input
                type="radio"
                name="importMode"
                checked={importMode === "inspired"}
                onChange={() => setImportMode("inspired")}
              />
              <span>
                <span className="font-medium">Use as a starting point</span>
                <span className="block text-xs text-slate-500">
                  Grok rebuilds a Tailwind draft from the page.
                </span>
              </span>
            </label>
          </div>
          {importMode === "inspired" && !hasXaiKey && (
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
            {importMode === "inspired" ? (
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
            ) : null}
          </div>
          {isSuperadmin && importMode === "inspired" && (
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
            disabled={
              importing ||
              !organizationId ||
              (importMode === "inspired" && !hasXaiKey)
            }
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {importing
              ? importMode === "clone"
                ? "Copying site…"
                : "Reading page and generating with Grok…"
              : importMode === "clone"
                ? "Copy this site"
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
          <SiteEditor
            key={site.id}
            site={site}
            selected={site.id === selectedId}
            onSelect={() => void selectSite(site.id)}
          />
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

function SiteEditor({
  site,
  selected,
  onSelect,
}: {
  site: SiteCard;
  selected: boolean;
  onSelect: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(site.siteTitle || site.name);
  const [project, setProject] = useState(
    site.cloudflareProject || site.slug,
  );
  const [logo, setLogo] = useState(site.logoPath || "");
  const [multi, setMulti] = useState(site.multiLanguage);
  const [langs, setLangs] = useState(site.languages);
  const [newLang, setNewLang] = useState("en");
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mediaOpen, setMediaOpen] = useState(false);

  useEffect(() => {
    setTitle(site.siteTitle || site.name);
    setProject(site.cloudflareProject || site.slug);
    setLogo(site.logoPath || "");
    setMulti(site.multiLanguage);
    setLangs(site.languages);
  }, [
    site.siteTitle,
    site.name,
    site.cloudflareProject,
    site.slug,
    site.logoPath,
    site.multiLanguage,
    site.languages,
  ]);

  const projectErr = pagesProjectError(project);
  const liveProject = (project.trim() || site.slug).toLowerCase();
  const previewUrl = pagesDevUrl(liveProject);

  async function addLanguage() {
    const opt = LANGUAGE_OPTIONS.find((o) => o.code === newLang);
    if (!opt) return;
    setSaving("lang");
    setError(null);
    try {
      const res = await fetch(`/api/sites/${site.id}/languages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: opt.name, code: opt.code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not add language");
      setLangs((prev) => [...prev, data]);
      setMulti(true);
      const next = LANGUAGE_OPTIONS.find(
        (o) => o.code !== opt.code && !langs.some((l) => l.code === o.code),
      );
      if (next) setNewLang(next.code);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add language");
    } finally {
      setSaving(null);
    }
  }

  async function patch(
    body: Record<string, string | boolean>,
    field: string,
  ) {
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

  async function openPages() {
    onSelect();
    await fetch("/api/sites/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId: site.id }),
    });
    router.push("/admin/pages");
    router.refresh();
  }

  return (
    <div
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
      className={[
        "rounded-xl border p-5 shadow-sm cursor-pointer transition-colors",
        selected
          ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
          : "border-slate-200 bg-white hover:border-slate-300",
      ].join(" ")}
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
              setMediaOpen(true);
            }}
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
          <div className="flex items-center justify-between gap-2">
            {selected ? (
              <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                Active
              </span>
            ) : (
              <span className="text-[10px] uppercase tracking-wide text-slate-400">
                Click to work on this site
              </span>
            )}
          </div>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wide text-slate-400">
              Website title
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onFocus={onSelect}
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
                  onClick={(e) => e.stopPropagation()}
                  onFocus={onSelect}
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

          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={multi}
              onChange={(e) => {
                const on = e.target.checked;
                setMulti(on);
                void patch({ multiLanguage: on }, "multi");
              }}
              onClick={(e) => e.stopPropagation()}
              className="mt-0.5"
            />
            <span>
              Enable multilingual
              <span className="block text-xs font-normal text-slate-400">
                Pages and menus can have a separate version per language
              </span>
            </span>
          </label>

          {multi && (
            <div
              className="rounded-lg border border-slate-200 bg-white/70 px-3 py-2 space-y-2"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-[11px] uppercase tracking-wide text-slate-400">
                Languages
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {langs.map((l) => (
                  <li
                    key={l.id}
                    className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                  >
                    {l.name} ({l.code})
                    {l.isDefault ? " · default" : ""}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={newLang}
                  onChange={(e) => setNewLang(e.target.value)}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                >
                  {LANGUAGE_OPTIONS.filter(
                    (o) => !langs.some((l) => l.code === o.code),
                  ).map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.name} ({o.code})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={
                    saving === "lang" ||
                    !LANGUAGE_OPTIONS.some(
                      (o) => o.code === newLang && !langs.some((l) => l.code === o.code),
                    )
                  }
                  onClick={() => void addLanguage()}
                  className="text-xs font-medium text-blue-700 hover:underline disabled:opacity-40"
                >
                  {saving === "lang" ? "Adding…" : "Add language"}
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void openPages();
              }}
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
