import { assertFontStackRef } from "@hypit/media";
import type { FontStackRef } from "@hypit/media";
import { canonicalStringify } from "@hypit/protocol";
import type { BlobRef } from "@hypit/protocol";

import type { HtmlVisualDependency } from "./html-visual.js";

export type HtmlTextColorPaint =
  | { readonly kind: "solid"; readonly color: string }
  | {
      readonly kind: "linear-gradient";
      readonly angleDeg: number;
      readonly stops: readonly {
        readonly offset: number;
        readonly color: string;
        readonly opacity: number;
      }[];
    }
  | {
      readonly kind: "radial-gradient";
      readonly center: { readonly x: number; readonly y: number };
      readonly stops: readonly {
        readonly offset: number;
        readonly color: string;
        readonly opacity: number;
      }[];
    };

export type HtmlTextBoxDecoration = {
  readonly fill?: HtmlTextColorPaint;
  readonly border?: {
    readonly color: string;
    readonly widthPx: number;
    readonly style?: "solid" | "dashed" | "dotted";
  };
  readonly paddingPx?: {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  };
  readonly radiusPx?: number;
  readonly shadows?: readonly {
    readonly color: string;
    readonly offsetX: number;
    readonly offsetY: number;
    readonly blurPx: number;
    readonly spreadPx: number;
  }[];
};

/** Ordered terminal-local text Paint. Array order is back-to-front. */
export type HtmlTextPaintLayer =
  | { readonly kind: "fill"; readonly paint: HtmlTextColorPaint }
  | {
      readonly kind: "stroke";
      readonly paint: HtmlTextColorPaint;
      readonly widthPx: number;
      readonly placement: "center" | "outside";
    }
  | {
      readonly kind: "shadow";
      readonly color: string;
      readonly offsetX: number;
      readonly offsetY: number;
      readonly blurPx: number;
      readonly spreadPx?: number;
    }
  | { readonly kind: "glow"; readonly color: string; readonly blurPx: number; readonly spreadPx?: number }
  | {
      readonly kind: "long-shadow";
      readonly color: string;
      readonly distancePx: number;
      readonly angleDeg: number;
      readonly steps?: number;
    }
  | { readonly kind: "box"; readonly decoration: HtmlTextBoxDecoration };

export type HtmlTextTypography = {
  /** Exact ordered faces. Environment family names remain an explicit fallback only. */
  readonly fonts?: FontStackRef;
  readonly fontFamily?: string;
  readonly fontSizePx?: number;
  readonly fontWeight?: number;
  readonly fontStyle?: "normal" | "italic" | "oblique";
  readonly lineHeight?: number;
  readonly letterSpacingPx?: number;
  readonly wordSpacingPx?: number;
  readonly language?: string;
  readonly direction?: "auto" | "ltr" | "rtl";
  readonly writingMode?: "horizontal-tb" | "vertical-rl" | "vertical-lr";
  readonly textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
  readonly variantCaps?: "normal" | "small-caps" | "all-small-caps";
  readonly kerning?: "auto" | "normal" | "none";
};

export type HtmlTextDecoration = {
  readonly line: "underline" | "overline" | "line-through";
  readonly color: string;
  readonly thicknessPx: number;
  /** Only underlines consume this value; it remains explicit for stable authoring. */
  readonly offsetPx?: number;
  readonly style?: "solid" | "double" | "dotted" | "dashed" | "wavy";
};

export type HtmlTextStyle = {
  readonly typography?: HtmlTextTypography;
  readonly paints?: readonly HtmlTextPaintLayer[];
  readonly decoration?: HtmlTextDecoration;
  /** Exact inline advance for authored separators that must not inherit a font's space glyph. */
  readonly inlineAdvancePx?: number;
};

export type HtmlTextNode =
  | {
      readonly kind: "text";
      readonly id: string;
      readonly text: string;
      readonly style?: HtmlTextStyle;
    }
  | {
      readonly kind: "group";
      readonly id: string;
      readonly children: readonly HtmlTextNode[];
      readonly style?: HtmlTextStyle;
    }
  | { readonly kind: "break"; readonly id: string };

export type HtmlTextFragmentSpec = {
  readonly id: string;
  readonly typography: HtmlTextTypography;
  readonly paints: readonly HtmlTextPaintLayer[];
  readonly decoration?: HtmlTextDecoration;
  readonly children: readonly HtmlTextNode[];
};

export type HtmlTextFragment = {
  readonly html: string;
  readonly dependencies: readonly HtmlVisualDependency[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function identity(value: string, label: string): void {
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function number(value: number, label: string): string {
  assert(Number.isFinite(value), `${label} is not finite.`);
  if (Object.is(value, -0)) return "0";
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(8)));
}

function cssToken(value: string, label: string): string {
  assert(value.length > 0 && !/[;<>{}\\\u0000-\u001f\u007f]/u.test(value), `${label} is invalid.`);
  return value;
}

function color(value: string, label: string): string {
  assert(/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(value), `${label} must be an RGB or RGBA hex color.`);
  return value;
}

function colorPaintCss(paint: HtmlTextColorPaint, label: string): string {
  if (paint.kind === "solid") return color(paint.color, `${label} color`);
  assert(paint.stops.length > 0, `${label} has no stops.`);
  const stops = paint.stops.map((stop, index) => {
    assert(stop.offset >= 0 && stop.offset <= 1 && stop.opacity >= 0 && stop.opacity <= 1,
      `${label} stop ${index} is invalid.`);
    const selected = color(stop.color, `${label} stop ${index} color`);
    const rendered = stop.opacity === 1
      ? selected
      : `color-mix(in srgb,${selected} ${number(stop.opacity * 100, `${label} stop opacity`)}%,transparent)`;
    return `${rendered} ${number(stop.offset * 100, `${label} stop offset`)}%`;
  }).join(",");
  if (paint.kind === "linear-gradient") {
    return `linear-gradient(${number(paint.angleDeg, `${label} angle`)}deg,${stops})`;
  }
  assert(paint.center.x >= 0 && paint.center.x <= 1 && paint.center.y >= 0 && paint.center.y <= 1,
    `${label} center is invalid.`);
  return `radial-gradient(circle at ${number(paint.center.x * 100, `${label} center x`)}% ${number(paint.center.y * 100, `${label} center y`)}%,${stops})`;
}

function solidPaint(paint: HtmlTextColorPaint, label: string): string {
  assert(paint.kind === "solid", `${label} requires a solid color.`);
  return color(paint.color, `${label} color`);
}

function fontFormat(mediaType: string): string {
  if (mediaType === "font/woff2") return "woff2";
  if (mediaType === "font/woff") return "woff";
  if (mediaType === "font/ttf") return "truetype";
  return "opentype";
}

type FontClosure = {
  readonly css: string;
  readonly families: ReadonlyMap<string, readonly string[]>;
  readonly dependencies: readonly HtmlVisualDependency[];
};

function fontStackIdentity(fonts: FontStackRef): string {
  return canonicalStringify(fonts);
}

function collectFontStacks(spec: HtmlTextFragmentSpec): readonly FontStackRef[] {
  const result = new Map<string, FontStackRef>();
  const append = (fonts: FontStackRef | undefined, label: string): void => {
    if (fonts === undefined) return;
    assertFontStackRef(fonts, label);
    result.set(fontStackIdentity(fonts), fonts);
  };
  append(spec.typography.fonts, `HTML Text ${spec.id} fonts`);
  const visit = (node: HtmlTextNode): void => {
    append(node.kind === "break" ? undefined : node.style?.typography?.fonts,
      `HTML Text node ${node.id} fonts`);
    if (node.kind === "group") for (const child of node.children) visit(child);
  };
  for (const node of spec.children) visit(node);
  return [...result.values()];
}

function fontClosure(id: string, stacks: readonly FontStackRef[]): FontClosure {
  if (stacks.length === 0) return { css: "", families: new Map(), dependencies: [] };
  const dependencies = new Map<string, BlobRef>();
  const families = new Map<string, readonly string[]>();
  const rules: string[] = [];
  for (const [stackIndex, stack] of stacks.entries()) {
    const stackFamilies: string[] = [];
    for (const [faceIndex, face] of stack.faces.entries()) {
      const family = `hypit-text-${id.replaceAll(/[^A-Za-z0-9_-]/gu, "-")}-${stackIndex}-${faceIndex}`;
      stackFamilies.push(family);
      for (const source of face.sources) {
        dependencies.set(source.artifact.resource, source.artifact);
        const range = source.unicodeRange === undefined ? "" : `;unicode-range:${source.unicodeRange}`;
        rules.push(`@font-face{font-family:"${family}";src:url("hypit-artifact://${source.artifact.resource}") format("${fontFormat(source.artifact.mediaType)}");font-weight:${face.weight};font-style:${face.style};font-display:block${range}}`);
      }
    }
    families.set(fontStackIdentity(stack), stackFamilies);
  }
  return {
    css: rules.join(""),
    families,
    dependencies: [...dependencies.values()].map((artifact) => ({ kind: "data", artifact })),
  };
}

function typographyCss(value: HtmlTextTypography, fontClosure: FontClosure, label: string): string[] {
  const exactFamilies = value.fonts === undefined
    ? []
    : fontClosure.families.get(fontStackIdentity(value.fonts)) ?? [];
  const families = [
    ...exactFamilies.map((family) => `"${family}"`),
    ...(value.fontFamily === undefined ? [] : [cssToken(value.fontFamily, `${label} font family`)]),
  ];
  const css: string[] = [];
  if (families.length > 0) css.push(`font-family:${families.join(",")}`);
  if (value.fonts !== undefined) css.push("font-synthesis:none");
  if (value.fontSizePx !== undefined) css.push(`font-size:${number(value.fontSizePx, `${label} size`)}px`);
  if (value.fontWeight !== undefined) {
    assert(Number.isSafeInteger(value.fontWeight) && value.fontWeight >= 1 && value.fontWeight <= 1_000,
      `${label} weight is invalid.`);
    css.push(`font-weight:${value.fontWeight}`);
  }
  if (value.fontStyle !== undefined) css.push(`font-style:${value.fontStyle}`);
  if (value.lineHeight !== undefined) {
    assert(value.lineHeight > 0, `${label} line height is invalid.`);
    css.push(`line-height:${number(value.lineHeight, `${label} line height`)}`);
  }
  if (value.letterSpacingPx !== undefined) {
    css.push(`letter-spacing:${number(value.letterSpacingPx, `${label} letter spacing`)}px`);
  }
  if (value.wordSpacingPx !== undefined) {
    css.push(`word-spacing:${number(value.wordSpacingPx, `${label} word spacing`)}px`);
  }
  if (value.writingMode !== undefined) css.push(`writing-mode:${value.writingMode}`);
  if (value.textTransform !== undefined) css.push(`text-transform:${value.textTransform}`);
  if (value.variantCaps !== undefined) css.push(`font-variant-caps:${value.variantCaps}`);
  if (value.kerning !== undefined) css.push(`font-kerning:${value.kerning}`);
  return css;
}

function languageAttributes(value: HtmlTextTypography, label: string): string {
  const attributes: string[] = [];
  if (value.language !== undefined) {
    assert(/^[A-Za-z0-9]{1,8}(?:-[A-Za-z0-9]{1,8})*$/u.test(value.language),
      `${label} language is invalid.`);
    attributes.push(`lang="${escapeHtml(value.language)}"`);
  }
  if (value.direction !== undefined) attributes.push(`dir="${value.direction}"`);
  return attributes.length === 0 ? "" : ` ${attributes.join(" ")}`;
}

function boxCss(paints: readonly HtmlTextPaintLayer[], label: string): string[] {
  const boxes = paints.filter((paint): paint is Extract<HtmlTextPaintLayer, { kind: "box" }> =>
    paint.kind === "box");
  const css: string[] = [];
  const backgrounds: string[] = [];
  const shadows: string[] = [];
  for (const [index, box] of boxes.entries()) {
    const decoration = box.decoration;
    if (decoration.fill !== undefined) backgrounds.push(colorPaintCss(decoration.fill, `${label} box ${index}`));
    if (decoration.border !== undefined) {
      assert(decoration.border.widthPx >= 0, `${label} box ${index} border width is invalid.`);
      css.push(`border:${number(decoration.border.widthPx, `${label} border width`)}px ${decoration.border.style ?? "solid"} ${color(decoration.border.color, `${label} border color`)}`);
    }
    if (decoration.paddingPx !== undefined) {
      const padding = decoration.paddingPx;
      assert(Object.values(padding).every((value) => Number.isFinite(value) && value >= 0),
        `${label} box ${index} padding is invalid.`);
      css.push(`padding:${number(padding.top, `${label} padding`)}px ${number(padding.right, `${label} padding`)}px ${number(padding.bottom, `${label} padding`)}px ${number(padding.left, `${label} padding`)}px`);
    }
    if (decoration.radiusPx !== undefined) {
      assert(decoration.radiusPx >= 0, `${label} box ${index} radius is invalid.`);
      css.push(`border-radius:${number(decoration.radiusPx, `${label} radius`)}px`);
    }
    for (const shadow of decoration.shadows ?? []) {
      assert(shadow.blurPx >= 0, `${label} box ${index} shadow blur is invalid.`);
      shadows.push(`${number(shadow.offsetX, `${label} shadow x`)}px ${number(shadow.offsetY, `${label} shadow y`)}px ${number(shadow.blurPx, `${label} shadow blur`)}px ${number(shadow.spreadPx, `${label} shadow spread`)}px ${color(shadow.color, `${label} shadow color`)}`);
    }
  }
  if (backgrounds.length > 0) css.push(`background-image:${backgrounds.reverse().join(",")}`);
  if (shadows.length > 0) css.push(`box-shadow:${shadows.join(",")}`);
  return css;
}

function glyphFilterDefinition(
  paint: Extract<HtmlTextPaintLayer, { kind: "shadow" | "glow" }>,
  id: string,
  label: string,
): string {
  const selected = color(paint.color, `${label} ${paint.kind}`);
  assert(paint.blurPx >= 0, `${label} ${paint.kind} blur is invalid.`);
  const spreadPx = paint.spreadPx ?? 0;
  assert(Number.isFinite(spreadPx) && spreadPx >= 0, `${label} ${paint.kind} spread is invalid.`);
  // Fine's authored blur is the CSS blur radius. The former Hyperframes terminal
  // converted that radius to Gaussian deviation before painting the silhouette.
  // Radius zero is the identity and keeps the same primitive addressable when
  // a live component switches to an Active Paint with non-zero spread.
  const spread = `<feMorphology data-hypit-text-filter-spread in="SourceAlpha" operator="dilate" radius="${number(spreadPx, `${label} spread`)}" result="spread"/>`;
  const blur = `<feGaussianBlur data-hypit-text-filter-blur in="spread" stdDeviation="${number(paint.blurPx / 2, `${label} blur`)}" result="blurred"/>`;
  const shape = paint.kind === "shadow"
    ? `<feOffset data-hypit-text-filter-offset in="blurred" dx="${number(paint.offsetX, `${label} shadow x`)}" dy="${number(paint.offsetY, `${label} shadow y`)}" result="shape"/>`
    : `<feComposite in="blurred" in2="blurred" operator="in" result="shape"/>`;
  const flood = `<feFlood data-hypit-text-filter-flood flood-color="${selected}" result="paint"/>`;
  return `<filter id="${id}" x="-100%" y="-100%" width="300%" height="300%" color-interpolation-filters="sRGB">${spread}${blur}${shape}${flood}<feComposite in="paint" in2="shape" operator="in"/></filter>`;
}

type GlyphFilterPaint = Extract<HtmlTextPaintLayer, { kind: "shadow" | "glow" }>;

type GlyphFilterRegistry = {
  readonly fragmentId: string;
  readonly ids: Map<string, string>;
  readonly definitions: string[];
};

function safeIdentity(value: string): string {
  return value.replaceAll(/[^A-Za-z0-9_-]/gu, "-");
}

/**
 * One fragment owns one definition for every distinct soft Paint.
 *
 * Caption words intentionally repeat the same ordered Paint. Keeping a filter beside every word
 * makes the DOM grow as words × effects even though the browser resolves filter identifiers across
 * the whole fragment. A small structural registry preserves Paint order while sharing only equal
 * terminal implementations; it introduces no authoring identity or persistent metadata.
 */
function glyphFilterId(paint: GlyphFilterPaint, registry: GlyphFilterRegistry, label: string): string {
  const key = canonicalStringify(paint);
  const existing = registry.ids.get(key);
  if (existing !== undefined) return existing;
  const id = `hypit-text-filter-${safeIdentity(registry.fragmentId)}-${registry.ids.size + 1}`;
  registry.ids.set(key, id);
  registry.definitions.push(glyphFilterDefinition(paint, id, label));
  return id;
}

function paintCss(
  paint: Exclude<HtmlTextPaintLayer, { kind: "box" }>,
  label: string,
  filterId?: string,
): string[] {
  const common = ["grid-area:1/1", "position:relative", "pointer-events:none"];
  if (paint.kind === "fill") {
    if (paint.paint.kind === "solid") {
      const selected = color(paint.paint.color, `${label} fill`);
      return [...common, `color:${selected}`, `-webkit-text-fill-color:${selected}`];
    }
    return [...common, `background-image:${colorPaintCss(paint.paint, `${label} fill`)}`,
      "background-clip:text", "-webkit-background-clip:text", "color:transparent",
      "-webkit-text-fill-color:transparent"];
  }
  if (paint.kind === "stroke") {
    assert(paint.widthPx >= 0, `${label} stroke width is invalid.`);
    const selected = solidPaint(paint.paint, `${label} stroke`);
    const width = paint.placement === "outside" ? paint.widthPx * 2 : paint.widthPx;
    return [...common, `color:${selected}`, `-webkit-text-fill-color:${selected}`,
      `-webkit-text-stroke:${number(width, `${label} stroke width`)}px ${selected}`,
      "paint-order:stroke fill"];
  }
  if (paint.kind === "shadow") {
    assert(filterId !== undefined, `${label} shadow filter identity is missing.`);
    return [...common, "color:#ffffff", "-webkit-text-fill-color:#ffffff", "text-shadow:none",
      `filter:url(#${filterId})`];
  }
  if (paint.kind === "glow") {
    assert(filterId !== undefined, `${label} glow filter identity is missing.`);
    return [...common, "color:#ffffff", "-webkit-text-fill-color:#ffffff", "text-shadow:none",
      `filter:url(#${filterId})`];
  }
  assert(paint.distancePx >= 0 && Number.isFinite(paint.distancePx), `${label} distance is invalid.`);
  assert(Number.isFinite(paint.angleDeg), `${label} angle is invalid.`);
  const steps = paint.steps ?? Math.min(32, Math.max(1, Math.ceil(paint.distancePx)));
  assert(Number.isSafeInteger(steps) && steps >= 1 && steps <= 128, `${label} steps are invalid.`);
  const selected = color(paint.color, `${label} long shadow`);
  const radians = paint.angleDeg * Math.PI / 180;
  const shadows = Array.from({ length: steps }, (_, index) => {
    const distance = paint.distancePx * (index + 1) / steps;
    return `${number(Math.cos(radians) * distance, `${label} long shadow x`)}px ${number(Math.sin(radians) * distance, `${label} long shadow y`)}px 0 ${selected}`;
  }).join(",");
  return [...common, `color:${selected}`, `-webkit-text-fill-color:${selected}`, `text-shadow:${shadows}`];
}

function mergeTypography(parent: HtmlTextTypography, child: HtmlTextTypography | undefined): HtmlTextTypography {
  if (child === undefined) return parent;
  if (child.fontFamily !== undefined && child.fonts === undefined) {
    const { fonts: _fonts, ...environmentParent } = parent;
    return { ...environmentParent, ...child };
  }
  return { ...parent, ...child };
}

function decorationCss(value: HtmlTextDecoration | undefined, label: string): string[] {
  if (value === undefined) return [];
  assert(value.thicknessPx >= 0 && Number.isFinite(value.thicknessPx), `${label} thickness is invalid.`);
  if (value.offsetPx !== undefined) {
    assert(value.line === "underline" && Number.isFinite(value.offsetPx),
      `${label} offset belongs only to an underline.`);
  }
  return [
    `text-decoration-line:${value.line}`,
    `text-decoration-color:${color(value.color, `${label} color`)}`,
    `text-decoration-thickness:${number(value.thicknessPx, `${label} thickness`)}px`,
    `text-decoration-style:${value.style ?? "solid"}`,
    ...(value.offsetPx === undefined ? [] : [
      `text-underline-offset:${number(value.offsetPx, `${label} offset`)}px`,
    ]),
  ];
}

function renderNode(
  node: HtmlTextNode,
  typography: HtmlTextTypography,
  paints: readonly HtmlTextPaintLayer[],
  decoration: HtmlTextDecoration | undefined,
  fonts: FontClosure,
  identities: Set<string>,
  filters: GlyphFilterRegistry,
): string {
  identity(node.id, "HTML Text node id");
  assert(!identities.has(node.id), `HTML Text repeats node ${node.id}.`);
  identities.add(node.id);
  if (node.kind === "break") return `<br data-hypit-text-node="${escapeHtml(node.id)}"/>`;
  const selectedTypography = mergeTypography(typography, node.style?.typography);
  const selectedPaints = node.style?.paints ?? paints;
  const selectedDecoration = node.style?.decoration ?? decoration;
  const style = [
    "position:relative",
    ...(node.style?.inlineAdvancePx === undefined ? [] : (() => {
      assert(Number.isFinite(node.style.inlineAdvancePx) && node.style.inlineAdvancePx >= 0,
        `HTML Text node ${node.id} inline advance is invalid.`);
      return ["display:inline-block", `width:${number(node.style.inlineAdvancePx, `HTML Text node ${node.id} inline advance`)}px`,
        "font-size:0", "line-height:0", "flex:none"];
    })()),
    ...typographyCss(selectedTypography, fonts, `HTML Text node ${node.id}`),
    ...boxCss(selectedPaints, `HTML Text node ${node.id}`),
    ...decorationCss(selectedDecoration, `HTML Text node ${node.id} decoration`),
  ].join(";");
  if (node.kind === "group") {
    assert(node.children.length > 0, `HTML Text group ${node.id} is empty.`);
    return `<span data-hypit-text-node="${escapeHtml(node.id)}" data-hypit-text-kind="group"${languageAttributes(selectedTypography, `HTML Text node ${node.id}`)} style="${escapeHtml(style)}">${node.children.map((child) =>
      renderNode(child, selectedTypography, selectedPaints, selectedDecoration, fonts, identities, filters)).join("")}</span>`;
  }
  assert(node.text.length > 0, `HTML Text node ${node.id} is empty.`);
  const glyphPaints = selectedPaints.filter((paint): paint is Exclude<HtmlTextPaintLayer, { kind: "box" }> =>
    paint.kind !== "box");
  const described = glyphPaints.map((paint, index) => ({
    paint,
    filterId: paint.kind === "shadow" || paint.kind === "glow"
      ? glyphFilterId(paint, filters, `HTML Text node ${node.id} Paint ${index}`) : undefined,
  }));
  const layers = glyphPaints.length === 0
    ? escapeHtml(node.text)
    : described.map(({ paint, filterId }, index) => `<span data-hypit-text-paint="${paint.kind}" aria-hidden="${index === glyphPaints.length - 1 ? "false" : "true"}" style="${escapeHtml(paintCss(paint, `HTML Text node ${node.id}`, filterId).join(";"))}">${escapeHtml(node.text)}</span>`).join("");
  const display = node.style?.inlineAdvancePx === undefined ? ";display:inline-grid" : "";
  return `<span data-hypit-text-node="${escapeHtml(node.id)}" data-hypit-text-kind="text"${languageAttributes(selectedTypography, `HTML Text node ${node.id}`)} style="${escapeHtml(`${style}${display}`)}">${layers}</span>`;
}

/**
 * Compile renderer-local text structure to a reusable HTML fragment.
 *
 * The result owns exact font dependencies and ordered glyph Paint, but no NLE placement, Caption
 * timing, semantic identity or component behavior.
 */
export function htmlTextFragment(spec: HtmlTextFragmentSpec): HtmlTextFragment {
  identity(spec.id, "HTML Text fragment id");
  assert(spec.children.length > 0, `HTML Text fragment ${spec.id} is empty.`);
  const fonts = fontClosure(spec.id, collectFontStacks(spec));
  const rootStyle = [
    "position:relative",
    ...typographyCss(spec.typography, fonts, `HTML Text fragment ${spec.id}`),
    ...boxCss(spec.paints, `HTML Text fragment ${spec.id}`),
    ...decorationCss(spec.decoration, `HTML Text fragment ${spec.id} decoration`),
  ].join(";");
  const identities = new Set<string>();
  const filters: GlyphFilterRegistry = { fragmentId: spec.id, ids: new Map(), definitions: [] };
  const content = spec.children.map((node) =>
    renderNode(node, spec.typography, spec.paints, spec.decoration, fonts, identities, filters)).join("");
  const definitions = filters.definitions.length === 0 ? ""
    : `<svg aria-hidden="true" width="0" height="0" style="position:absolute;overflow:hidden"><defs>${filters.definitions.join("")}</defs></svg>`;
  return {
    html: `${fonts.css === "" ? "" : `<style>${fonts.css}</style>`}${definitions}<span data-hypit-text-fragment="${escapeHtml(spec.id)}"${languageAttributes(spec.typography, `HTML Text fragment ${spec.id}`)} style="${escapeHtml(rootStyle)}">${content}</span>`,
    dependencies: fonts.dependencies,
  };
}
