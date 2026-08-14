"use client";

import { useEffect, useState } from "react";
import {
  encodeInternalLink,
  isInternalLinkRef,
  parseInternalLinkRef,
  type LinkablePage,
} from "@/lib/internal-links";

export type LinkDraft = {
  href: string;
  title: string;
  target: string;
};

type Props = {
  linkPages: LinkablePage[];
  /** Show the compact “Add link” trigger (text is selected). */
  canAdd: boolean;
  /** Existing link on the selection / field */
  existing?: LinkDraft | null;
  onApply: (draft: LinkDraft) => void;
  onRemove?: () => void;
};

export function TextLinkComposer({
  linkPages,
  canAdd,
  existing,
  onApply,
  onRemove,
}: Props) {
  const [open, setOpen] = useState(false);
  const [href, setHref] = useState("");
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");

  useEffect(() => {
    if (!open) return;
    setHref(existing?.href || "");
    setTitle(existing?.title || "");
    setTarget(existing?.target || "");
  }, [open, existing?.href, existing?.title, existing?.target]);

  const parsed = parseInternalLinkRef(href || "");
  const selectedPageId = parsed
    ? parsed.kind === "page"
      ? parsed.id
      : linkPages.find((p) => p.legacyId === parsed.id)?.id || ""
    : "";
  const mode: "internal" | "external" =
    href && (isInternalLinkRef(href) || selectedPageId) ? "internal" : "external";

  if (!open && existing?.href) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
        <span className="min-w-0 truncate" title={existing.href}>
          Linked · {existing.href}
        </span>
        <span className="shrink-0 flex gap-2">
          <button
            type="button"
            className="text-blue-700 underline"
            onClick={() => setOpen(true)}
          >
            Edit
          </button>
          {onRemove ? (
            <button
              type="button"
              className="text-red-600 underline"
              onClick={onRemove}
            >
              Remove
            </button>
          ) : null}
        </span>
      </div>
    );
  }

  if (!open) {
    if (!canAdd) return null;
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-700"
      >
        Add link
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-800 p-3">
      <div className="flex flex-wrap gap-1 text-[11px]">
        <button
          type="button"
          onClick={() => {
            const first = linkPages[0];
            setHref(first ? encodeInternalLink(first) : "");
          }}
          className={[
            "rounded-md px-2 py-1 border",
            mode === "internal"
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-slate-600 bg-slate-900 text-slate-300",
          ].join(" ")}
        >
          Internal page
        </button>
        <button
          type="button"
          onClick={() =>
            setHref(href && !isInternalLinkRef(href) ? href : "https://")
          }
          className={[
            "rounded-md px-2 py-1 border",
            mode === "external"
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-slate-600 bg-slate-900 text-slate-300",
          ].join(" ")}
        >
          External URL
        </button>
      </div>

      {mode === "internal" ? (
        <select
          value={selectedPageId}
          onChange={(e) => {
            const page = linkPages.find((p) => p.id === e.target.value);
            if (page) setHref(encodeInternalLink(page));
          }}
          className="w-full rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs text-slate-100"
        >
          <option value="">Select a page…</option>
          {linkPages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.menuTitle || p.title}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          placeholder="https://example.com"
          value={href}
          onChange={(e) => setHref(e.target.value)}
          className="w-full rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 font-mono text-xs text-slate-100"
        />
      )}

      <div className="grid grid-cols-2 gap-2">
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="w-full rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs text-slate-100"
        >
          <option value="">Same window</option>
          <option value="_blank">New window</option>
        </select>
        <input
          type="text"
          placeholder="Title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs text-slate-100"
        />
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md px-2 py-1 text-[11px] text-slate-400 hover:text-white"
        >
          Cancel
        </button>
        {existing?.href && onRemove ? (
          <button
            type="button"
            onClick={() => {
              onRemove();
              setOpen(false);
            }}
            className="rounded-md px-2 py-1 text-[11px] text-red-600"
          >
            Remove
          </button>
        ) : null}
        <button
          type="button"
          disabled={!href.trim() || href === "https://"}
          onClick={() => {
            onApply({ href: href.trim(), title: title.trim(), target });
            setOpen(false);
          }}
          className="rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-40"
        >
          Add link
        </button>
      </div>
    </div>
  );
}
