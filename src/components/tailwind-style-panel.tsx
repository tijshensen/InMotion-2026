"use client";

import { useState } from "react";
import {
  COLOR_HUES,
  COLOR_STEPS,
  DISPLAYS,
  FONT_WEIGHTS,
  HEIGHTS,
  ITEMS,
  JUSTIFY,
  MAX_WIDTHS,
  ROUNDED,
  SHADOWS,
  SPACE_SCALE,
  TEXT_SIZES,
  WIDTHS,
  classVariant,
  computedLooksInherited,
  getColorToken,
  getExactGroup,
  getPrefixValue,
  setColorToken,
  setExactGroup,
  setPrefixValue,
  type CanvasBreakpointDevice,
  type ComputedBox,
  type LayoutState,
} from "@/lib/tailwind-layout";

type Props = {
  tag: string;
  className: string;
  device: CanvasBreakpointDevice;
  computed: ComputedBox | null;
  parentComputed: ComputedBox | null;
  parentNid: string | null;
  onChange: (next: string) => void;
  onJumpParent: () => void;
};

const STATES: { id: LayoutState; label: string }[] = [
  { id: "default", label: "Default" },
  { id: "hover", label: "Hover" },
  { id: "focus", label: "Focus" },
  { id: "active", label: "Active" },
];

const DEVICE_LABEL: Record<CanvasBreakpointDevice, string> = {
  phone: "Mobile",
  tablet: "Tablet",
  desktop: "Desktop",
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
              onClick={(e) => {
                e.preventDefault();
                onJump();
              }}
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
const selectInheritedCls =
  "w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-400";

export function TailwindStylePanel({
  tag,
  className,
  device,
  computed,
  parentComputed,
  parentNid,
  onChange,
  onJumpParent,
}: Props) {
  const [state, setState] = useState<LayoutState>("default");
  const variant = classVariant(device, state);
  const jump = () => {
    if (parentNid) onJumpParent();
  };

  function spaceSelect(
    prefix: string,
    inherited?: string,
    inheritKey?: keyof ComputedBox,
  ) {
    const own = getPrefixValue(className, prefix, variant);
    const fromParent = Boolean(
      inheritKey &&
        computedLooksInherited(inheritKey, computed, parentComputed),
    );
    return (
      <Field
        label={prefix}
        own={Boolean(own)}
        inherited={own ? undefined : inherited}
        fromParent={fromParent}
        onJump={jump}
      >
        <select
          className={own ? selectCls : selectInheritedCls}
          value={own}
          onChange={(e) =>
            onChange(setPrefixValue(className, prefix, e.target.value, variant))
          }
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

  function prefixSelect(
    label: string,
    prefix: string,
    options: readonly string[],
  ) {
    const own = getPrefixValue(className, prefix, variant);
    return (
      <Field label={label} own={Boolean(own)} onJump={jump}>
        <select
          className={own ? selectCls : selectInheritedCls}
          value={own}
          onChange={(e) =>
            onChange(setPrefixValue(className, prefix, e.target.value, variant))
          }
        >
          {options.map((v) => (
            <option key={v || "none"} value={v}>
              {v || "—"}
            </option>
          ))}
        </select>
      </Field>
    );
  }

  const textColor = getColorToken(className, "text", variant);
  const bgColor = getColorToken(className, "bg", variant);
  const borderColor = getColorToken(className, "border", variant);
  const displayOwn = getExactGroup(className, DISPLAYS, variant);
  const flexDir = getExactGroup(className, ["flex-row", "flex-col"], variant);
  const justifyOwn = getExactGroup(className, JUSTIFY, variant);
  const itemsOwn = getExactGroup(className, ITEMS, variant);
  const gridCols = getPrefixValue(className, "grid-cols", variant);
  const textSize = getExactGroup(className, TEXT_SIZES, variant);
  const fontWeight = getExactGroup(className, FONT_WEIGHTS, variant);
  const ALIGN = ["text-left", "text-center", "text-right", "text-justify"] as const;
  const alignOwn = getExactGroup(className, ALIGN, variant);
  const BORDERS = ["border", "border-0", "border-2", "border-4", "border-8"] as const;
  const borderWidth = getExactGroup(className, BORDERS, variant);
  const radiusOwn = getExactGroup(className, ROUNDED, variant);
  const shadowOwn = getExactGroup(className, SHADOWS, variant);
  const deviceLabel = DEVICE_LABEL[device];

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
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold text-slate-700">State</h4>
          <span className="font-mono text-[10px] text-slate-400">
            {variant || "base"} · {deviceLabel}
          </span>
        </div>
        <div className="flex rounded-lg border border-slate-200 p-0.5 text-[11px]">
          {STATES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setState(s.id)}
              className={[
                "flex-1 rounded-md px-2 py-1",
                state === s.id
                  ? "bg-slate-900 text-white"
                  : "text-slate-500 hover:text-slate-800",
              ].join(" ")}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-slate-400">
          Controls edit {deviceLabel.toLowerCase()}
          {state !== "default" ? ` :${state}` : ""} classes only.
        </p>
      </section>

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
            own={Boolean(displayOwn)}
            inherited={displayOwn ? undefined : computed?.display}
            onJump={jump}
          >
            <select
              className={displayOwn ? selectCls : selectInheritedCls}
              value={displayOwn}
              onChange={(e) =>
                onChange(setExactGroup(className, DISPLAYS, e.target.value, variant))
              }
            >
              {DISPLAYS.map((v) => (
                <option key={v || "none"} value={v}>
                  {v || "—"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="direction" own={Boolean(flexDir)} onJump={jump}>
            <select
              className={flexDir ? selectCls : selectInheritedCls}
              value={flexDir}
              onChange={(e) =>
                onChange(
                  setExactGroup(
                    className,
                    ["flex-row", "flex-col"],
                    e.target.value,
                    variant,
                  ),
                )
              }
            >
              <option value="">—</option>
              <option value="flex-row">row</option>
              <option value="flex-col">column</option>
            </select>
          </Field>
          <Field label="justify" own={Boolean(justifyOwn)} onJump={jump}>
            <select
              className={justifyOwn ? selectCls : selectInheritedCls}
              value={justifyOwn}
              onChange={(e) =>
                onChange(setExactGroup(className, JUSTIFY, e.target.value, variant))
              }
            >
              {JUSTIFY.map((v) => (
                <option key={v || "none"} value={v}>
                  {v.replace("justify-", "") || "—"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="items" own={Boolean(itemsOwn)} onJump={jump}>
            <select
              className={itemsOwn ? selectCls : selectInheritedCls}
              value={itemsOwn}
              onChange={(e) =>
                onChange(setExactGroup(className, ITEMS, e.target.value, variant))
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
            own={Boolean(gridCols)}
            onJump={jump}
          >
            <select
              className={gridCols ? selectCls : selectInheritedCls}
              value={gridCols}
              onChange={(e) =>
                onChange(
                  setPrefixValue(className, "grid-cols", e.target.value, variant),
                )
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
        <h4 className="text-xs font-semibold text-slate-700">Size</h4>
        <div className="grid grid-cols-2 gap-2">
          {prefixSelect("width", "w", WIDTHS)}
          {prefixSelect("max width", "max-w", MAX_WIDTHS)}
          {prefixSelect("height", "h", HEIGHTS)}
        </div>
      </section>

      <section className="space-y-2">
        <h4 className="text-xs font-semibold text-slate-700">Typography</h4>
        <div className="grid grid-cols-2 gap-2">
          <Field
            label="size"
            own={Boolean(textSize)}
            inherited={textSize ? undefined : computed?.fontSize}
            fromParent={computedLooksInherited("fontSize", computed, parentComputed)}
            onJump={jump}
          >
            <select
              className={textSize ? selectCls : selectInheritedCls}
              value={textSize}
              onChange={(e) =>
                onChange(setExactGroup(className, TEXT_SIZES, e.target.value, variant))
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
            own={Boolean(fontWeight)}
            inherited={fontWeight ? undefined : computed?.fontWeight}
            fromParent={computedLooksInherited(
              "fontWeight",
              computed,
              parentComputed,
            )}
            onJump={jump}
          >
            <select
              className={fontWeight ? selectCls : selectInheritedCls}
              value={fontWeight}
              onChange={(e) =>
                onChange(
                  setExactGroup(className, FONT_WEIGHTS, e.target.value, variant),
                )
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
            own={Boolean(alignOwn)}
            inherited={alignOwn ? undefined : computed?.textAlign}
            fromParent={computedLooksInherited(
              "textAlign",
              computed,
              parentComputed,
            )}
            onJump={jump}
          >
            <select
              className={alignOwn ? selectCls : selectInheritedCls}
              value={alignOwn}
              onChange={(e) =>
                onChange(setExactGroup(className, ALIGN, e.target.value, variant))
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
            inherited={textColor ? undefined : computed?.color}
            fromParent={computedLooksInherited("color", computed, parentComputed)}
            onJump={jump}
          >
            <select
              className={textColor ? selectCls : selectInheritedCls}
              value={textColor}
              onChange={(e) =>
                onChange(setColorToken(className, "text", e.target.value, variant))
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
            inherited={bgColor ? undefined : computed?.backgroundColor}
            onJump={jump}
          >
            <select
              className={bgColor ? selectCls : selectInheritedCls}
              value={bgColor}
              onChange={(e) =>
                onChange(setColorToken(className, "bg", e.target.value, variant))
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
              className={borderColor ? selectCls : selectInheritedCls}
              value={borderColor}
              onChange={(e) =>
                onChange(setColorToken(className, "border", e.target.value, variant))
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
            own={Boolean(borderWidth)}
            onJump={jump}
          >
            <select
              className={borderWidth ? selectCls : selectInheritedCls}
              value={borderWidth}
              onChange={(e) =>
                onChange(setExactGroup(className, BORDERS, e.target.value, variant))
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
            own={Boolean(radiusOwn)}
            inherited={radiusOwn ? undefined : computed?.borderRadius}
            onJump={jump}
          >
            <select
              className={radiusOwn ? selectCls : selectInheritedCls}
              value={radiusOwn}
              onChange={(e) =>
                onChange(setExactGroup(className, ROUNDED, e.target.value, variant))
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
            own={Boolean(shadowOwn)}
            inherited={shadowOwn ? undefined : computed?.boxShadow}
            onJump={jump}
          >
            <select
              className={shadowOwn ? selectCls : selectInheritedCls}
              value={shadowOwn}
              onChange={(e) =>
                onChange(setExactGroup(className, SHADOWS, e.target.value, variant))
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

      {computed ? (
        <section className="space-y-2 border-t border-slate-100 pt-4">
          <h4 className="text-xs font-semibold text-slate-500">
            Computed / Inherited
          </h4>
          <ul className="space-y-1 text-[11px] text-slate-400">
            {(
              [
                ["display", computed.display, "display"],
                ["font-size", computed.fontSize, "fontSize"],
                ["font-weight", computed.fontWeight, "fontWeight"],
                ["color", computed.color, "color"],
                ["text-align", computed.textAlign, "textAlign"],
                ["padding", computed.padding, "padding"],
                ["margin", computed.margin, "margin"],
                ["background", computed.backgroundColor, "backgroundColor"],
              ] as const
            ).map(([label, value, key]) => {
              const fromParent = computedLooksInherited(
                key,
                computed,
                parentComputed,
              );
              return (
                <li
                  key={label}
                  className="flex items-baseline justify-between gap-2"
                >
                  <span className="shrink-0">{label}</span>
                  <span className="min-w-0 truncate text-right" title={value}>
                    {value || "—"}
                  </span>
                  {fromParent && parentNid ? (
                    <button
                      type="button"
                      onClick={jump}
                      className="shrink-0 underline hover:text-blue-600"
                    >
                      from parent
                    </button>
                  ) : (
                    <span className="shrink-0 text-slate-300">computed</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
