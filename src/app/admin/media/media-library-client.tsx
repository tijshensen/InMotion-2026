"use client";

import { useCallback, useRef, useState } from "react";
import { formatBytes } from "@/lib/media-format";

type Asset = {
  id: string;
  filename: string;
  path: string;
  mimeType: string;
  sizeBytes: number;
  alt: string;
  createdAt: string;
};

type Props = {
  siteId: string;
  siteName: string;
  initialAssets: Asset[];
};

export function MediaLibraryClient({
  siteId,
  siteName,
  initialAssets,
}: Props) {
  const [assets, setAssets] = useState(initialAssets);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingAlt, setEditingAlt] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (id: string) => {
    if (!id) {
      setAssets([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/media?siteId=${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error("Failed to load media");
      setAssets(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  async function onUpload(files: FileList | null) {
    if (!files?.length || !siteId) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.set("siteId", siteId);
        form.set("file", file);
        form.set("alt", file.name.replace(/\.[^.]+$/, ""));
        const res = await fetch("/api/media", { method: "POST", body: form });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Upload failed: ${file.name}`);
        }
      }
      await load(siteId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function saveAlt(id: string) {
    const alt = editingAlt[id];
    if (alt === undefined) return;
    const res = await fetch(`/api/media/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alt }),
    });
    if (!res.ok) {
      setError("Could not save alt text");
      return;
    }
    const updated = await res.json();
    setAssets((prev) => prev.map((a) => (a.id === id ? updated : a)));
    setEditingAlt((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this file? It will be removed from disk.")) return;
    const res = await fetch(`/api/media/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Delete failed");
      return;
    }
    setAssets((prev) => prev.filter((a) => a.id !== id));
  }

  function copyUrl(path: string) {
    void navigator.clipboard.writeText(path);
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
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-600 pb-2">
          Library: <strong className="text-slate-800">{siteName}</strong>
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
          multiple
          className="hidden"
          onChange={(e) => void onUpload(e.target.files)}
        />
        <button
          type="button"
          disabled={uploading || !siteId}
          onClick={() => fileRef.current?.click()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {uploading ? "Uploading…" : "Upload images"}
        </button>
        <button
          type="button"
          onClick={() => void load(siteId)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
        >
          Refresh
        </button>
        {error && <p className="text-sm text-red-600 w-full">{error}</p>}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : assets.length === 0 ? (
        <p className="text-sm text-slate-500 rounded-xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
          No media for this site yet.
        </p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {assets.map((asset) => (
            <li
              key={asset.id}
              className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col"
            >
              <div className="aspect-video bg-slate-100 flex items-center justify-center overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={asset.path}
                  alt={asset.alt || asset.filename}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              <div className="p-3 space-y-2 flex-1 flex flex-col">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {asset.filename}
                </p>
                <p className="text-xs text-slate-400">
                  {formatBytes(asset.sizeBytes)} ·{" "}
                  <button
                    type="button"
                    className="text-blue-600 hover:underline"
                    onClick={() => copyUrl(asset.path)}
                    title="Copy public URL"
                  >
                    {asset.path}
                  </button>
                </p>
                <label className="block text-xs space-y-1">
                  <span className="text-slate-500">Alt text</span>
                  <input
                    value={
                      editingAlt[asset.id] !== undefined
                        ? editingAlt[asset.id]
                        : asset.alt
                    }
                    onChange={(e) =>
                      setEditingAlt((prev) => ({
                        ...prev,
                        [asset.id]: e.target.value,
                      }))
                    }
                    onBlur={() => void saveAlt(asset.id)}
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void onDelete(asset.id)}
                  className="mt-auto text-left text-xs text-red-600 hover:underline pt-1"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
