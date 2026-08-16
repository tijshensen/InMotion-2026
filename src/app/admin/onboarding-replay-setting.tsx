"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function OnboardingReplaySetting({
  userId,
  enabled,
}: {
  userId: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    const next = !on;
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replayOnboarding: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save");
      setOn(next);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-900">Onboarding</h2>
      <p className="mt-1 text-sm text-slate-500">
        For testing: open the new-site wizard after every login, even if you
        already have websites.
      </p>
      <label className="mt-4 flex items-center gap-3 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={on}
          disabled={busy}
          onChange={() => void toggle()}
        />
        Always start with onboarding
      </label>
      {on ? (
        <p className="mt-3">
          <a href="/onboarding" className="text-sm text-blue-600 hover:underline">
            Run onboarding now
          </a>
        </p>
      ) : null}
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </section>
  );
}
