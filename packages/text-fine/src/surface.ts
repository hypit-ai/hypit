import { timelineTypes } from "@hypit/timeline";
import { resolveTemporalContext } from "@hypit/temporal/markup";

import { compositionTypes } from "@hypit/composition";
import type {
  VisualColorPaint,
  VisualStyleDeclaration,
  VisualTextDocument,
  VisualTextPaintLayer,
  VisualTextRunStyle,
  VisualTextSequenceAnimation,
  VisualTextTypography,
} from "@hypit/composition";
import {
  assertFontArtifactRef,
  assertFontStackRef,
  mediaTypes,
} from "@hypit/media";
import type { FontArtifactRef, FontStackRef } from "@hypit/media";
import { spatialTypes } from "@hypit/spatial";
import { sealGraphFragment } from "@hypit/hypit/author";
import type { FragmentOperation, GraphFragment } from "@hypit/hypit/author";
import { recipeType } from "@hypit/hypit/recipe";
import type { Recipe } from "@hypit/hypit/recipe";
import { textTypes } from "@hypit/hypit/text";
import type { StructuredElement, StructuredSurfaceHandler, SurfaceResolvedReference, MarkupAttributeValue } from "@hypit/hypit/markup";
import { temporalTypes } from "@hypit/temporal";
import { resolveTemporalWindowReference } from "@hypit/temporal/markup";

import { fineTextWindowAttributeVocabulary, textFineProducers, textFineTypes } from "./manifest.js";
import {
  sealTextItemSpec,
  sealPlainTextItemSpec,
  sealTextMaskSpec,
  sealTextMotion,
  sealTextPathMotion,
  sealTextStyle,
  stillTextMotion,
  stillTextPathMotion,
} from "./program.js";
import type {
  TextFlowPlacementPolicy,
  TextItemSpec,
  TextMotion,
  TextPathMotion,
  TextPathPlacementPolicy,
  TextPointPlacementPolicy,
  TextStyle,
} from "./types.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

function localName(name: string): string {
  return name.slice(name.lastIndexOf(":") + 1);
}

function sameType(left: SurfaceResolvedReference["type"], right: SurfaceResolvedReference["type"]): boolean {
  return left.module.name === right.module.name && left.module.version === right.module.version && left.name === right.name;
}

function allowed(element: StructuredElement, names: readonly string[], required: readonly string[] = []): void {
  const unknown = Object.keys(element.attributes).filter((name) => !names.includes(name));
  if (unknown.length > 0) throw new Error(`${element.name} does not accept ${unknown[0]}.`);
  const missing = required.filter((name) => element.attributes[name] === undefined);
  if (missing.length > 0) throw new Error(`${element.name} requires ${missing.join(", ")}.`);
}

function empty(element: StructuredElement): void {
  if (element.children.some((child) => child.kind === "element" || child.value.trim())) {
    throw new Error(`${element.name} must be empty.`);
  }
}

function enumText<const T extends string>(
  element: StructuredElement,
  name: string,
  values: readonly T[],
  fallback?: T,
): T {
  const value = text(element, name, fallback);
  if (!values.includes(value as T)) throw new Error(`${element.name}.${name} must be ${values.join(" or ")}.`);
  return value as T;
}

function text(element: StructuredElement, name: string, fallback?: string): string {
  const value = element.attributes[name];
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string" || !value.trim()) throw new Error(`${element.name}.${name} must be text.`);
  return value.trim();
}

function optionalText(element: StructuredElement, name: string): string | undefined {
  const value = element.attributes[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) throw new Error(`${element.name}.${name} must be text.`);
  return value.trim();
}

function numeric(element: StructuredElement, name: string, fallback?: number): number {
  const raw = optionalText(element, name);
  if (raw === undefined && fallback !== undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${element.name}.${name} must be finite.`);
  return value;
}

function integer(element: StructuredElement, name: string, fallback?: number): number {
  const value = numeric(element, name, fallback);
  if (!Number.isSafeInteger(value)) throw new Error(`${element.name}.${name} must be a safe integer.`);
  return value;
}

function booleanValue(value: unknown, label: string, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  throw new Error(`${label} must be true or false.`);
}

function reference(
  raw: MarkupAttributeValue | undefined,
  label: string,
  expected: SurfaceResolvedReference["type"],
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  if (typeof raw !== "object" || raw.kind !== "reference") throw new Error(`${label} must be a reference.`);
  const result = resolve(raw.path);
  if (result === undefined || !sameType(result.type, expected)) throw new Error(`${label} cannot resolve the required type.`);
  return result;
}

function oneOfReference(
  raw: MarkupAttributeValue | undefined,
  label: string,
  expected: readonly SurfaceResolvedReference["type"][],
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  if (typeof raw !== "object" || raw.kind !== "reference") throw new Error(`${label} must be a reference.`);
  const result = resolve(raw.path);
  if (result === undefined || !expected.some((type) => sameType(result.type, type))) {
    throw new Error(`${label} cannot resolve one of the required types.`);
  }
  return result;
}

function inline<T>(value: SurfaceResolvedReference, label: string): T {
  if (value.record?.value.kind !== "inline") throw new Error(`${label} must reference an authored inline Record.`);
  return value.record.value.value as unknown as T;
}

function recipe(value: SurfaceResolvedReference, label: string): Recipe {
  if (!sameType(value.type, recipeType)) throw new Error(`${label} must reference an SVS Recipe.`);
  return inline<Recipe>(value, label);
}

function propNumber(value: Recipe, name: string, fallback?: number): number {
  const result = value.properties[name];
  if (result === undefined && fallback !== undefined) return fallback;
  if (typeof result !== "number" || !Number.isFinite(result)) throw new Error(`Text Recipe ${name} must be a number.`);
  return result;
}

function propString(value: Recipe, name: string, fallback?: string): string {
  const result = value.properties[name];
  if (result === undefined && fallback !== undefined) return fallback;
  if (typeof result !== "string" || !result.trim()) throw new Error(`Text Recipe ${name} must be text.`);
  return result.trim();
}

function propBoolean(value: Recipe, name: string, fallback: boolean): boolean {
  return booleanValue(value.properties[name], `Text Recipe ${name}`, fallback);
}

function exactFonts(
  element: StructuredElement,
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): FontArtifactRef[] {
  const raw = element.attributes.font;
  if (raw === undefined) throw new Error(`${element.name}.font must reference one exact FontArtifactRef or FontStackRef.`);
  const resolved = oneOfReference(raw, `${element.name}.font`, [mediaTypes.fontArtifact, mediaTypes.fontStack], resolve);
  if (sameType(resolved.type, mediaTypes.fontArtifact)) {
    const font = inline<FontArtifactRef>(resolved, `${element.name}.font`);
    assertFontArtifactRef(font, `${element.name}.font`);
    return [font];
  }
  const stack = inline<FontStackRef>(resolved, `${element.name}.font`);
  assertFontStackRef(stack, `${element.name}.font`);
  return [...stack.faces];
}

function splitNumbers(value: string, label: string, count: 1 | 2 | 4): number[] {
  const result = value.trim().split(/\s+/u).map(Number);
  if (![1, 2, 4].includes(result.length) || result.some((item) => !Number.isFinite(item) || item < 0)) {
    throw new Error(`${label} must contain one, two or four non-negative numbers.`);
  }
  if (count === 1) return [result[0]!];
  if (count === 2) return result.length === 1 ? [result[0]!, result[0]!] : [result[0]!, result[1]!];
  if (result.length === 1) return [result[0]!, result[0]!, result[0]!, result[0]!];
  if (result.length === 2) return [result[0]!, result[1]!, result[0]!, result[1]!];
  return result;
}

function gradientStops(element: StructuredElement): Array<{ readonly offset: number; readonly color: string; readonly opacity: number }> {
  const stops = element.children.flatMap((child) => {
    if (child.kind === "text") {
      if (child.value.trim()) throw new Error(`${element.name} accepts only Stop children.`);
      return [];
    }
    if (localName(child.name) !== "Stop") throw new Error(`${element.name} accepts only Stop children.`);
    allowed(child, ["offset", "color", "opacity"], ["offset", "color"]);
    if (child.children.some((nested) => nested.kind === "element" || nested.value.trim())) throw new Error(`${child.name} must be empty.`);
    return [{ offset: numeric(child, "offset"), color: text(child, "color"), opacity: numeric(child, "opacity", 1) }];
  });
  if (stops.length < 2) throw new Error(`${element.name} requires at least two Stops.`);
  let previous = -1;
  for (const [index, stop] of stops.entries()) {
    if (stop.offset < 0 || stop.offset > 1 || stop.offset < previous || stop.opacity < 0 || stop.opacity > 1) {
      throw new Error(`${element.name}.Stop.${index + 1} must have ordered offsets and normalized opacity.`);
    }
    previous = stop.offset;
  }
  return stops;
}

function gradient(element: StructuredElement): VisualColorPaint {
  const name = localName(element.name);
  if (name === "Linear") {
    allowed(element, ["angle"], ["angle"]);
    return { kind: "linear-gradient", angleDeg: numeric(element, "angle"), stops: gradientStops(element) };
  }
  if (name === "Radial") {
    allowed(element, ["x", "y"], ["x", "y"]);
    const center = { x: numeric(element, "x"), y: numeric(element, "y") };
    if (center.x < 0 || center.x > 1 || center.y < 0 || center.y > 1) {
      throw new Error(`${element.name} center must be normalized.`);
    }
    return { kind: "radial-gradient", center, stops: gradientStops(element) };
  }
  throw new Error(`${element.name} is not a gradient.`);
}

function paintFrom(element: StructuredElement, structuralChildren: readonly string[] = []): VisualColorPaint {
  const color = optionalText(element, "color");
  const gradients = element.children.filter((child): child is StructuredElement => child.kind === "element" && ["Linear", "Radial"].includes(localName(child.name)));
  const unknown = element.children.filter((child): child is StructuredElement => child.kind === "element" && ![...structuralChildren, "Linear", "Radial"].includes(localName(child.name)));
  if (unknown.length > 0) throw new Error(`${element.name} does not accept ${unknown[0]!.name}.`);
  if (color !== undefined && gradients.length > 0) throw new Error(`${element.name} cannot combine color with a gradient.`);
  if (gradients.length > 1) throw new Error(`${element.name} accepts one gradient.`);
  if (color !== undefined) return { kind: "solid", color };
  if (gradients[0] !== undefined) return gradient(gradients[0]);
  throw new Error(`${element.name} requires color or one Linear/Radial child.`);
}

function parseBox(element: StructuredElement): VisualTextPaintLayer {
  allowed(element, [
    "target", "continuity", "color", "padding", "radius", "border-color", "border-width", "border-style",
  ], ["target"]);
  const target = text(element, "target") as Extract<VisualTextPaintLayer, { kind: "box" }>["target"];
  if (!["frame", "content", "paragraph", "line", "run", "word", "grapheme"].includes(target)) throw new Error(`${element.name}.target is invalid.`);
  const continuity = enumText(element, "continuity", ["isolated", "joined"] as const, "isolated");
  if (continuity === "joined" && !["line", "word", "grapheme"].includes(target)) {
    throw new Error(`${element.name}.continuity joined is invalid for ${target}.`);
  }
  const padding = splitNumbers(text(element, "padding", "0"), `${element.name}.padding`, 4);
  const radius = splitNumbers(text(element, "radius", "0"), `${element.name}.radius`, 4);
  const borderWidth = splitNumbers(text(element, "border-width", "0"), `${element.name}.border-width`, 4);
  const shadows: Extract<VisualTextPaintLayer, { kind: "box" }>["decoration"]["shadows"][number][] = [];
  let tail: Extract<VisualTextPaintLayer, { kind: "box" }>["decoration"]["tail"];
  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim()) throw new Error(`${element.name} accepts only gradient, BoxShadow and Tail children.`);
      continue;
    }
    const name = localName(child.name);
    if (name === "Linear" || name === "Radial") continue;
    if (name === "BoxShadow") {
      allowed(child, ["color", "x", "y", "blur", "spread"], ["color"]);
      const blurPx = numeric(child, "blur", 0);
      if (blurPx < 0) throw new Error(`${child.name}.blur must not be negative.`);
      shadows.push({ paint: paintFrom(child), offsetX: numeric(child, "x", 0), offsetY: numeric(child, "y", 0), blurPx, spreadPx: numeric(child, "spread", 0) });
      continue;
    }
    if (name === "Tail") {
      if (tail !== undefined) throw new Error(`${element.name} accepts one Tail.`);
      allowed(child, ["side", "offset", "width", "height", "color"], ["side", "offset", "width", "height", "color"]);
      empty(child);
      const widthPx = numeric(child, "width");
      const heightPx = numeric(child, "height");
      if (widthPx < 0 || heightPx < 0) throw new Error(`${child.name} dimensions must not be negative.`);
      tail = { side: enumText(child, "side", ["top", "right", "bottom", "left"] as const), offset: numeric(child, "offset"), widthPx, heightPx, paint: paintFrom(child) };
      continue;
    }
  }
  const fill = element.attributes.color === undefined && !element.children.some((child) => child.kind === "element" && ["Linear", "Radial"].includes(localName(child.name)))
    ? undefined : paintFrom(element, ["BoxShadow", "Tail"]);
  const borderColor = optionalText(element, "border-color");
  return {
    kind: "box", target, continuity,
    decoration: {
      ...(fill === undefined ? {} : { fill }),
      ...(borderColor === undefined || borderWidth.every((value) => value === 0) ? {} : {
        border: {
          paint: { kind: "solid", color: borderColor },
          widthsPx: { top: borderWidth[0]!, right: borderWidth[1]!, bottom: borderWidth[2]!, left: borderWidth[3]! },
          style: text(element, "border-style", "solid") as "solid" | "dashed" | "dotted",
        },
      }),
      paddingPx: { top: padding[0]!, right: padding[1]!, bottom: padding[2]!, left: padding[3]! },
      radiiPx: { topLeft: radius[0]!, topRight: radius[1]!, bottomRight: radius[2]!, bottomLeft: radius[3]! },
      shadows,
      ...(tail === undefined ? {} : { tail }),
    },
  };
}

function parsePaintLayer(element: StructuredElement): VisualTextPaintLayer {
  const name = localName(element.name);
  if (name === "Fill") {
    allowed(element, ["color"]);
    return { kind: "fill", paint: paintFrom(element) };
  }
  if (name === "Stroke") {
    allowed(element, ["color", "width", "placement"], ["width", "placement"]);
    const placement = enumText(element, "placement", ["inside", "center", "outside"] as const);
    const widthPx = numeric(element, "width");
    if (widthPx < 0) throw new Error(`${element.name}.width must not be negative.`);
    return { kind: "stroke", paint: paintFrom(element), widthPx, placement };
  }
  if (name === "Shadow") {
    allowed(element, ["color", "x", "y", "blur", "spread"], ["x", "y", "blur"]);
    const blurPx = numeric(element, "blur");
    if (blurPx < 0) throw new Error(`${element.name}.blur must not be negative.`);
    return { kind: "shadow", paint: paintFrom(element), offsetX: numeric(element, "x"), offsetY: numeric(element, "y"), blurPx, spreadPx: numeric(element, "spread", 0) };
  }
  if (name === "Glow") {
    allowed(element, ["color", "blur", "spread"], ["blur"]);
    const blurPx = numeric(element, "blur");
    const spreadPx = numeric(element, "spread", 0);
    if (blurPx < 0 || spreadPx < 0) throw new Error(`${element.name} blur and spread must not be negative.`);
    return { kind: "glow", paint: paintFrom(element), blurPx, spreadPx };
  }
  if (name === "Box") return parseBox(element);
  throw new Error(`${element.name} is not a Text Paint layer.`);
}

const STYLE_PROPERTIES = new Set([
  "size", "weight", "font-style", "line-height", "tracking", "word-spacing",
  "kerning", "synthesis", "language", "direction", "writing-mode", "baseline-shift", "vertical-align", "tab-size", "indent",
  "paragraph-before", "paragraph-after", "transform", "caps", "cjk-spacing", "punctuation-trim",
  "fill",
]);

export const decodeTypographyStyleSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  allowed(element, ["id", "recipe", "font"], ["id", "recipe", "font"]);
  const id = text(element, "id");
  const value = recipe(reference(element.attributes.recipe, `${element.name}.recipe`, recipeType, resolveReference), `${element.name}.recipe`);
  const unknown = Object.keys(value.properties).filter((name) => !STYLE_PROPERTIES.has(name));
  if (unknown.length > 0) throw new Error(`Text Recipe does not accept ${unknown[0]}.`);
  const fonts = exactFonts(element, resolveReference);
  const paints: VisualTextPaintLayer[] = [];
  const axes: VisualTextTypography["axes"][number][] = [];
  const features: VisualTextTypography["features"][number][] = [];
  const decorations: VisualTextTypography["decorations"][number][] = [];
  if (value.properties.fill !== undefined) paints.push({ kind: "fill", paint: { kind: "solid", color: propString(value, "fill") } });
  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim()) throw new Error(`${element.name} accepts only Paint children.`);
      continue;
    }
    const name = localName(child.name);
    if (name === "Axis") {
      allowed(child, ["tag", "value"], ["tag", "value"]);
      empty(child);
      const tag = text(child, "tag");
      if (!/^[\x20-\x7e]{4}$/u.test(tag) || axes.some((axis) => axis.tag === tag)) throw new Error(`${child.name}.tag must be one unique four-byte OpenType tag.`);
      axes.push({ tag, value: numeric(child, "value") });
    } else if (name === "Feature") {
      allowed(child, ["tag", "enabled"], ["tag", "enabled"]);
      empty(child);
      const tag = text(child, "tag");
      if (!/^[\x20-\x7e]{4}$/u.test(tag) || features.some((feature) => feature.tag === tag)) throw new Error(`${child.name}.tag must be one unique four-byte OpenType tag.`);
      features.push({ tag, enabled: booleanValue(child.attributes.enabled, `${child.name}.enabled`, false) });
    } else if (name === "Decoration") {
      allowed(child, ["line", "color", "style", "thickness", "offset", "skip-ink"], ["line"]);
      const line = enumText(child, "line", ["underline", "overline", "line-through"] as const);
      if (decorations.some((decoration) => decoration.line === line)) throw new Error(`${child.name}.line ${line} is repeated.`);
      const thicknessPx = child.attributes.thickness === undefined ? undefined : numeric(child, "thickness");
      if (thicknessPx !== undefined && thicknessPx < 0) throw new Error(`${child.name}.thickness must not be negative.`);
      decorations.push({
        line,
        paint: paintFrom(child),
        style: enumText(child, "style", ["solid", "double", "dotted", "dashed", "wavy"] as const, "solid"),
        ...(thicknessPx === undefined ? {} : { thicknessPx }),
        ...(child.attributes.offset === undefined ? {} : { offsetPx: numeric(child, "offset") }),
        skipInk: booleanValue(child.attributes["skip-ink"], `${child.name}.skip-ink`, true),
      });
    } else paints.push(parsePaintLayer(child));
  }
  if (!paints.some((paint) => paint.kind === "fill" || paint.kind === "stroke")) {
    throw new Error(`${element.name} requires at least one visible glyph Fill or Stroke.`);
  }
  const style = sealTextStyle({
    id,
    typography: {
      fonts,
      sizePx: propNumber(value, "size"), weight: propNumber(value, "weight", 400),
      style: propString(value, "font-style", "normal") as "normal" | "italic" | "oblique",
      axes, features, synthesis: propString(value, "synthesis", "none") as TextStyle["typography"]["synthesis"],
      kerning: propString(value, "kerning", "auto") as TextStyle["typography"]["kerning"],
      trackingPx: propNumber(value, "tracking", 0), wordSpacingPx: propNumber(value, "word-spacing", 0),
      lineHeight: propNumber(value, "line-height", 1.2),
      ...(value.properties.language === undefined ? {} : { language: propString(value, "language") }),
      direction: propString(value, "direction", "auto") as TextStyle["typography"]["direction"],
      writingMode: propString(value, "writing-mode", "horizontal-tb") as TextStyle["typography"]["writingMode"],
      baselineShiftPx: propNumber(value, "baseline-shift", 0), tabSize: propNumber(value, "tab-size", 4),
      indentationPx: propNumber(value, "indent", 0), paragraphBeforePx: propNumber(value, "paragraph-before", 0),
      paragraphAfterPx: propNumber(value, "paragraph-after", 0),
      transform: propString(value, "transform", "none") as TextStyle["typography"]["transform"],
      variantCaps: propString(value, "caps", "normal") as TextStyle["typography"]["variantCaps"],
      verticalAlign: propString(value, "vertical-align", "baseline") as TextStyle["typography"]["verticalAlign"],
      decorations,
      cjk: {
        textSpacing: propString(value, "cjk-spacing", "normal") as "normal" | "none",
        punctuationTrim: propString(value, "punctuation-trim", "none") as "none" | "start" | "end" | "adjacent" | "all",
      },
    },
    paints,
  });
  return { records: [{ id, type: textFineTypes.style, value: { kind: "inline", value: style }, range: element.range }], components: [], fragments: [] };
};

function keyframeStyle(element: StructuredElement): VisualStyleDeclaration[] {
  const result: VisualStyleDeclaration[] = [];
  const x = numeric(element, "x", 0);
  const y = numeric(element, "y", 0);
  const scale = numeric(element, "scale", 1);
  const rotate = numeric(element, "rotate", 0);
  const skewX = numeric(element, "skew-x", 0);
  const skewY = numeric(element, "skew-y", 0);
  if (["x", "y", "scale", "rotate", "skew-x", "skew-y"].some((name) => element.attributes[name] !== undefined)) {
    result.push({ name: "transform", value: `translate(${x}px,${y}px) scale(${scale}) rotate(${rotate}deg) skew(${skewX}deg,${skewY}deg)` });
  }
  if (element.attributes.opacity !== undefined) result.push({ name: "opacity", value: numeric(element, "opacity") });
  if (element.attributes.blur !== undefined) result.push({ name: "filter", value: `blur(${numeric(element, "blur")}px)` });
  if (element.attributes.color !== undefined) result.push({ name: "color", value: text(element, "color") });
  if (["clip-top", "clip-right", "clip-bottom", "clip-left"].some((name) => element.attributes[name] !== undefined)) {
    result.push({ name: "clip-path", value: `inset(${numeric(element, "clip-top", 0)}% ${numeric(element, "clip-right", 0)}% ${numeric(element, "clip-bottom", 0)}% ${numeric(element, "clip-left", 0)}%)` });
  }
  if (result.length === 0) throw new Error(`${element.name} must animate at least one property.`);
  return result;
}

const KEYFRAME_ATTRIBUTES = ["at", "easing", "x", "y", "scale", "rotate", "skew-x", "skew-y", "opacity", "blur", "color", "clip-top", "clip-right", "clip-bottom", "clip-left"] as const;

export const decodeTypographyMotionSurface: StructuredSurfaceHandler = ({ element }) => {
  allowed(element, ["id"], ["id"]);
  const id = text(element, "id");
  const itemKeyframes: NonNullable<TextMotion["item"]>["keyframes"][number][] = [];
  const sequences: VisualTextSequenceAnimation[] = [];
  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim()) throw new Error(`${element.name} accepts ItemKeyframe and Sequence children.`);
      continue;
    }
    const name = localName(child.name);
    if (name === "ItemKeyframe") {
      allowed(child, KEYFRAME_ATTRIBUTES, ["at"]);
      if (child.children.some((nested) => nested.kind === "element" || nested.value.trim())) throw new Error(`${child.name} must be empty.`);
      itemKeyframes.push({ atFrame: integer(child, "at"), ...(child.attributes.easing === undefined ? {} : { easing: text(child, "easing") as "linear" | "ease-in" | "ease-out" | "ease-in-out" }), style: keyframeStyle(child) });
      continue;
    }
    if (name !== "Sequence") throw new Error(`${element.name} does not accept ${child.name}.`);
    allowed(child, ["id", "unit", "start-index", "end-index", "order", "start-frame", "duration-frames", "stagger-frames", "cycles", "seed"], ["id", "unit", "start-index", "end-index", "duration-frames"]);
    const keyframes = child.children.flatMap((nested) => {
      if (nested.kind === "text") {
        if (nested.value.trim()) throw new Error(`${child.name} accepts only Keyframe children.`);
        return [];
      }
      if (localName(nested.name) !== "Keyframe") throw new Error(`${child.name} accepts only Keyframe children.`);
      allowed(nested, KEYFRAME_ATTRIBUTES, ["at"]);
      return [{ atProgress: numeric(nested, "at"), ...(nested.attributes.easing === undefined ? {} : { easing: text(nested, "easing") as "linear" | "ease-in" | "ease-out" | "ease-in-out" }), style: keyframeStyle(nested) }];
    });
    sequences.push({
      id: text(child, "id"), unit: text(child, "unit") as VisualTextSequenceAnimation["unit"],
      range: { start: integer(child, "start-index"), endExclusive: integer(child, "end-index") },
      order: text(child, "order", "forward") as VisualTextSequenceAnimation["order"],
      startFrame: integer(child, "start-frame", 0), unitDurationFrames: integer(child, "duration-frames"),
      staggerFrames: integer(child, "stagger-frames", 0), cycles: integer(child, "cycles", 1),
      ...(child.attributes.seed === undefined ? {} : { seed: integer(child, "seed") }), keyframes,
    });
  }
  const motion = sealTextMotion({
    id,
    ...(itemKeyframes.length === 0 ? {} : { item: { keyframes: itemKeyframes } }),
    sequences,
  });
  return { records: [{ id, type: textFineTypes.motion, value: { kind: "inline", value: motion }, range: element.range }], components: [], fragments: [] };
};

export const decodeTypographyPathMotionSurface: StructuredSurfaceHandler = ({ element }) => {
  allowed(element, ["id"], ["id"]);
  const id = text(element, "id");
  const keyframes: TextPathMotion["keyframes"][number][] = [];
  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim()) throw new Error(`${element.name} accepts only Keyframe children.`);
      continue;
    }
    if (localName(child.name) !== "Keyframe") throw new Error(`${element.name} accepts only Keyframe children.`);
    allowed(child, ["at", "margin", "easing"], ["at", "margin"]);
    empty(child);
    keyframes.push({
      atFrame: integer(child, "at"),
      startMarginPx: numeric(child, "margin"),
      ...(child.attributes.easing === undefined ? {} : { easing: enumText(child, "easing", ["linear", "ease-in", "ease-out", "ease-in-out"] as const) }),
    });
  }
  const motion = sealTextPathMotion({ id, keyframes });
  return { records: [{ id, type: textFineTypes.pathMotion, value: { kind: "inline", value: motion }, range: element.range }], components: [], fragments: [] };
};

function dedent(value: string): string {
  const lines = value.replace(/\r\n?/gu, "\n").replace(/^\n/u, "").replace(/\n\s*$/u, "").split("\n");
  const indentation = lines.filter((line) => line.trim()).reduce((min, line) => Math.min(min, /^\s*/u.exec(line)?.[0].length ?? 0), Number.POSITIVE_INFINITY);
  return lines.map((line) => line.slice(Number.isFinite(indentation) ? indentation : 0)).join("\n");
}

function runStyle(value: SurfaceResolvedReference): VisualTextRunStyle {
  const style = inline<TextStyle>(value, "Text inline Style");
  return { typography: style.typography, paints: style.paints };
}

function paragraph(element: StructuredElement, index: number, resolve: (path: string) => SurfaceResolvedReference | undefined): VisualTextDocument["paragraphs"][number] {
  allowed(element, ["id", "style"]);
  const inlines: VisualTextDocument["paragraphs"][number]["inlines"][number][] = [];
  // Source indentation belongs to the file, not to the words. An item's own direct text is dedented
  // and a paragraph's was not, so the same copy read differently depending only on whether it was
  // written inside <P>. Dedent the paragraph as one block, with each nested element standing in as a
  // zero-width mark: measuring the common indentation line by line needs the runs in their places,
  // and a Span in the middle of a line would otherwise look like a line of its own.
  const mark = "\u0000";
  const merged: (typeof element.children)[number][] = [];
  for (const child of element.children) {
    const previous = merged.at(-1);
    if (child.kind === "text" && previous?.kind === "text") {
      merged[merged.length - 1] = { ...previous, value: `${previous.value}${child.value}` };
      continue;
    }
    merged.push(child);
  }
  const segments = dedent(merged.map((child) => child.kind === "text" ? child.value : mark).join("")).split(mark);
  // One segment lies before each mark and one after the last, so a text run reads the segment at the
  // current mark and only a nested element moves on to the next.
  let segmentIndex = 0;
  let inlineIndex = 0;
  for (const child of merged) {
    inlineIndex += 1;
    if (child.kind === "text") {
      const value = segments[segmentIndex] ?? child.value;
      if (value.length > 0) inlines.push({ kind: "text", id: `run-${inlineIndex}`, text: value });
      continue;
    }
    segmentIndex += 1;
    const name = localName(child.name);
    if (name === "Break") {
      allowed(child, []);
      // A break carries nothing, and text written inside one was being dropped without a word.
      empty(child);
      inlines.push({ kind: "break", id: `break-${inlineIndex}` });
      continue;
    }
    if (name !== "Span") throw new Error(`${element.name} accepts text, Span and Break children.`);
    allowed(child, ["id", "style", "language", "direction"]);
    if (child.children.some((nested) => nested.kind === "element")) throw new Error(`${child.name} cannot contain nested elements.`);
    const spanText = child.children.map((nested) => nested.kind === "text" ? nested.value : "").join("");
    if (spanText.length === 0) throw new Error(`${child.name} cannot be empty.`);
    const styleRef = child.attributes.style === undefined ? undefined : reference(child.attributes.style, `${child.name}.style`, textFineTypes.style, resolve);
    inlines.push({
      kind: "text", id: optionalText(child, "id") ?? `run-${inlineIndex}`, text: spanText,
      ...(styleRef === undefined ? {} : { style: runStyle(styleRef) }),
      ...(child.attributes.language === undefined ? {} : { language: text(child, "language") }),
      ...(child.attributes.direction === undefined ? {} : { direction: enumText(child, "direction", ["auto", "ltr", "rtl"] as const) }),
    });
  }
  if (inlines.length === 0) throw new Error(`${element.name} cannot be empty.`);
  const styleRef = element.attributes.style === undefined ? undefined : reference(element.attributes.style, `${element.name}.style`, textFineTypes.style, resolve);
  return { id: optionalText(element, "id") ?? `paragraph-${index}`, inlines, ...(styleRef === undefined ? {} : { style: runStyle(styleRef) }) };
}

function document(element: StructuredElement, resolve: (path: string) => SurfaceResolvedReference | undefined): VisualTextDocument {
  const paragraphChildren = element.children.filter((child): child is StructuredElement => child.kind === "element" && localName(child.name) === "P");
  if (paragraphChildren.length > 0) {
    const invalid = element.children.find((child) => child.kind === "element" ? localName(child.name) !== "P" : child.value.trim().length > 0);
    if (invalid !== undefined) throw new Error(`${element.name} cannot mix P children with direct text.`);
    return { paragraphs: paragraphChildren.map((child, index) => paragraph(child, index + 1, resolve)) };
  }
  if (element.children.some((child) => child.kind === "element")) throw new Error(`${element.name} direct content accepts no nested elements; use P and Span.`);
  const content = dedent(element.children.map((child) => child.kind === "text" ? child.value : "").join(""));
  if (!content.trim()) throw new Error(`${element.name} requires text content.`);
  return { paragraphs: [{ id: "paragraph-1", inlines: [{ kind: "text", id: "run-1", text: content }] }] };
}

type FineTextForm = "flow" | "point" | "path";

const fineTextWindowAttributeNames = fineTextWindowAttributeVocabulary.map(({ name }) => name);

const FLOW_ATTRIBUTES = [
  "inline-size", "block-size", "padding", "align", "block-align", "wrap", "overflow", "max-lines",
  "minimum-scale", "clip", "columns", "column-gap", "metric-edge",
] as const;
const POINT_ATTRIBUTES = ["anchor-inline", "anchor-block"] as const;
const PATH_ATTRIBUTES = ["side", "orientation", "start-margin", "end-margin", "align", "reverse", "overflow", "path-motion"] as const;

function flowPlacementPolicy(element: StructuredElement): TextFlowPlacementPolicy {
  const padding = splitNumbers(text(element, "padding", "0"), `${element.name}.padding`, 4);
  const overflow = enumText(element, "overflow", ["visible", "clip", "ellipsis", "shrink"] as const, "visible");
  return {
    z: integer(element, "z"),
    flow: {
      inlineSize: enumText(element, "inline-size", ["hug", "fixed"] as const, "fixed"),
      blockSize: enumText(element, "block-size", ["hug", "fixed"] as const, "fixed"),
      paddingPx: { inlineStart: padding[3]!, inlineEnd: padding[1]!, blockStart: padding[0]!, blockEnd: padding[2]! },
      inlineAlign: enumText(element, "align", ["start", "center", "end", "justify"] as const, "center"),
      blockAlign: enumText(element, "block-align", ["start", "center", "end"] as const, "center"),
      wrap: enumText(element, "wrap", ["none", "word", "grapheme"] as const, "word"),
      overflow,
      ...(element.attributes["max-lines"] === undefined ? {} : { maxLines: integer(element, "max-lines") }),
      ...(element.attributes["minimum-scale"] === undefined ? {} : { minimumScale: numeric(element, "minimum-scale") }),
      clipToFrame: booleanValue(element.attributes.clip, `${element.name}.clip`, false),
      columns: integer(element, "columns", 1),
      columnGapPx: numeric(element, "column-gap", 0),
      metricEdge: enumText(element, "metric-edge", ["line-box", "cap-height", "ink"] as const, "line-box"),
    },
  };
}

function pointPlacementPolicy(element: StructuredElement): TextPointPlacementPolicy {
  return {
    z: integer(element, "z"),
    anchorInline: enumText(element, "anchor-inline", ["start", "center", "end"] as const, "center"),
    anchorBlock: enumText(element, "anchor-block", ["start", "center", "end"] as const, "center"),
  };
}

function pathPlacementPolicy(element: StructuredElement): TextPathPlacementPolicy {
  return {
    z: integer(element, "z"),
    side: enumText(element, "side", ["left", "right"] as const, "left"),
    orientation: enumText(element, "orientation", ["follow", "upright"] as const, "follow"),
    startMarginPx: numeric(element, "start-margin", 0),
    endMarginPx: numeric(element, "end-margin", 0),
    align: enumText(element, "align", ["start", "center", "end"] as const, "start"),
    reverse: booleanValue(element.attributes.reverse, `${element.name}.reverse`, false),
    overflow: enumText(element, "overflow", ["visible", "clip"] as const, "visible"),
  };
}

function createFineTextFragment(form: FineTextForm, externalContent: boolean): GraphFragment {
  const placementKind = form === "flow" ? "area" : form;
  const geometryInput = form === "flow" ? "frame" : form;
  const operations: FragmentOperation[] = [{
    id: "text:placement",
    producer: placementKind === "area" ? textFineProducers.bindArea
      : placementKind === "point" ? textFineProducers.bindPoint : textFineProducers.bindPath,
    inputs: {
      [geometryInput]: input("geometry"),
      policy: input("placementPolicy"),
      ...(form === "path" ? { marginMotion: input("pathMotion") } : {}),
    },
    result: { kind: "output", name: "placement" },
  }];
  if (externalContent) operations.push({
    id: "text:content",
    producer: textFineProducers.materializePlainItem,
    inputs: { spec: input("spec"), content: input("content") },
    result: { kind: "output", name: "spec" },
  });
  operations.push(
    {
      id: "text:occurrence",
      producer: textFineProducers.createOccurrence,
      inputs: {
        timeline: input("timeline"), placement: operation("text:placement"),
        spec: externalContent ? operation("text:content") : input("spec"),
        style: input("style"), motion: input("motion"), window: input("window"),
      },
      result: { kind: "output", name: "occurrence" },
    },
    {
      id: "text:render",
      producer: textFineProducers.renderOccurrence,
      inputs: { timeline: input("timeline"), occurrence: operation("text:occurrence") },
      result: { kind: "output", name: "visual" },
    },
  );
  return sealGraphFragment({
    inputs: [
      { name: "timeline", type: timelineTypes.timeline },
      { name: "geometry", type: form === "flow" ? spatialTypes.frame : form === "point" ? spatialTypes.point : spatialTypes.path },
      { name: "placementPolicy", type: form === "flow" ? textFineTypes.flowPlacementPolicy : form === "point" ? textFineTypes.pointPlacementPolicy : textFineTypes.pathPlacementPolicy },
      ...(form === "path" ? [{ name: "pathMotion", type: textFineTypes.pathMotion }] : []),
      { name: "spec", type: externalContent ? textFineTypes.plainItemSpec : textFineTypes.itemSpec },
      ...(externalContent ? [{ name: "content", type: textTypes.text }] : []),
      { name: "style", type: textFineTypes.style },
      { name: "motion", type: textFineTypes.motion },
      { name: "window", type: temporalTypes.window },
    ],
    operations,
    exports: [
      { name: "occurrence", type: textFineTypes.occurrence, root: operation("text:occurrence") },
      { name: "visual", type: compositionTypes.visualTrack, root: operation("text:render") },
    ],
  });
}

function decodeFineTextOccurrenceSurface(form: FineTextForm): StructuredSurfaceHandler {
  return ({ element, resolveReference }) => {
    const geometryAttribute = form === "flow" ? "within" : form;
    const geometryType = form === "flow" ? spatialTypes.frame : form === "point" ? spatialTypes.point : spatialTypes.path;
    allowed(element, [
      "id", "timeline", geometryAttribute, "style", "motion", "content", "z",
      ...(form === "flow" ? FLOW_ATTRIBUTES : form === "point" ? POINT_ATTRIBUTES : PATH_ATTRIBUTES),
      ...fineTextWindowAttributeNames,
    ], ["id", "timeline", geometryAttribute, "style", "z"]);
    const id = text(element, "id");
    const context = resolveTemporalContext({ element, resolveReference });
    const window = resolveTemporalWindowReference({ element, resolveReference });
    const geometry = reference(element.attributes[geometryAttribute], `${element.name}.${geometryAttribute}`, geometryType, resolveReference);
    const style = reference(element.attributes.style, `${element.name}.style`, textFineTypes.style, resolveReference);
    const defaultMotionId = `${id}.__still-motion`;
    const motion = element.attributes.motion === undefined
      ? ({ kind: "record", id: defaultMotionId } as const)
      : reference(element.attributes.motion, `${element.name}.motion`, textFineTypes.motion, resolveReference).ref;
    const content = element.attributes.content === undefined
      ? undefined
      : reference(element.attributes.content, `${element.name}.content`, textTypes.text, resolveReference);
    if (content !== undefined) empty(element);
    const specId = `${id}.__spec`;
    const placementPolicyId = `${id}.__placement-policy`;
    const placementPolicy = form === "flow" ? flowPlacementPolicy(element)
      : form === "point" ? pointPlacementPolicy(element) : pathPlacementPolicy(element);
    const defaultPathMotionId = `${id}.__still-path-motion`;
    const pathMotion = form !== "path" ? undefined : element.attributes["path-motion"] === undefined
      ? ({ kind: "record", id: defaultPathMotionId } as const)
      : reference(element.attributes["path-motion"], `${element.name}.path-motion`, textFineTypes.pathMotion, resolveReference).ref;
    const spec = content === undefined
      ? sealTextItemSpec({ id, document: document(element, resolveReference) })
      : sealPlainTextItemSpec({ id });
    const fragment = createFineTextFragment(form, content !== undefined);
    return {
      records: [
        {
          id: defaultMotionId, type: textFineTypes.motion,
          value: { kind: "inline", value: stillTextMotion(defaultMotionId) }, range: element.range,
        },
        {
          id: placementPolicyId,
          type: form === "flow" ? textFineTypes.flowPlacementPolicy : form === "point" ? textFineTypes.pointPlacementPolicy : textFineTypes.pathPlacementPolicy,
          value: { kind: "inline", value: placementPolicy }, range: element.range,
        },
        ...(form !== "path" ? [] : [{
          id: defaultPathMotionId, type: textFineTypes.pathMotion,
          value: { kind: "inline" as const, value: stillTextPathMotion(defaultPathMotionId) }, range: element.range,
        }]),
        {
          id: specId, type: content === undefined ? textFineTypes.itemSpec : textFineTypes.plainItemSpec,
          value: { kind: "inline", value: spec }, range: element.range,
        },
      ],
      components: [
        {
          id, fragment: fragment.id,
          inputs: {
            timeline: context.timeline.ref, geometry: geometry.ref,
            placementPolicy: { kind: "record", id: placementPolicyId },
            ...(pathMotion === undefined ? {} : { pathMotion }),
            spec: { kind: "record", id: specId },
            ...(content === undefined ? {} : { content: content.ref }),
            style: style.ref, motion, window: window.ref,
          },
          outputs: { occurrence: `${id}.occurrence`, visual: `${id}.visual` }, range: element.range,
        },
      ],
      fragments: [fragment],
      exports: [`${id}.occurrence`, `${id}.visual`],
    };
  };
}

export const decodeTypographyFlowSurface = decodeFineTextOccurrenceSurface("flow");
export const decodeTypographyPointSurface = decodeFineTextOccurrenceSurface("point");
export const decodeTypographyPathSurface = decodeFineTextOccurrenceSurface("path");

function createMaskFragment(id: string): GraphFragment {
  const inputs = [
    { name: "timeline", type: timelineTypes.timeline },
    { name: "occurrence", type: textFineTypes.occurrence },
    { name: "material", type: mediaTypes.compositableSurface },
    { name: "spec", type: textFineTypes.maskSpec },
  ];
  return sealGraphFragment({
    inputs,
    operations: [
      {
        id: "text-mask:render", producer: textFineProducers.renderOccurrenceMask,
        inputs: { timeline: input("timeline"), occurrence: input("occurrence"), material: input("material"), spec: input("spec") },
        result: { kind: "output", name: "visual" },
      },
    ],
    exports: [{
      name: "visual", type: compositionTypes.visualTrack, root: operation("text-mask:render"),
    }],
  });
}

export const decodeTypographyMaskSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  allowed(element, ["id", "timeline", "text", "material", "mode", "fit"], ["id", "timeline", "text", "material"]);
  empty(element);
  const id = text(element, "id");
  const context = resolveTemporalContext({ element, resolveReference });
  const occurrence = reference(element.attributes.text, `${element.name}.text`, textFineTypes.occurrence, resolveReference);
  const material = reference(element.attributes.material, `${element.name}.material`, mediaTypes.compositableSurface, resolveReference);
  const specId = `${id}.__spec`;
  const spec = sealTextMaskSpec({
    id,
    mode: enumText(element, "mode", ["alpha", "luminance"] as const, "alpha"),
    materialFit: enumText(element, "fit", ["contain", "cover", "fill"] as const, "cover"),
  });
  const fragment = createMaskFragment(id);
  return {
    records: [{ id: specId, type: textFineTypes.maskSpec, value: { kind: "inline", value: spec }, range: element.range }],
    components: [{
      id, fragment: fragment.id,
      inputs: { timeline: context.timeline.ref, occurrence: occurrence.ref, material: material.ref, spec: { kind: "record", id: specId } },
      outputs: { visual: `${id}.visual` }, range: element.range,
    }],
    fragments: [fragment],
    exports: [`${id}.visual`],
  };
};
