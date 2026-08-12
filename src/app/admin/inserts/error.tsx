"use client";

export default function InsertsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="space-y-4 px-1 py-4">
      <h1 className="text-2xl font-semibold">Inserts</h1>
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-900 space-y-3">
        <p className="font-medium">Something went wrong loading inserts.</p>
        <p className="text-red-800/80 font-mono text-xs break-all">
          {error.message || "Unknown error"}
        </p>
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-800"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
