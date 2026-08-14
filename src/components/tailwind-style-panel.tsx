"use client";

import {
  COLOR_HUES,
  COLOR_STEPS,
  DISPLAYS,
  FONT_WEIGHTS,
  ITEMS,
  JUSTIFY,
  ROUNDED,
  SHADOWS,
  SPACE_SCALE,
  TEXT_SIZES,
  getColorToken,
  getExactGroup,
  getPrefixValue,
  setColorToken,
  setExactGroup,
  setPrefixValue,
  type ComputedBox,
} from "@/lib/tailwind-layout";

type Props = {
  tag: string;
  className: string;
  computed: ComputedBox | null;
  parentComputed: ComputedBox | null;
  parentNid: string | null;
  onChange: (next: string) => void;
  onJumpParent: () => void;
};

function Field({
  label,
  own,
  inherited,
  fromParent,
  onJump,
  children,
}: {
  label: string;
  own: boolean;
  inherited?: string;
  fromParent?: boolean;
  onJump: () => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
        {label}
        {!own && inherited ? (
          fromParent ? (
            <button
              type="button"
              onClick={onJump}
              className="text-[10px] text-slate-400 underline hover:text-blue-600"
            >
              from parent
            </button>
          ) : (
            <span className="text-[10px] text-slate-400">computed</span>
          )
        ) : null}
      </span>
      {children}
      {!own && inherited ? (
        <span className="block text-[10px] text-slate-400 truncate" title={inherited}>
          {inherited}
        </span>
      ) : null}
    </label>
  );
}

const selectCls =
  "w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800";

function same(a?: string, b?: string) {
  if (!a || !b) return false;
  return a.replace(/\s+/g, "") === b.replace(/\s+/g, "");
}

export function TailwindStylePanel({
  tag,
  className,
  computed,
  parentComputed,
  parentNid,
  onChange,
  onJumpParent,
}: Props) {
  const jump = () => {
    if (parentNid) onJumpParent();
  };

  function spaceSelect(prefix: string, inherited?: string) {
    const own = getPrefixValue(className, prefix);
    return (
      <Field
        label={prefix}
        own={Boolean(own)}
        inherited={inherited}
        fromParent={Boolean(parentNid) && same(inherited, parentComputed?.padding)}
        onJump={jump}
      >
        <select
          className={selectCls}
          value={own}
          onChange={(e) => onChange(setPrefixValue(className, prefix, e.target.value))}
        >
          {SPACE_SCALE.map((v) => (
            <option key={v || "none"} value={v}>
              {v || "—"}
            </option>
          ))}
        </select>
      </Field>
    );
  }

  const textColor = getColorToken(className, "text");
  const bgColor = getColorToken(className, "bg");
  const borderColor = getColorToken(className, "border");

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] uppercase tracking-wide text-slate-400">
          {tag}
        </p>
        <textarea
          value={className}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 font-mono text-[11px] text-slate-800"
          spellCheck={false}
        />
      </div>

      <section className="space-y-2">
        <h4 className="text-xs font-semibold text-slate-700">Spacing</h4>
        <div className="grid grid-cols-4 gap-2">
          {spaceSelect("p", computed?.padding)}
          {spaceSelect("px")}
          {spaceSelect("py")}
          {spaceSelect("pt")}
          {spaceSelect("pr")}
          {spaceSelect("pb")}
          {spaceSelect("pl")}
          {spaceSelect("m", computed?.margin)}
          {spaceSelect("mx")}
          {spaceSelect("my")}
          {spaceSelect("mt")}
          {spaceSelect("mr")}
          {spaceSelect("mb")}
          {spaceSelect("ml")}
          {spaceSelect("gap")}
        </div>
      </section>

      <section className="space-y-2">
        <h4 className="text-xs font-semibold text-slate-700">Flex / Grid</h4>
        <div className="grid grid-cols-2 gap-2">
          <Field
            label="display"
            own={Boolean(getExactGroup(className, DISPLAYS))}
            inherited={computed?.display}
            fromParent={same(computed?.display, parentComputed?.display)}
            onJump={jump}
          >
            <select
              className={selectCls}
              value={getExactGroup(className, DISPLAYS)}
              onChange={(e) =>
                onChange(setExactGroup(className, DISPLAYS, e.target.value))
              }
            >
              {DISPLAYS.map((v) => (
                <option key={v || "none"} value={v}>
                  {v || "—"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="direction" own={/flex-(row|col)/.test(className)} onJump={jump}>
            <select
              className={selectCls}
              value={
                className.includes("flex-col")
                  ? "flex-col"
                  : className.includes("flex-row")
                    ? "flex-row"
                    : ""
              }
              onChange={(e) =>
                onChange(
                  setExactGroup(className, ["flex-row", "flex-col"], e.target.value),
                )
              }
            >
              <option value="">—</option>
              <option value="flex-row">row</option>
              <option value="flex-col">column</option>
            </select>
          </Field>
          <Field label="justify" own={Boolean(getExactGroup(className, JUSTIFY))} onJump={jump}>
            <select
              className={selectCls}
              value={getExactGroup(className, JUSTIFY)}
              onChange={(e) =>
                onChange(setExactGroup(className, JUSTIFY, e.target.value))
              }
            >
              {JUSTIFY.map((v) => (
                <option key={v || "none"} value={v}>
                  {v.replace("justify-", "") || "—"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="items" own={Boolean(getExactGroup(className, ITEMS))} onJump={jump}>
            <select
              className={selectCls}
              value={getExactGroup(className, ITEMS)}
              onChange={(e) =>
                onChange(setExactGroup(className, ITEMS, e.target.value))
              }
            >
              {ITEMS.map((v) => (
                <option key={v || "none"} value={v}>
                  {v.replace("items-", "") || "—"}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="grid cols"
            own={Boolean(getPrefixValue(className, "grid-cols"))}
            onJump={jump}
          >
            <select
              className={selectCls}
              value={getPrefixValue(className, "grid-cols")}
              onChange={(e) =>
                onChange(setPrefixValue(className, "grid-cols", e.target.value))
              }
            >
              <option value="">—</option>
              {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <section className="space-y-2">
        <h4 className="text-xs font-semibold text-slate-700">Typography</h4>
        <div className="grid grid-cols-2 gap-2">
          <Field
            label="size"
            own={Boolean(getExactGroup(className, TEXT_SIZES))}
            inherited={computed?.fontSize}
            fromParent={same(computed?.fontSize, parentComputed?.fontSize)}
            onJump={jump}
          >
            <select
              className={selectCls}
              value={getExactGroup(className, TEXT_SIZES)}
              onChange={(e) =>
                onChange(setExactGroup(className, TEXT_SIZES, e.target.value))
              }
            >
              {TEXT_SIZES.map((v) => (
                <option key={v || "none"} value={v}>
                  {v.replace("text-", "") || "—"}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="weight"
            own={Boolean(getExactGroup(className, FONT_WEIGHTS))}
            inherited={computed?.fontWeight}
            fromParent={same(computed?.fontWeight, parentComputed?.fontWeight)}
            onJump={jump}
          >
            <select
              className={selectCls}
              value={getExactGroup(className, FONT_WEIGHTS)}
              onChange={(e) =>
                onChange(setExactGroup(className, FONT_WEIGHTS, e.target.value))
              }
            >
              {FONT_WEIGHTS.map((v) => (
                <option key={v || "none"} value={v}>
                  {v.replace("font-", "") || "—"}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="align"
            own={/text-(left|center|right|justify)/.test(className)}
            inherited={computed?.textAlign}
            fromParent={same(computed?.textAlign, parentComputed?.textAlign)}
            onJump={jump}
          >
            <select
              className={selectCls}
              value={
                ["text-left", "text-center", "text-right", "text-justify"].find(
                  (t) => className.split(/\s+/).includes(t),
                ) || ""
              }
              onChange={(e) =>
                onChange(
                  setExactGroup(
                    className,
                    ["text-left", "text-center", "text-right", "text-justify"],
                    e.target.value,
                  ),
                )
              }
            >
              <option value="">—</option>
              <option value="text-left">left</option>
              <option value="text-center">center</option>
              <option value="text-right">right</option>
              <option value="text-justify">justify</option>
            </select>
          </Field>
          <Field
            label="text color"
            own={Boolean(textColor)}
            inherited={computed?.color}
            fromParent={same(computed?.color, parentComputed?.color)}
            onJump={jump}
          >
            <select
              className={selectCls}
              value={textColor}
              onChange={(e) =>
                onChange(setColorToken(className, "text", e.target.value))
              }
            >
              <option value="">—</option>
              <option value="text-white">white</option>
              <option value="text-black">black</option>
              {COLOR_HUES.flatMap((h) =>
                COLOR_STEPS.map((s) => (
                  <option key={`${h}-${s}`} value={`text-${h}-${s}`}>
                    {h}-{s}
                  </option>
                )),
              )}
            </select>
          </Field>
        </div>
      </section>

      <section className="space-y-2">
        <h4 className="text-xs font-semibold text-slate-700">Colors</h4>
        <div className="grid grid-cols-2 gap-2">
          <Field
            label="background"
            own={Boolean(bgColor)}
            inherited={computed?.backgroundColor}
            fromParent={same(
              computed?.backgroundColor,
              parentComputed?.backgroundColor,
            )}
            onJump={jump}
          >
            <select
              className={selectCls}
              value={bgColor}
              onChange={(e) =>
                onChange(setColorToken(className, "bg", e.target.value))
              }
            >
              <option value="">—</option>
              <option value="bg-transparent">transparent</option>
              <option value="bg-white">white</option>
              <option value="bg-black">black</option>
              {COLOR_HUES.flatMap((h) =>
                COLOR_STEPS.map((s) => (
                  <option key={`bg-${h}-${s}`} value={`bg-${h}-${s}`}>
                    {h}-{s}
                  </option>
                )),
              )}
            </select>
          </Field>
          <Field
            label="border color"
            own={Boolean(borderColor)}
            onJump={jump}
          >
            <select
              className={selectCls}
              value={borderColor}
              onChange={(e) =>
                onChange(setColorToken(className, "border", e.target.value))
              }
            >
              <option value="">—</option>
              {COLOR_HUES.flatMap((h) =>
                ["200", "300", "400", "500", "600"].map((s) => (
                  <option key={`bd-${h}-${s}`} value={`border-${h}-${s}`}>
                    {h}-{s}
                  </option>
                )),
              )}
            </select>
          </Field>
        </div>
      </section>

      <section className="space-y-2">
        <h4 className="text-xs font-semibold text-slate-700">Borders</h4>
        <div className="grid grid-cols-2 gap-2">
          <Field
            label="width"
            own={/\bborder(?:-\d+)?\b/.test(className)}
            onJump={jump}
          >
            <select
              className={selectCls}
              value={
                className.split(/\s+/).includes("border")
                  ? "border"
                  : className.split(/\s+/).find((c) => /^border-[0248]$/.test(c)) ||
                    ""
              }
              onChange={(e) =>
                onChange(
                  setExactGroup(
                    className,
                    ["border", "border-0", "border-2", "border-4", "border-8"],
                    e.target.value,
                  ),
                )
              }
            >
              <option value="">—</option>
              <option value="border-0">0</option>
              <option value="border">1</option>
              <option value="border-2">2</option>
              <option value="border-4">4</option>
              <option value="border-8">8</option>
            </select>
          </Field>
          <Field
            label="radius"
            own={Boolean(getExactGroup(className, ROUNDED))}
            inherited={computed?.borderRadius}
            fromParent={same(computed?.borderRadius, parentComputed?.borderRadius)}
            onJump={jump}
          >
            <select
              className={selectCls}
              value={getExactGroup(className, ROUNDED)}
              onChange={(e) =>
                onChange(setExactGroup(className, ROUNDED, e.target.value))
              }
            >
              {ROUNDED.map((v) => (
                <option key={v || "none"} value={v}>
                  {v.replace("rounded-", "") || v || "—"}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="shadow"
            own={Boolean(getExactGroup(className, SHADOWS))}
            inherited={computed?.boxShadow}
            fromParent={same(computed?.boxShadow, parentComputed?.boxShadow)}
            onJump={jump}
          >
            <select
              className={selectCls}
              value={getExactGroup(className, SHADOWS)}
              onChange={(e) =>
                onChange(setExactGroup(className, SHADOWS, e.target.value))
              }
            >
              {SHADOWS.map((v) => (
                <option key={v || "none"} value={v}>
                  {v.replace("shadow-", "") || v || "—"}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>
    </div>
  );
}
