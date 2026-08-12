"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Template = { id: string; name: string };
type TemplateSet = { id: string; name: string; templates: Template[] };
type Language = { id: string; name: string; code: string };
type Site = {
  id: string;
  name: string;
  languages: Language[];
  templateSets: TemplateSet[];
};

export function CreatePageForm({ site }: { site: Site | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const templates = useMemo(
    () => site?.templateSets.flatMap((ts) => ts.templates) || [],
    [site],
  );
  const languages = site?.languages || [];

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!site) return;
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteId: site.id,
        languageId: form.get("languageId"),
        templateId: form.get("templateId") || null,
        title: form.get("title"),
        slug: form.get("slug"),
        menuTitle: form.get("menuTitle") || undefined,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(
        typeof data.error === "string"
          ? data.error
          : "Could not create page",
      );
      return;
    }
    const page = await res.json();
    router.push(`/admin/pages/${page.id}`);
    router.refresh();
  }

  if (!site) {
    return (
      <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-4 py-3">
        Select a website in the top bar first.
      </p>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4"
    >
      <h2 className="font-semibold">New page</h2>
      <p className="text-sm text-slate-500">
        Website: <strong className="text-slate-700">{site.name}</strong>
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="space-y-1 text-sm">
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
        <label className="space-y-1 text-sm">
          <span className="text-slate-600">Title</span>
          <input
            name="title"
            required
            className="w-full rounded-lg border border-slate-200 px-3 py-2"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-600">Slug</span>
          <input
            name="slug"
            required
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            placeholder="my-page"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-600">Menu title</span>
          <input
            name="menuTitle"
            className="w-full rounded-lg border border-slate-200 px-3 py-2"
          />
        </label>
        <label className="space-y-1 text-sm sm:col-span-2">
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
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {loading ? "Creating…" : "Create page"}
      </button>
    </form>
  );
}
