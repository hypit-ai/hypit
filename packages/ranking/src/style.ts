import {
  assertFontArtifactRef,
  assertFontStackRef,
} from "@hypit/media";
import type {
  FontArtifactRef,
  FontStackRef,
} from "@hypit/media";
import { canonicalize } from "@hypit/hypit/protocol";
import type { CanonicalValue, ValueSchema } from "@hypit/hypit/protocol";
import type { Recipe } from "@hypit/hypit/recipe";

import {
  assertColumnStyle,
  assertRankingSoundStyle,
  assertTierBoardStyle,
  assertTopThreeStyle,
} from "./schedule.js";
import type {
  ColumnStyle,
  RankingBoardPaint,
  RankingMotionStyle,
  RankingSoundStyle,
  RankingTextStyle,
  TierBoardStyle,
  TierRowStyle,
  TopThreeStyle,
} from "./types.js";

const COMMON_KEYS = [
  "font-size", "font-weight", "text-color", "line-height",
  "appear-frames", "move-frames", "motion-easing",
  "board-background", "board-border-color", "board-border-width", "board-radius",
  "board-shadow-x", "board-shadow-y", "board-shadow-blur", "board-shadow-spread", "board-shadow-color",
  "board-stack", "item-stack",
  "appear-gain", "move-gain", "sound-fade-frames",
] as const;

const TIER_KEYS = [
  "rows", "label-text-color", "label-size", "line-height",
  "board-background", "board-border-color", "board-border-width",
  "label-width", "stage-x", "stage-y", "stage-size", "icon-radius-ratio", "icon-fit",
  "appear-frames", "move-frames", "board-stack", "stage-stack", "item-stack",
  "appear-gain", "move-gain", "sound-fade-frames",
] as const;

const COLUMN_KEYS = [
  ...COMMON_KEYS,
  "rank-colors", "padding", "row-height", "row-gap", "icon-size", "icon-radius", "icon-fit",
  "stage-x", "stage-y", "stage-size", "stage-stack",
] as const;

const TOP_KEYS = [
  ...COMMON_KEYS,
  "slot-colors", "center-x", "baseline-y", "slot-gap", "icon-size", "icon-radius", "icon-fit",
  "ring-width", "label-gap",
] as const;

export type RankingStyleDeclaration = "tier-style" | "column-style" | "top-three-style";
export type RankingRecipeProperty = {
  readonly name: string;
  readonly schema: ValueSchema;
  readonly fallback?: CanonicalValue;
};

const numberSchema = { kind: "number" } as const satisfies ValueSchema;
const integerSchema = { kind: "number", integer: true } as const satisfies ValueSchema;
const textSchema = { kind: "string", minLength: 1 } as const satisfies ValueSchema;
const colorListSchema = { kind: "array", minItems: 1, items: textSchema } as const satisfies ValueSchema;
const recipeSchemas: Readonly<Record<string, ValueSchema>> = {
  rows: { kind: "array", minItems: 1, items: { kind: "object", fields: {
    id: { schema: textSchema }, label: { schema: textSchema }, color: { schema: textSchema },
  } } },
  "rank-colors": colorListSchema,
  "slot-colors": { kind: "array", minItems: 3, maxItems: 3, items: textSchema },
  "icon-fit": { kind: "string", enum: ["contain", "cover"] },
  "motion-easing": { kind: "string", enum: ["linear", "ease-in", "ease-out", "ease-in-out"] },
};

const colorProperties = new Set([
  "text-color", "label-text-color", "board-background", "board-border-color", "board-shadow-color",
]);
const integerProperties = new Set([
  "font-weight", "appear-frames", "move-frames", "board-stack", "stage-stack", "item-stack", "sound-fade-frames",
]);
function recipeSchema(name: string): ValueSchema {
  return recipeSchemas[name] ?? (colorProperties.has(name) ? textSchema : integerProperties.has(name) ? integerSchema : numberSchema);
}

const tierFallbacks = {
  rows: [
    { id: "s", label: "S", color: "#EE5F52" }, { id: "a", label: "A", color: "#F0A04C" },
    { id: "b", label: "B", color: "#F0C84D" }, { id: "c", label: "C", color: "#EDE356" },
    { id: "d", label: "D", color: "#A6DA7B" },
  ],
  "label-text-color": "#2c2c2c", "label-size": 0.3, "line-height": 1,
  "board-background": "#2b2b30", "board-border-color": "#111315", "board-border-width": 3,
  "stage-x": 0.2, "stage-y": 0.3, "stage-size": 168, "icon-radius-ratio": 0.12, "icon-fit": "cover",
  "appear-frames": 8, "move-frames": 14, "board-stack": 20, "stage-stack": 25, "item-stack": 30,
  "appear-gain": 1, "move-gain": 1, "sound-fade-frames": 0,
} as const satisfies Readonly<Record<string, CanonicalValue>>;

const commonFallbacks = {
  "font-size": 28, "font-weight": 700, "text-color": "#ffffff", "line-height": 1.15,
  "appear-frames": 6, "move-frames": 8, "motion-easing": "ease-in-out",
  "board-background": "#151821", "board-border-color": "#ffffff33", "board-border-width": 1,
  "board-radius": 18, "board-shadow-x": 0, "board-shadow-y": 10, "board-shadow-blur": 24,
  "board-shadow-spread": 0, "board-shadow-color": "#00000066", "board-stack": 20, "item-stack": 30,
  "appear-gain": 1, "move-gain": 1, "sound-fade-frames": 0,
} as const satisfies Readonly<Record<string, CanonicalValue>>;

const columnFallbacks = {
  ...commonFallbacks,
  "rank-colors": ["#facc15", "#d1d5db", "#fb923c", "#60a5fa", "#a78bfa"],
  padding: 18, "row-height": 74, "row-gap": 10, "icon-size": 58, "icon-radius": 10, "icon-fit": "cover",
  "stage-x": 0.66, "stage-y": 0.73, "stage-size": 356, "stage-stack": 25,
} as const satisfies Readonly<Record<string, CanonicalValue>>;

const topFallbacks = {
  ...commonFallbacks,
  "slot-colors": ["#facc15", "#d1d5db", "#fb923c"], "center-x": 0.5, "baseline-y": 0.55,
  "slot-gap": 24, "icon-size": 104, "icon-radius": 52, "icon-fit": "cover", "ring-width": 5, "label-gap": 12,
} as const satisfies Readonly<Record<string, CanonicalValue>>;

const recipeKeys = {
  "tier-style": TIER_KEYS,
  "column-style": COLUMN_KEYS,
  "top-three-style": TOP_KEYS,
} as const;
const recipeFallbacks = {
  "tier-style": tierFallbacks,
  "column-style": columnFallbacks,
  "top-three-style": topFallbacks,
} as const;

export function rankingRecipeProperties(declaration: RankingStyleDeclaration): readonly RankingRecipeProperty[] {
  const fallbacks: Readonly<Record<string, CanonicalValue>> = recipeFallbacks[declaration];
  return recipeKeys[declaration].map((name) => ({
    name,
    schema: recipeSchema(name),
    ...(fallbacks[name] === undefined ? {} : { fallback: fallbacks[name] }),
  }));
}

function fail(recipe: Recipe, message: string): never {
  throw new Error(`Ranking Recipe ${recipe.path} ${message}`);
}

function known(recipe: Recipe, allowed: readonly string[]): void {
  const set = new Set(allowed);
  const unknown = Object.keys(recipe.properties).filter((key) => !set.has(key));
  if (unknown.length > 0) fail(recipe, `does not accept ${unknown.join(", ")}.`);
}

function number(recipe: Recipe, name: string, fallback: number): number {
  const value = recipe.properties[name];
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) fail(recipe, `${name} must be a finite number.`);
  return value;
}

function integer(recipe: Recipe, name: string, fallback: number): number {
  const value = number(recipe, name, fallback);
  if (!Number.isSafeInteger(value)) fail(recipe, `${name} must be an integer.`);
  return value;
}

function optionalNumber(recipe: Recipe, name: string): number | undefined {
  const value = recipe.properties[name];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) fail(recipe, `${name} must be a finite number.`);
  return value;
}

function text(recipe: Recipe, name: string, fallback: string): string {
  const value = recipe.properties[name];
  if (value === undefined) return fallback;
  if (typeof value !== "string" || value.trim().length === 0) fail(recipe, `${name} must be text.`);
  return value.trim();
}

function oneOf<T extends string>(recipe: Recipe, name: string, values: readonly T[], fallback: T): T {
  const value = text(recipe, name, fallback);
  if (!values.includes(value as T)) fail(recipe, `${name} must be ${values.join(" | ")}.`);
  return value as T;
}

function exactFonts(value: FontStackRef | FontArtifactRef): FontArtifactRef[] {
  if ("faces" in value) {
    assertFontStackRef(value, "Ranking font");
    return [...structuredClone(value.faces)];
  }
  assertFontArtifactRef(value, "Ranking font");
  return [structuredClone(value)];
}

function typography(recipe: Recipe, fonts: readonly FontArtifactRef[]): RankingTextStyle {
  return {
    fonts: structuredClone(fonts),
    sizePx: number(recipe, "font-size", 28),
    weight: integer(recipe, "font-weight", 700),
    color: text(recipe, "text-color", "#ffffff"),
    lineHeight: number(recipe, "line-height", 1.15),
  };
}

function board(recipe: Recipe): RankingBoardPaint {
  return {
    background: text(recipe, "board-background", "#151821"),
    borderColor: text(recipe, "board-border-color", "#ffffff33"),
    borderWidthPx: number(recipe, "board-border-width", 1),
    radiusPx: number(recipe, "board-radius", 18),
    shadow: {
      offsetX: number(recipe, "board-shadow-x", 0),
      offsetY: number(recipe, "board-shadow-y", 10),
      blurPx: number(recipe, "board-shadow-blur", 24),
      spreadPx: number(recipe, "board-shadow-spread", 0),
      color: text(recipe, "board-shadow-color", "#00000066"),
    },
  };
}

function motion(recipe: Recipe): RankingMotionStyle {
  return {
    appearFrames: integer(recipe, "appear-frames", 6),
    moveFrames: integer(recipe, "move-frames", 8),
    easing: oneOf(recipe, "motion-easing", ["linear", "ease-in", "ease-out", "ease-in-out"] as const, "ease-in-out"),
  };
}

function sound(recipe: Recipe): RankingSoundStyle {
  const value: RankingSoundStyle = {

    appearGain: number(recipe, "appear-gain", 1),
    moveGain: number(recipe, "move-gain", 1),
    fadeFrames: integer(recipe, "sound-fade-frames", 0),
  };
  assertRankingSoundStyle(value);
  return canonicalize(value) as unknown as RankingSoundStyle;
}

function rowList(recipe: Recipe): TierRowStyle[] {
  const value = recipe.properties.rows ?? [
    { id: "s", label: "S", color: "#EE5F52" },
    { id: "a", label: "A", color: "#F0A04C" },
    { id: "b", label: "B", color: "#F0C84D" },
    { id: "c", label: "C", color: "#EDE356" },
    { id: "d", label: "D", color: "#A6DA7B" },
  ];
  if (!Array.isArray(value) || value.length === 0) fail(recipe, "rows must be a non-empty array.");
  return value.map((item, index) => {
    if (item === null || Array.isArray(item) || typeof item !== "object") {
      fail(recipe, `rows entry ${index + 1} must be an object.`);
    }
    const { id, label, color } = item;
    if (typeof id !== "string" || id.trim().length === 0
      || typeof label !== "string" || label.trim().length === 0
      || typeof color !== "string" || color.trim().length === 0) {
      fail(recipe, `rows entry ${index + 1} requires text id, label and color fields.`);
    }
    return { id: id.trim(), label: label.trim(), color: color.trim() };
  });
}

function colorList(recipe: Recipe, name: string, fallback: readonly string[]): string[] {
  const value = recipe.properties[name] ?? fallback;
  if (!Array.isArray(value) || value.length === 0) fail(recipe, `${name} must be a non-empty color array.`);
  return value.map((item, index) => {
    if (typeof item !== "string" || item.trim().length === 0) fail(recipe, `${name} entry ${index + 1} must be a color.`);
    return item.trim();
  });
}

export function decodeTierBoardStyle(
  recipe: Recipe,
  font: FontStackRef | FontArtifactRef,
): { readonly style: TierBoardStyle; readonly sound: RankingSoundStyle } {
  known(recipe, TIER_KEYS);
  const fonts = exactFonts(font);
  const labelWidthRatio = optionalNumber(recipe, "label-width");
  const style: TierBoardStyle = {
    rows: rowList(recipe),
    fonts,
    labelTextColor: text(recipe, "label-text-color", "#2c2c2c"),
    labelSizeRatio: number(recipe, "label-size", 0.3),
    labelLineHeight: number(recipe, "line-height", 1),
    boardColor: text(recipe, "board-background", "#2b2b30"),
    borderColor: text(recipe, "board-border-color", "#111315"),
    borderWidthPx: number(recipe, "board-border-width", 3),
    ...(labelWidthRatio === undefined ? {} : { labelWidthRatio }),
    stagePoint: { x: number(recipe, "stage-x", 0.2), y: number(recipe, "stage-y", 0.3) },
    stageSizePx: number(recipe, "stage-size", 168),
    iconRadiusRatio: number(recipe, "icon-radius-ratio", 0.12),
    iconFit: oneOf(recipe, "icon-fit", ["contain", "cover"] as const, "cover"),
    motion: {
      appearFrames: integer(recipe, "appear-frames", 8),
      moveFrames: integer(recipe, "move-frames", 14),
    },
    boardStackingOrder: integer(recipe, "board-stack", 20),
    stageStackingOrder: integer(recipe, "stage-stack", 25),
    itemStackingOrder: integer(recipe, "item-stack", 30),
  };
  assertTierBoardStyle(style);
  return { style: canonicalize(style) as unknown as TierBoardStyle, sound: sound(recipe) };
}

export function decodeColumnStyle(
  recipe: Recipe,
  font: FontStackRef | FontArtifactRef,
): { readonly style: ColumnStyle; readonly sound: RankingSoundStyle } {
  known(recipe, COLUMN_KEYS);
  const fonts = exactFonts(font);
  const style: ColumnStyle = {

    board: board(recipe),
    text: typography(recipe, fonts),
    rankColors: colorList(recipe, "rank-colors", ["#facc15", "#d1d5db", "#fb923c", "#60a5fa", "#a78bfa"]),
    paddingPx: number(recipe, "padding", 18),
    rowHeightPx: number(recipe, "row-height", 74),
    rowGapPx: number(recipe, "row-gap", 10),
    iconSizePx: number(recipe, "icon-size", 58),
    iconRadiusPx: number(recipe, "icon-radius", 10),
    iconFit: oneOf(recipe, "icon-fit", ["contain", "cover"] as const, "cover"),
    stagePoint: { x: number(recipe, "stage-x", 0.66), y: number(recipe, "stage-y", 0.73) },
    stageSizePx: number(recipe, "stage-size", 356),
    motion: motion(recipe),
    boardStackingOrder: integer(recipe, "board-stack", 20),
    stageStackingOrder: integer(recipe, "stage-stack", 25),
    itemStackingOrder: integer(recipe, "item-stack", 30),
  };
  assertColumnStyle(style);
  return { style: canonicalize(style) as unknown as ColumnStyle, sound: sound(recipe) };
}

export function decodeTopThreeStyle(
  recipe: Recipe,
  font: FontStackRef | FontArtifactRef,
): { readonly style: TopThreeStyle; readonly sound: RankingSoundStyle } {
  known(recipe, TOP_KEYS);
  const fonts = exactFonts(font);
  const style: TopThreeStyle = {

    text: typography(recipe, fonts),
    slotColors: colorList(recipe, "slot-colors", ["#facc15", "#d1d5db", "#fb923c"]),
    centerX: number(recipe, "center-x", 0.5),
    baselineY: number(recipe, "baseline-y", 0.55),
    slotGapPx: number(recipe, "slot-gap", 24),
    iconSizePx: number(recipe, "icon-size", 104),
    iconRadiusPx: number(recipe, "icon-radius", 52),
    iconFit: oneOf(recipe, "icon-fit", ["contain", "cover"] as const, "cover"),
    ringWidthPx: number(recipe, "ring-width", 5),
    labelGapPx: number(recipe, "label-gap", 12),
    motion: motion(recipe),
    boardStackingOrder: integer(recipe, "board-stack", 20),
    itemStackingOrder: integer(recipe, "item-stack", 30),
  };
  assertTopThreeStyle(style);
  return { style: canonicalize(style) as unknown as TopThreeStyle, sound: sound(recipe) };
}
