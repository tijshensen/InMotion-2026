"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { RepeatItem } from "@/components/visual-page-builder";
import {
  parseSectionFields,
  parseStoredContent,
  type RepeatGroupDef,
  type SectionField,
} from "@/lib/sections";

type Props = {
  pageId: string;
  sectionId: string;
  groups: RepeatGroupDef[];
  items: RepeatItem[];
  onChangeItems: (items: RepeatItem[]) => void;
  renderFields: (opts: {
    item: RepeatItem;
    fields: SectionField[];
    values: Record<string, string>;
    onChange: (key: string, value: string) => void;
    onChangeMany: (updates: Record<string, string>) => void;
  }) => ReactNode;
};

export function SectionRepeatEditor({
  pageId,
  sectionId,
  groups,
  items,
  onChangeItems,
  renderFields,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const byGroup = useMemo(() => {
    return groups.map((g) => ({
      group: g,
      items: items
        .filter((i) => i.groupKey === g.key)
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder),
    }));
  }, [groups, items]);

  async function addItem(groupKey: string) {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/pages/${pageId}/sections/${sectionId}/repeats`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ groupKey }),
        },
      );
      if (!res.ok) return;
      const item = (await res.json()) as RepeatItem;
      onChangeItems([...items, item]);
      setOpenId(item.id);
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(item: RepeatItem) {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/pages/${pageId}/sections/${sectionId}/repeats/${item.id}`,
        { method: "DELETE", credentials: "same-origin" },
      );
      if (!res.ok) return;
      const data = await res.json();
      if (data.hidden && data.item) {
        onChangeItems(
          items.map((i) => (i.id === item.id ? { ...i, isHidden: true } : i)),
        );
      } else {
        onChangeItems(items.filter((i) => i.id !== item.id));
      }
    } finally {
      setBusy(false);
    }
  }

  async function restoreItem(item: RepeatItem) {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/pages/${pageId}/sections/${sectionId}/repeats/${item.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ isHidden: false }),
        },
      );
      if (!res.ok) return;
      const next = (await res.json()) as RepeatItem;
      onChangeItems(items.map((i) => (i.id === item.id ? next : i)));
    } finally {
      setBusy(false);
    }
  }

  function patchItemFields(item: RepeatItem, updates: Record<string, string>) {
    const parsed = parseStoredContent(item.content);
    const fields = { ...parsed.fields, ...updates };
    const next: RepeatItem = {
      ...item,
      content: JSON.stringify({ v: 1, fields }),
    };
    onChangeItems(items.map((i) => (i.id === item.id ? next : i)));
    void fetch(
      `/api/pages/${pageId}/sections/${sectionId}/repeats/${item.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ fields }),
      },
    );
  }

  if (!groups.length) return null;

  return (
    <div className="space-y-4 border-t border-slate-800 pt-4">
      {byGroup.map(({ group, items: list }) => {
        const visible = list.filter((i) => !i.isHidden);
        const hidden = list.filter((i) => i.isHidden);
        const fields = parseSectionFields(group.itemHtml);
        return (
          <section key={group.key} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-semibold text-slate-200">
                {group.label || group.key}{" "}
                <span className="font-normal text-slate-400">
                  ({visible.length})
                </span>
              </h4>
              <button
                type="button"
                disabled={busy}
                onClick={() => void addItem(group.key)}
                className="rounded-md border border-slate-600 px-2 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-40"
              >
                + Add
              </button>
            </div>
            <ul className="space-y-2">
              {visible.map((item, idx) => {
                const values = parseStoredContent(item.content).fields;
                const open = openId === item.id;
                return (
                  <li
                    key={item.id}
                    className="rounded-lg border border-slate-700"
                  >
                    <div className="flex items-center gap-2 px-2 py-1.5">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left text-xs font-medium text-slate-100"
                        onClick={() => setOpenId(open ? null : item.id)}
                      >
                        Item {idx + 1}
                        {item.origin === "scraped" ? (
                          <span className="ml-1.5 text-[10px] font-normal text-slate-400">
                            scraped
                          </span>
                        ) : (
                          <span className="ml-1.5 text-[10px] font-normal text-slate-400">
                            added
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void removeItem(item)}
                        className="text-[11px] text-red-600 hover:underline disabled:opacity-40"
                      >
                        {item.origin === "scraped" ? "Hide" : "Remove"}
                      </button>
                    </div>
                    {open ? (
                      <div className="border-t border-slate-800 px-2 py-2">
                        {renderFields({
                          item,
                          fields,
                          values,
                          onChange: (key, value) =>
                            patchItemFields(item, { [key]: value }),
                          onChangeMany: (updates) =>
                            patchItemFields(item, updates),
                        })}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {hidden.length ? (
              <p className="text-[11px] text-slate-400">
                {hidden.length} scraped item{hidden.length === 1 ? "" : "s"} hidden.{" "}
                {hidden.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    className="underline"
                    onClick={() => void restoreItem(h)}
                  >
                    Restore
                  </button>
                ))}
              </p>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
