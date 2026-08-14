"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  siteCount: number;
  memberCount: number;
  myRole: string;
  canManage: boolean;
  owners: { id: string; email: string; name: string }[];
  sites: { id: string; name: string; slug: string }[];
};

type Props = {
  currentUserId: string;
  isSuperadmin: boolean;
  canCreate: boolean;
  initialOrgs: OrgRow[];
  open: boolean;
  onClose: () => void;
};

export function OrganizationsAdminClient({
  isSuperadmin,
  canCreate,
  initialOrgs,
  open,
  onClose,
}: Props) {
  const router = useRouter();
  const [orgs, setOrgs] = useState(initialOrgs);
  useEffect(() => {
    setOrgs(initialOrgs);
  }, [initialOrgs]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createSlug, setCreateSlug] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editActive, setEditActive] = useState(true);

  function startEdit(o: OrgRow) {
    setEditingId(o.id);
    setEditName(o.name);
    setEditSlug(o.slug);
    setEditActive(o.isActive);
    setError(null);
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName,
          slug: createSlug || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Create failed");
      setShowCreate(false);
      setCreateName("");
      setCreateSlug("");
      router.refresh();
      setOrgs((prev) => [
        {
          id: data.id,
          name: data.name,
          slug: data.slug,
          isActive: data.isActive ?? true,
          createdAt: new Date().toISOString(),
          siteCount: data._count?.sites ?? 0,
          memberCount: data._count?.members ?? 1,
          myRole: "OWNER",
          canManage: true,
          owners: [],
          sites: [],
        },
        ...prev,
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/organizations/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          slug: editSlug,
          isActive: editActive,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Update failed");
      setOrgs((prev) =>
        prev.map((o) =>
          o.id === editingId
            ? {
                ...o,
                name: data.name,
                slug: data.slug,
                isActive: data.isActive,
              }
            : o,
        ),
      );
      setEditingId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(o: OrgRow) {
    if (!o.canManage) return;
    if (o.siteCount > 0) {
      setError(
        `“${o.name}” still has ${o.siteCount} website(s). Move or delete those sites first.`,
      );
      return;
    }
    if (
      !window.confirm(
        `Delete organization “${o.name}”? This cannot be undone. Members of this org will lose this workspace.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/organizations/${o.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setOrgs((prev) => prev.filter((x) => x.id !== o.id));
      if (editingId === o.id) setEditingId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function onToggleActive(o: OrgRow) {
    if (!o.canManage) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/organizations/${o.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !o.isActive }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Update failed");
      setOrgs((prev) =>
        prev.map((x) =>
          x.id === o.id ? { ...x, isActive: data.isActive } : x,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-[56] bg-slate-900/30"
          style={{ top: "var(--admin-header-h, 56px)" }}
          onClick={onClose}
        />
      )}
      <aside
        className={[
          "fixed right-0 z-[57] flex w-full max-w-lg flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-200 ease-out",
          "bottom-0",
          open ? "translate-x-0" : "translate-x-full pointer-events-none",
        ].join(" ")}
        style={{ top: "var(--admin-header-h, 56px)" }}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 shrink-0">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-400">
              Users
            </p>
            <h3 className="font-semibold text-slate-900">Organizations</h3>
          </div>
          <div className="flex items-center gap-2">
            {canCreate && (
              <button
                type="button"
                onClick={() => {
                  setShowCreate((v) => !v);
                  setError(null);
                }}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                {showCreate ? "Cancel" : "New"}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <p className="text-xs text-slate-500">
            A workspace for a client or agency. Owners can create websites and
            invite users.
            {isSuperadmin ? " You are a superadmin." : ""}
          </p>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {showCreate && (
        <form
          onSubmit={(e) => void onCreate(e)}
          className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 shadow-sm"
        >
          <h2 className="font-semibold text-slate-900">Create organization</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-slate-600">Name</span>
              <input
                required
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                placeholder="Kiekeboe BV"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Slug (optional)</span>
              <input
                value={createSlug}
                onChange={(e) => setCreateSlug(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
                placeholder="auto from name"
              />
            </label>
          </div>
          <p className="text-xs text-slate-500">
            You become the organization owner and can add websites under{" "}
            <Link href="/admin/sites" className="text-blue-600 hover:underline">
              Websites
            </Link>
            .
          </p>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create organization"}
          </button>
        </form>
      )}

      <div className="grid gap-4">
        {orgs.map((o) => {
          const isEditing = editingId === o.id;
          return (
            <div
              key={o.id}
              className={[
                "rounded-xl border bg-white p-5 shadow-sm",
                o.isActive ? "border-slate-200" : "border-amber-200 bg-amber-50/30",
              ].join(" ")}
            >
              {!isEditing ? (
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-lg text-slate-900">
                        {o.name}
                      </h2>
                      {!o.isActive && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                          Inactive
                        </span>
                      )}
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                        {o.myRole}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 mt-0.5">
                      slug: <code className="text-xs">{o.slug}</code>
                      {" · "}
                      {o.siteCount} site(s) · {o.memberCount} member(s)
                    </p>
                    {o.owners.length > 0 && (
                      <p className="text-xs text-slate-400 mt-1">
                        Owners:{" "}
                        {o.owners
                          .map((u) => u.name || u.email)
                          .join(", ")}
                      </p>
                    )}
                    {o.sites.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {o.sites.map((s) => (
                          <li
                            key={s.id}
                            className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600"
                          >
                            {s.name}{" "}
                            <span className="text-slate-400">/{s.slug}</span>
                          </li>
                        ))}
                        {o.siteCount > o.sites.length && (
                          <li className="text-[11px] text-slate-400 self-center">
                            +{o.siteCount - o.sites.length} more
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <Link
                      href="/admin/sites"
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
                    >
                      Websites
                    </Link>
                    {o.canManage && (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => startEdit(o)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void onToggleActive(o)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
                        >
                          {o.isActive ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          type="button"
                          disabled={busy || o.siteCount > 0}
                          title={
                            o.siteCount > 0
                              ? "Remove or reassign websites first"
                              : "Delete organization"
                          }
                          onClick={() => void onDelete(o)}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-40"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <form
                  onSubmit={(e) => void onSaveEdit(e)}
                  className="space-y-3"
                >
                  <h2 className="font-semibold text-slate-900">
                    Edit organization
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="text-slate-600">Name</span>
                      <input
                        required
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-slate-600">Slug</span>
                      <input
                        required
                        value={editSlug}
                        onChange={(e) => setEditSlug(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
                      />
                    </label>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={editActive}
                      onChange={(e) => setEditActive(e.target.checked)}
                    />
                    Active (inactive orgs hide from site create / owner access)
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={busy}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {busy ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setEditingId(null)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          );
        })}

        {orgs.length === 0 && (
          <p className="text-sm text-slate-500 rounded-xl border border-dashed border-slate-200 p-8 text-center">
            No organizations yet.
            {canCreate
              ? " Create one to start adding websites."
              : " Ask a superadmin for access."}
          </p>
        )}
      </div>
        </div>
      </aside>
    </>
  );
}
