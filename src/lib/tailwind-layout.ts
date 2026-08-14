import { twMerge } from "tailwind-merge";

export const SPACE_SCALE = [
  "",
  "0",
  "px",
  "0.5",
  "1",
  "1.5",
  "2",
  "2.5",
  "3",
  "4",
  "5",
  "6",
  "8",
  "10",
  "12",
  "16",
  "20",
  "24",
  "auto",
] as const;

export const TEXT_SIZES = [
  "",
  "text-xs",
  "text-sm",
  "text-base",
  "text-lg",
  "text-xl",
  "text-2xl",
  "text-3xl",
  "text-4xl",
  "text-5xl",
] as const;

export const FONT_WEIGHTS = [
  "",
  "font-light",
  "font-normal",
  "font-medium",
  "font-semibold",
  "font-bold",
  "font-extrabold",
] as const;

export const DISPLAYS = [
  "",
  "block",
  "inline-block",
  "inline",
  "flex",
  "inline-flex",
  "grid",
  "hidden",
] as const;

export const JUSTIFY = [
  "",
  "justify-start",
  "justify-center",
  "justify-end",
  "justify-between",
  "justify-around",
  "justify-evenly",
] as const;

export const ITEMS = [
  "",
  "items-start",
  "items-center",
  "items-end",
  "items-stretch",
  "items-baseline",
] as const;

export const ROUNDED = [
  "",
  "rounded-none",
  "rounded-sm",
  "rounded",
  "rounded-md",
  "rounded-lg",
  "rounded-xl",
  "rounded-2xl",
  "rounded-full",
] as const;

export const SHADOWS = [
  "",
  "shadow-none",
  "shadow-sm",
  "shadow",
  "shadow-md",
  "shadow-lg",
  "shadow-xl",
] as const;

export const COLOR_HUES = [
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
] as const;

export const COLOR_STEPS = [
  "50",
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
  "950",
] as const;

export type CanvasBreakpointDevice = "desktop" | "tablet" | "phone";
export type LayoutState = "default" | "hover" | "focus" | "active";

/** Mobile-first: phone = base, tablet = md, desktop = lg. */
export function breakpointFromDevice(
  device: CanvasBreakpointDevice,
): "base" | "md" | "lg" {
  if (device === "tablet") return "md";
  if (device === "desktop") return "lg";
  return "base";
}

/** Tailwind variant prefix including trailing colon, or "" for base/default. */
export function classVariant(
  device: CanvasBreakpointDevice,
  state: LayoutState = "default",
): string {
  const parts: string[] = [];
  const bp = breakpointFromDevice(device);
  if (bp !== "base") parts.push(bp);
  if (state !== "default") parts.push(state);
  return parts.length ? `${parts.join(":")}:` : "";
}

export function tokens(className: string): string[] {
  return className.split(/\s+/).filter(Boolean);
}

/** Split `md:hover:p-4` → { variant: "md:hover:", utility: "p-4" }. Ignores colons inside []. */
export function splitVariant(token: string): { variant: string; utility: string } {
  let depth = 0;
  let lastColon = -1;
  for (let i = 0; i < token.length; i++) {
    const ch = token[i];
    if (ch === "[") depth += 1;
    else if (ch === "]") depth = Math.max(0, depth - 1);
    else if (ch === ":" && depth === 0) lastColon = i;
  }
  if (lastColon < 0) return { variant: "", utility: token };
  return {
    variant: token.slice(0, lastColon + 1),
    utility: token.slice(lastColon + 1),
  };
}

function withVariant(variant: string, utility: string): string {
  return variant ? `${variant}${utility}` : utility;
}

export function getPrefixValue(
  className: string,
  prefix: string,
  variant = "",
): string {
  for (const t of tokens(className)) {
    const { variant: v, utility } = splitVariant(t);
    if (v !== variant) continue;
    if (utility === prefix) return "";
    if (tokenPrefix(utility) === prefix) {
      return utility.slice(prefix.length + 1);
    }
  }
  return "";
}

/** Token prefix before the last hyphen (`max-w-xl` → `max-w`, `gap-x-4` → `gap-x`). */
function tokenPrefix(token: string): string {
  const i = token.lastIndexOf("-");
  return i > 0 ? token.slice(0, i) : token;
}

export function setPrefixValue(
  className: string,
  prefix: string,
  value: string,
  variant = "",
): string {
  const stripped = tokens(className)
    .filter((c) => {
      const { variant: v, utility } = splitVariant(c);
      if (v !== variant) return true;
      if (utility === prefix) return false;
      return tokenPrefix(utility) !== prefix;
    })
    .join(" ");
  if (!value) return twMerge(stripped);
  return twMerge(stripped, withVariant(variant, `${prefix}-${value}`));
}

export function hasExact(
  className: string,
  token: string,
  variant = "",
): boolean {
  return tokens(className).some((c) => {
    const { variant: v, utility } = splitVariant(c);
    return v === variant && utility === token;
  });
}

export function setExactGroup(
  className: string,
  group: readonly string[],
  next: string,
  variant = "",
): string {
  const stripped = tokens(className)
    .filter((c) => {
      const { variant: v, utility } = splitVariant(c);
      if (v !== variant) return true;
      return !group.includes(utility);
    })
    .join(" ");
  if (!next) return twMerge(stripped);
  return twMerge(stripped, withVariant(variant, next));
}

export function getExactGroup(
  className: string,
  group: readonly string[],
  variant = "",
): string {
  for (const c of tokens(className)) {
    const { variant: v, utility } = splitVariant(c);
    if (v === variant && utility && group.includes(utility)) return utility;
  }
  return "";
}

const COLOR_RE = (kind: "text" | "bg" | "border") =>
  new RegExp(
    `^${kind}-(${COLOR_HUES.join("|")})-(${COLOR_STEPS.join("|")})$`,
  );

export function getColorToken(
  className: string,
  kind: "text" | "bg" | "border",
  variant = "",
): string {
  const re = COLOR_RE(kind);
  const extras = new Set([
    `${kind}-white`,
    `${kind}-black`,
    `${kind}-transparent`,
  ]);
  for (const c of tokens(className)) {
    const { variant: v, utility } = splitVariant(c);
    if (v !== variant) continue;
    if (re.test(utility) || extras.has(utility)) return utility;
  }
  return "";
}

export function setColorToken(
  className: string,
  kind: "text" | "bg" | "border",
  next: string,
  variant = "",
): string {
  const re = COLOR_RE(kind);
  const extras = new Set([
    `${kind}-white`,
    `${kind}-black`,
    `${kind}-transparent`,
  ]);
  const stripped = tokens(className)
    .filter((c) => {
      const { variant: v, utility } = splitVariant(c);
      if (v !== variant) return true;
      return !re.test(utility) && !extras.has(utility);
    })
    .join(" ");
  if (!next) return twMerge(stripped);
  return twMerge(stripped, withVariant(variant, next));
}

export function mergeClasses(base: string, extra: string): string {
  return twMerge(base, extra);
}

export type ComputedBox = {
  display: string;
  padding: string;
  margin: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  color: string;
  backgroundColor: string;
  textAlign: string;
  borderRadius: string;
  boxShadow: string;
};

export function pickComputed(cs: CSSStyleDeclaration): ComputedBox {
  return {
    display: cs.display,
    padding: cs.padding,
    margin: cs.margin,
    fontSize: cs.fontSize,
    fontWeight: cs.fontWeight,
    lineHeight: cs.lineHeight,
    color: cs.color,
    backgroundColor: cs.backgroundColor,
    textAlign: cs.textAlign,
    borderRadius: cs.borderRadius,
    boxShadow: cs.boxShadow === "none" ? "" : cs.boxShadow,
  };
}

/** CSS properties that inherit from the parent box. */
export const INHERITED_COMPUTED: (keyof ComputedBox)[] = [
  "fontSize",
  "fontWeight",
  "lineHeight",
  "color",
  "textAlign",
];

export function computedLooksInherited(
  key: keyof ComputedBox,
  own: ComputedBox | null,
  parent: ComputedBox | null,
): boolean {
  if (!own || !parent) return false;
  if (!INHERITED_COMPUTED.includes(key)) return false;
  const a = String(own[key] || "").replace(/\s+/g, "");
  const b = String(parent[key] || "").replace(/\s+/g, "");
  return Boolean(a && b && a === b);
}

export const WIDTHS = [
  "",
  "auto",
  "full",
  "screen",
  "fit",
  "min",
  "max",
  "1/2",
  "1/3",
  "2/3",
  "1/4",
  "3/4",
] as const;

export const MAX_WIDTHS = [
  "",
  "none",
  "xs",
  "sm",
  "md",
  "lg",
  "xl",
  "2xl",
  "3xl",
  "4xl",
  "5xl",
  "6xl",
  "7xl",
  "full",
  "prose",
] as const;

export const HEIGHTS = [
  "",
  "auto",
  "full",
  "screen",
  "fit",
  "min",
  "max",
] as const;
