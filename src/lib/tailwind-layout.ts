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

const PREFIX_RE: Record<string, RegExp> = {
  p: /(?:^|\s)p-(?:auto|px|[\d.]+)(?=\s|$)/g,
  px: /(?:^|\s)px-(?:auto|px|[\d.]+)(?=\s|$)/g,
  py: /(?:^|\s)py-(?:auto|px|[\d.]+)(?=\s|$)/g,
  pt: /(?:^|\s)pt-(?:auto|px|[\d.]+)(?=\s|$)/g,
  pr: /(?:^|\s)pr-(?:auto|px|[\d.]+)(?=\s|$)/g,
  pb: /(?:^|\s)pb-(?:auto|px|[\d.]+)(?=\s|$)/g,
  pl: /(?:^|\s)pl-(?:auto|px|[\d.]+)(?=\s|$)/g,
  m: /(?:^|\s)m-(?:auto|px|[\d.]+)(?=\s|$)/g,
  mx: /(?:^|\s)mx-(?:auto|px|[\d.]+)(?=\s|$)/g,
  my: /(?:^|\s)my-(?:auto|px|[\d.]+)(?=\s|$)/g,
  mt: /(?:^|\s)mt-(?:auto|px|[\d.]+)(?=\s|$)/g,
  mr: /(?:^|\s)mr-(?:auto|px|[\d.]+)(?=\s|$)/g,
  mb: /(?:^|\s)mb-(?:auto|px|[\d.]+)(?=\s|$)/g,
  ml: /(?:^|\s)ml-(?:auto|px|[\d.]+)(?=\s|$)/g,
  gap: /(?:^|\s)gap-(?:px|[\d.]+)(?=\s|$)/g,
  "gap-x": /(?:^|\s)gap-x-(?:px|[\d.]+)(?=\s|$)/g,
  "gap-y": /(?:^|\s)gap-y-(?:px|[\d.]+)(?=\s|$)/g,
  w: /(?:^|\s)w-(?:full|auto|screen|fit|min|max|px|[\d.]+|1\/2|1\/3|2\/3|1\/4|3\/4)(?=\s|$)/g,
  h: /(?:^|\s)h-(?:full|auto|screen|fit|min|max|px|[\d.]+)(?=\s|$)/g,
  "max-w": /(?:^|\s)max-w-(?:none|xs|sm|md|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|full|prose)(?=\s|$)/g,
  "grid-cols": /(?:^|\s)grid-cols-(?:none|[\d]+)(?=\s|$)/g,
  border: /(?:^|\s)border(?:-(?:0|2|4|8))?(?=\s|$)/g,
};

export function tokens(className: string): string[] {
  return className.split(/\s+/).filter(Boolean);
}

export function getPrefixValue(className: string, prefix: string): string {
  const re = PREFIX_RE[prefix];
  if (re) {
    re.lastIndex = 0;
    const m = className.match(new RegExp(`(?:^|\\s)${prefix}-(auto|px|[\\d.]+|full|none|xs|sm|md|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|prose|screen|fit|min|max|1\\/2|1\\/3|2\\/3|1\\/4|3\\/4)(?:\\s|$)`));
    return m?.[1] || "";
  }
  return "";
}

export function setPrefixValue(
  className: string,
  prefix: string,
  value: string,
): string {
  const stripped = tokens(className)
    .filter((c) => {
      if (c === prefix) return false;
      return !c.startsWith(`${prefix}-`);
    })
    .join(" ");
  if (!value) return twMerge(stripped);
  return twMerge(stripped, `${prefix}-${value}`);
}

export function hasExact(className: string, token: string): boolean {
  return tokens(className).includes(token);
}

export function setExactGroup(
  className: string,
  group: readonly string[],
  next: string,
): string {
  const stripped = tokens(className)
    .filter((c) => !group.includes(c))
    .join(" ");
  if (!next) return twMerge(stripped);
  return twMerge(stripped, next);
}

export function getExactGroup(
  className: string,
  group: readonly string[],
): string {
  return tokens(className).find((c) => group.includes(c) && c) || "";
}

const COLOR_RE = (kind: "text" | "bg" | "border") =>
  new RegExp(
    `^${kind}-(${COLOR_HUES.join("|")})-(${COLOR_STEPS.join("|")})$`,
  );

export function getColorToken(
  className: string,
  kind: "text" | "bg" | "border",
): string {
  const re = COLOR_RE(kind);
  return (
    tokens(className).find((c) => re.test(c)) ||
    tokens(className).find((c) =>
      kind === "text"
        ? c === "text-white" || c === "text-black" || c === "text-transparent"
        : kind === "bg"
          ? c === "bg-white" || c === "bg-black" || c === "bg-transparent"
          : c === "border-white" || c === "border-black" || c === "border-transparent",
    ) ||
    ""
  );
}

export function setColorToken(
  className: string,
  kind: "text" | "bg" | "border",
  next: string,
): string {
  const re = COLOR_RE(kind);
  const extras = new Set([
    `${kind}-white`,
    `${kind}-black`,
    `${kind}-transparent`,
  ]);
  const stripped = tokens(className)
    .filter((c) => !re.test(c) && !extras.has(c))
    .join(" ");
  if (!next) return twMerge(stripped);
  return twMerge(stripped, next);
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
