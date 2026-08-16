"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { OrganizationsAdminClient } from "../organizations/organizations-admin-client";

type OrgOption = {
  id: string;
  name: string;
  slug: string;
  sites: { id: string; name: string; slug: string }[];
  memberCount: number;
  siteCount: number;
};

type UserRow = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  replayOnboarding: boolean;
  createdAt: string;
  orgs: { id: string; name: string; role: string }[];
  sites: { id: string; name: string; slug: string; role: string }[];
};

type OrgManageRow = {
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
  canCreateOrg: boolean;
  organizations: OrgOption[];
  initialOrgs: OrgManageRow[];
  initialUsers: UserRow[];
};

export function UsersAdminClient({
  currentUserId,
  isSuperadmin,
  canCreateOrg,
  organizations,
  initialOrgs,
  initialUsers,
}: Props) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showOrgs, setShowOrgs] = useState(false);

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [organizationId, setOrganizationId] = useState(
    organizations[0]?.id || "",
  );
  const [orgRole, setOrgRole] = useState<"OWNER" | "MEMBER">("MEMBER");
  const [siteRole, setSiteRole] = useState<"ADMIN" | "EDITOR" | "VIEWER">(
    "EDITOR",
  );
  const [selectedSites, setSelectedSites] = useState<string[]>([]);

  useEffect(() => {
    if (!showOrgs) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowOrgs(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showOrgs]);

  const orgSites = useMemo(
    () => organizations.find((o) => o.id === organizationId)?.sites || [],
    [organizations, organizationId],
  );

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          firstName,
          lastName,
          password,
          organizationId,
          orgRole,
          siteIds: selectedSites,
          siteRole,
          role: "EDITOR",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Create failed");
      setShowForm(false);
      setEmail("");
      setFirstName("");
      setLastName("");
      setPassword("");
      setSelectedSites([]);
      router.refresh();
      // Optimistic row
      setUsers((prev) => [
        {
          id: data.id,
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          role: data.role,
          isActive: data.isActive,
          replayOnboarding: Boolean(data.replayOnboarding),
          createdAt: new Date().toISOString(),
          orgs: [
            {
              id: organizationId,
              name:
                organizations.find((o) => o.id === organizationId)?.name || "",
              role: orgRole,
            },
          ],
          sites: orgSites
            .filter((s) => selectedSites.includes(s.id))
            .map((s) => ({ ...s, role: siteRole })),
        },
        ...prev,
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleReplay(u: UserRow) {
    if (!isSuperadmin && u.id !== currentUserId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replayOnboarding: !u.replayOnboarding }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Update failed");
      setUsers((prev) =>
        prev.map((x) =>
          x.id === u.id
            ? { ...x, replayOnboarding: !u.replayOnboarding }
            : x,
        ),
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(u: UserRow) {
    if (u.id === currentUserId) return;
    setBusy(true);
    setError(null);
    try {
      const orgId = u.orgs[0]?.id || organizationId;
      const res = await fetch(`/api/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isActive: !u.isActive,
          organizationId: orgId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Update failed");
      setUsers((prev) =>
        prev.map((x) =>
          x.id === u.id ? { ...x, isActive: !u.isActive } : x,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Users & organizations</h1>
          <p className="text-slate-500 mt-1 text-sm max-w-2xl">
            Organization <strong>owners</strong> can create multiple websites and
            invite editors. Platform superadmins see everyone.
            {isSuperadmin ? " You are a superadmin." : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowOrgs(true)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Organizations
          </button>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {showForm ? "Cancel" : "Invite user"}
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <OrganizationsAdminClient
        currentUserId={currentUserId}
        isSuperadmin={isSuperadmin}
        canCreate={canCreateOrg}
        initialOrgs={initialOrgs}
        open={showOrgs}
        onClose={() => {
          setShowOrgs(false);
          router.refresh();
        }}
      />

      {showForm && (
        <form
          onSubmit={(e) => void onCreate(e)}
          className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 shadow-sm"
        >
          <h2 className="font-semibold text-slate-900">Invite user</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-slate-600">First name</span>
              <input
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Last name</span>
              <input
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-slate-600">Email</span>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-slate-600">Temporary password</span>
              <input
                required
                type="password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Organization</span>
              <select
                value={organizationId}
                onChange={(e) => {
                  setOrganizationId(e.target.value);
                  setSelectedSites([]);
                }}
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
              <span className="text-slate-600">Org role</span>
              <select
                value={orgRole}
                onChange={(e) =>
                  setOrgRole(e.target.value as "OWNER" | "MEMBER")
                }
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              >
                <option value="MEMBER">Member (needs site access)</option>
                <option value="OWNER">Owner (all sites + create)</option>
              </select>
            </label>
          </div>

          {orgRole === "MEMBER" && orgSites.length > 0 && (
            <div>
              <p className="text-sm text-slate-600 mb-2">
                Site access ({siteRole})
              </p>
              <div className="flex flex-wrap gap-2 mb-2">
                <select
                  value={siteRole}
                  onChange={(e) =>
                    setSiteRole(
                      e.target.value as "ADMIN" | "EDITOR" | "VIEWER",
                    )
                  }
                  className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
                >
                  <option value="EDITOR">Editor</option>
                  <option value="ADMIN">Admin</option>
                  <option value="VIEWER">Viewer</option>
                </select>
              </div>
              <ul className="space-y-1">
                {orgSites.map((s) => {
                  const checked = selectedSites.includes(s.id);
                  return (
                    <li key={s.id}>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setSelectedSites((prev) =>
                              checked
                                ? prev.filter((id) => id !== s.id)
                                : [...prev, s.id],
                            )
                          }
                        />
                        {s.name}{" "}
                        <span className="text-slate-400">/{s.slug}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !organizationId}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Create user"}
          </button>
        </form>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Platform</th>
              <th className="px-4 py-3">Organizations</th>
              <th className="px-4 py-3">Sites</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Onboarding</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id} className={!u.isActive ? "opacity-50" : ""}>
                <td className="px-4 py-3 font-medium text-slate-900">
                  {u.firstName} {u.lastName}
                  {u.id === currentUserId && (
                    <span className="ml-1 text-xs text-slate-400">(you)</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{u.email}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {u.orgs.length
                    ? u.orgs.map((o) => `${o.name} (${o.role})`).join(", ")
                    : "—"}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {u.sites.length
                    ? u.sites.map((s) => `${s.name} (${s.role})`).join(", ")
                    : u.orgs.some((o) => o.role === "OWNER")
                      ? "All org sites"
                      : "—"}
                </td>
                <td className="px-4 py-3">
                  {u.isActive ? (
                    <span className="text-emerald-600 text-xs">Active</span>
                  ) : (
                    <span className="text-red-500 text-xs">Disabled</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={u.replayOnboarding}
                      disabled={
                        busy || (!isSuperadmin && u.id !== currentUserId)
                      }
                      onChange={() => void toggleReplay(u)}
                    />
                    After login
                  </label>
                </td>
                <td className="px-4 py-3 text-right">
                  {u.id !== currentUserId && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void toggleActive(u)}
                      className="text-xs text-slate-500 hover:text-slate-800 underline"
                    >
                      {u.isActive ? "Disable" : "Enable"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <p className="p-6 text-sm text-slate-500 text-center">No users yet.</p>
        )}
      </div>
    </div>
  );
}
