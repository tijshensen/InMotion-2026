"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { formatInsertHtml, normalizeInsertHtml } from "@/lib/insert-html";
import { HtmlCodeEditor } from "@/components/html-code-editor";

type Site = { id: string; name: string; slug: string };

type InsertRow = {
  id: string;
  siteId: string;
  tag: string;
  content: string;
  onlyInRender: boolean;
  site?: Site;
};

type Props = {
  siteId: string;
  siteName: string;
};

type FormState = {
  id?: string;
  siteId: string;
  tag: string;
  content: string;
  onlyInRender: boolean;
};

const emptyForm = (siteId: string): FormState => ({
  siteId,
  tag: "",
  content: "",
  onlyInRender: false,
});

/** Display tag only (no {{insert:…}}); truncate long tags as [prefix…] */
function formatTagLabel(tag: string, maxLen = 28) {
  const t = tag.trim();
  if (!t) return "—";
  if (t.length <= maxLen) return t;
  // Prefer keeping bracket style: [VERYLONGNAME] → [VERYLONG…]
  if (t.startsWith("[") && t.endsWith("]")) {
    const inner = t.slice(1, -1);
    const keep = Math.max(8, maxLen - 3);
    return `[${inner.slice(0, keep)}…]`;
  }
  return `${t.slice(0, maxLen - 1)}…`;
}

export function InsertsAdminClient({ siteId, siteName }: Props) {
  const [q, setQ] = useState("");
  const [inserts, setInserts] = useState<InsertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/inserts?siteId=${encodeURIComponent(siteId)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load inserts");
      const data = (await res.json()) as InsertRow[];
      setInserts(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
      setInserts([]);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!q.trim()) return inserts;
    const needle = q.toLowerCase();
    return inserts.filter(
      (i) =>
        i.tag.toLowerCase().includes(needle) ||
        i.content.toLowerCase().includes(needle),
    );
  }, [inserts, q]);

  function openCreate() {
    setError(null);
    setStatus(null);
    setForm(emptyForm(siteId));
  }

  function openEdit(row: InsertRow) {
    setError(null);
    setStatus(null);
    setForm({
      id: row.id,
      siteId: row.siteId,
      tag: row.tag,
      content: formatInsertHtml(row.content),
      onlyInRender: row.onlyInRender,
    });
    // Scroll form into view after paint
    requestAnimationFrame(() => {
      document
        .getElementById("insert-edit-form")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function closeForm() {
    setForm(null);
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setError(null);
    setStatus(null);

    try {
      if (form.id) {
        const res = await fetch(`/api/inserts/${form.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            siteId: form.siteId,
            tag: form.tag,
            content: normalizeInsertHtml(form.content),
            onlyInRender: form.onlyInRender,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(
            typeof data.error === "string" ? data.error : "Update failed",
          );
          return;
        }
        setInserts((prev) =>
          prev.map((i) => (i.id === form.id ? (data as InsertRow) : i)),
        );
        setStatus("Insert updated");
      } else {
        const res = await fetch("/api/inserts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            siteId: form.siteId,
            tag: form.tag,
            content: normalizeInsertHtml(form.content),
            onlyInRender: form.onlyInRender,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(
            typeof data.error === "string" ? data.error : "Create failed",
          );
          return;
        }
        setInserts((prev) =>
          [...prev, data as InsertRow].sort((a, b) =>
            a.tag.localeCompare(b.tag),
          ),
        );
        setStatus("Insert created");
      }
      setForm(null);
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(row: InsertRow) {
    if (
      !confirm(
        `Delete insert "${row.tag}"? Templates using {{insert:${row.tag}}} will show empty.`,
      )
    ) {
      return;
    }
    setBusyId(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/inserts/${row.id}`, { method: "DELETE" });
      if (!res.ok) {
        setError("Delete failed");
        return;
      }
      setInserts((prev) => prev.filter((i) => i.id !== row.id));
      if (form?.id === row.id) setForm(null);
      setStatus("Insert deleted");
    } finally {
      setBusyId(null);
    }
  }

  async function onCopy(row: InsertRow) {
    setBusyId(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/inserts/${row.id}/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: row.siteId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Copy failed");
        return;
      }
      const created = data as InsertRow;
      setInserts((prev) =>
        [...prev, created].sort((a, b) => a.tag.localeCompare(b.tag)),
      );
      setStatus(`Copied as ${created.tag}`);
      openEdit(created);
    } finally {
      setBusyId(null);
    }
  }

  if (!siteId) {
    return (
      <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-4 py-3">
        Select a website in the top bar first.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm space-y-1 flex-1 min-w-[12rem]">
          <span className="text-slate-600">Search</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tag or content…"
            className="block w-full rounded-lg border border-slate-200 px-3 py-2 bg-white"
          />
        </label>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + New insert
        </button>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
        >
          Refresh
        </button>
        <p className="text-sm text-slate-500 pb-2">
          {loading
            ? "Loading…"
            : `${filtered.length} insert${filtered.length === 1 ? "" : "s"}`}
        </p>
      </div>

      {(status || error) && (
        <p
          className={
            error
              ? "text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2"
              : "text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2"
          }
        >
          {error || status}
        </p>
      )}

      {form && (
        <form
          id="insert-edit-form"
          onSubmit={onSubmit}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-slate-900">
              {form.id ? "Edit insert" : "New insert"}
            </h2>
            <button
              type="button"
              onClick={closeForm}
              className="text-sm text-slate-500 hover:text-slate-800"
            >
              Cancel
            </button>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <label className="text-sm space-y-1">
              <span className="text-slate-600">Website</span>
              <input
                type="text"
                readOnly
                value={siteName}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 bg-slate-50 text-slate-600"
              />
            </label>
            <label className="text-sm space-y-1">
              <span className="text-slate-600">Tag</span>
              <input
                value={form.tag}
                onChange={(e) =>
                  setForm((f) => f && { ...f, tag: e.target.value })
                }
                required
                placeholder="footer or [PRIJZENBSO]"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm bg-white"
              />
              <span className="text-[11px] text-slate-400">
                Token in templates:{" "}
                <code className="bg-slate-100 px-1 rounded">
                  {"{{insert:" + (form.tag.trim() || "tag") + "}}"}
                </code>
              </span>
            </label>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Content (HTML)</span>
              <span className="text-[11px] text-slate-400">
                Code editor · HTML
              </span>
            </div>
            <HtmlCodeEditor
              value={form.content}
              onChange={(content) =>
                setForm((f) => f && { ...f, content })
              }
              minHeight="280px"
              placeholder="<!-- HTML snippet -->"
            />
          </div>

          {/* Live HTML preview — same content as the public insert render */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Live preview</span>
              <span className="text-[11px] text-slate-400">
                How this insert renders on the site
              </span>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
              <div className="border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-500 font-mono">
                {"{{insert:" + (form.tag.trim() || "tag") + "}}"}
              </div>
              <div
                className="insert-live-preview px-4 py-4 prose prose-sm max-w-none text-slate-900
                  [&_table]:w-full [&_table]:border-collapse
                  [&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_td]:py-1.5
                  [&_th]:border [&_th]:border-slate-200 [&_th]:px-2 [&_th]:py-1.5 [&_th]:bg-slate-50
                  [&_.table]:w-full
                  [&_.table-responsive]:overflow-x-auto"
                dangerouslySetInnerHTML={{
                  __html:
                    normalizeInsertHtml(form.content).trim() ||
                    '<p class="text-slate-400 text-sm italic m-0">Empty — type HTML above to preview</p>',
                }}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.onlyInRender}
              onChange={(e) =>
                setForm((f) => f && { ...f, onlyInRender: e.target.checked })
              }
            />
            Only in public render (legacy flag)
          </label>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {saving
                ? "Saving…"
                : form.id
                  ? "Save changes"
                  : "Create insert"}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50 bg-white"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {loading && (
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500 shadow-sm">
            Loading inserts…
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
            No inserts match.{" "}
            <button
              type="button"
              onClick={openCreate}
              className="text-blue-600 underline"
            >
              Create one
            </button>
            .
          </div>
        )}

        {!loading &&
          filtered.map((i) => {
            const html = normalizeInsertHtml(i.content).trim();
            return (
              <article
                key={i.id}
                className={[
                  "rounded-xl border bg-white shadow-sm overflow-hidden",
                  form?.id === i.id
                    ? "border-blue-300 ring-1 ring-blue-100"
                    : "border-slate-200",
                ].join(" ")}
              >
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => openEdit(i)}
                    className="font-mono text-xs font-medium text-blue-700 hover:underline text-left"
                    title={`Edit ${i.tag} · uses {{insert:${i.tag}}}`}
                  >
                    {formatTagLabel(i.tag)}
                  </button>
                  <span className="text-xs text-slate-400">·</span>
                  <span className="text-xs text-slate-500">
                    {i.site?.name || "—"}
                  </span>
                  {i.onlyInRender && (
                    <span className="text-[10px] uppercase text-amber-600">
                      render-only
                    </span>
                  )}
                  <div className="ml-auto flex flex-wrap gap-1">
                    <button
                      type="button"
                      disabled={busyId === i.id}
                      onClick={() => void onCopy(i)}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                    >
                      Copy
                    </button>
                    <button
                      type="button"
                      disabled={busyId === i.id}
                      onClick={() => void onDelete(i)}
                      className="rounded border border-red-100 bg-white px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Live HTML rendering for this insert */}
                <div className="px-4 py-3">
                  {html ? (
                    <div
                      className="insert-list-preview max-h-56 overflow-auto text-sm text-slate-900
                        [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm
                        [&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_td]:py-1.5
                        [&_th]:border [&_th]:border-slate-200 [&_th]:px-2 [&_th]:py-1.5 [&_th]:bg-slate-50
                        [&_.table]:w-full
                        [&_.table-responsive]:overflow-x-auto
                        [&_img]:max-w-full [&_img]:h-auto
                        [&_script]:hidden"
                      dangerouslySetInnerHTML={{ __html: html }}
                    />
                  ) : (
                    <p className="text-sm text-slate-400 italic m-0">
                      Empty insert
                    </p>
                  )}
                </div>
              </article>
            );
          })}
      </div>
    </div>
  );
}
