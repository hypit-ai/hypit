import {
  assertFontArtifactRef,
  assertFontStackRef,
} from "@hypit/media";
import type {
  FontArtifactRef,
  FontStackRef,
} from "@hypit/media";
import { canonicalize } from "@hypit/protocol";
import type { SvsRecipe } from "@hypit/svs";

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
  "board-stack", "item-stack", "stage-stack",
  "appear-gain", "move-gain", "sound-fade-frames",
] as const;

const TIER_KEYS = [
  ...COMMON_KEYS,
  "rows", "label-width", "padding", "row-height", "row-gap", "cell-gap",
  "icon-size", "icon-radius", "icon-fit", "stage-x", "stage-y", "stage-size",
] as const;

const COLUMN_KEYS = [
  ...COMMON_KEYS,
  "rank-colors", "padding", "row-height", "row-gap", "icon-size", "icon-radius", "icon-fit",
  "stage-x", "stage-y", "stage-size",
] as const;

const TOP_KEYS = [
  ...COMMON_KEYS,
  "slot-colors", "center-x", "baseline-y", "slot-gap", "icon-size", "icon-radius", "icon-fit",
  "ring-width", "label-gap",
] as const;

function fail(recipe: SvsRecipe, message: string): never {
  throw new Error(`Ranking Recipe ${recipe.path} ${message}`);
}

function known(recipe: SvsRecipe, allowed: readonly string[]): void {
  const set = new Set(allowed);
  const unknown = Object.keys(recipe.properties).filter((key) => !set.has(key));
  if (unknown.length > 0) fail(recipe, `does not accept ${unknown.join(", ")}.`);
}

function number(recipe: SvsRecipe, name: string, fallback: number): number {
  const value = recipe.properties[name];
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) fail(recipe, `${name} must be a finite number.`);
  return value;
}

function integer(recipe: SvsRecipe, name: string, fallback: number): number {
  const value = number(recipe, name, fallback);
  if (!Number.isSafeInteger(value)) fail(recipe, `${name} must be an integer.`);
  return value;
}

function text(recipe: SvsRecipe, name: string, fallback: string): string {
  const value = recipe.properties[name];
  if (value === undefined) return fallback;
  if (typeof value !== "string" || value.trim().length === 0) fail(recipe, `${name} must be text.`);
  return value.trim();
}

function oneOf<T extends string>(recipe: SvsRecipe, name: string, values: readonly T[], fallback: T): T {
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

function typography(recipe: SvsRecipe, fonts: readonly FontArtifactRef[]): RankingTextStyle {
  return {
    fonts: structuredClone(fonts),
    sizePx: number(recipe, "font-size", 28),
    weight: integer(recipe, "font-weight", 700),
    color: text(recipe, "text-color", "#ffffff"),
    lineHeight: number(recipe, "line-height", 1.15),
  };
}

function board(recipe: SvsRecipe): RankingBoardPaint {
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

function motion(recipe: SvsRecipe): RankingMotionStyle {
  return {
    appearFrames: integer(recipe, "appear-frames", 6),
    moveFrames: integer(recipe, "move-frames", 8),
    easing: oneOf(recipe, "motion-easing", ["linear", "ease-in", "ease-out", "ease-in-out"] as const, "ease-in-out"),
  };
}

function sound(recipe: SvsRecipe): RankingSoundStyle {
  const value: RankingSoundStyle = {

    appearGain: number(recipe, "appear-gain", 1),
    moveGain: number(recipe, "move-gain", 1),
    fadeFrames: integer(recipe, "sound-fade-frames", 0),
  };
  assertRankingSoundStyle(value);
  return canonicalize(value) as unknown as RankingSoundStyle;
}

function rowList(recipe: SvsRecipe): TierRowStyle[] {
  const raw = text(recipe, "rows", "s:S:#ef4444|a:A:#f59e0b|b:B:#22c55e|c:C:#3b82f6");
  return raw.split("|").map((item, index) => {
    const [id, label, color] = item.split(":").map((part) => part.trim());
    if (!id || !label || !color) fail(recipe, `rows entry ${index + 1} must be id:label:color.`);
    return { id, label, color };
  });
}

function colorList(recipe: SvsRecipe, name: string, fallback: string): string[] {
  const result = text(recipe, name, fallback).split("|").map((value) => value.trim()).filter(Boolean);
  if (result.length === 0) fail(recipe, `${name} is empty.`);
  return result;
}

export function decodeTierBoardStyle(
  recipe: SvsRecipe,
  font: FontStackRef | FontArtifactRef,
): { readonly style: TierBoardStyle; readonly sound: RankingSoundStyle } {
  known(recipe, TIER_KEYS);
  const fonts = exactFonts(font);
  const style: TierBoardStyle = {

    rows: rowList(recipe),
    board: board(recipe),
    text: typography(recipe, fonts),
    labelWidthPx: number(recipe, "label-width", 72),
    paddingPx: number(recipe, "padding", 18),
    rowHeightPx: number(recipe, "row-height", 92),
    rowGapPx: number(recipe, "row-gap", 10),
    cellGapPx: number(recipe, "cell-gap", 12),
    iconSizePx: number(recipe, "icon-size", 72),
    iconRadiusPx: number(recipe, "icon-radius", 12),
    iconFit: oneOf(recipe, "icon-fit", ["contain", "cover"] as const, "cover"),
    stagePoint: { x: number(recipe, "stage-x", 0.5), y: number(recipe, "stage-y", 0.23) },
    stageSizePx: number(recipe, "stage-size", 108),
    motion: motion(recipe),
    boardStackingOrder: integer(recipe, "board-stack", 20),
    stageStackingOrder: integer(recipe, "stage-stack", 25),
    itemStackingOrder: integer(recipe, "item-stack", 30),
  };
  assertTierBoardStyle(style);
  return { style: canonicalize(style) as unknown as TierBoardStyle, sound: sound(recipe) };
}

export function decodeColumnStyle(
  recipe: SvsRecipe,
  font: FontStackRef | FontArtifactRef,
): { readonly style: ColumnStyle; readonly sound: RankingSoundStyle } {
  known(recipe, COLUMN_KEYS);
  const fonts = exactFonts(font);
  const style: ColumnStyle = {

    board: board(recipe),
    text: typography(recipe, fonts),
    rankColors: colorList(recipe, "rank-colors", "#facc15|#d1d5db|#fb923c|#60a5fa|#a78bfa"),
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
  recipe: SvsRecipe,
  font: FontStackRef | FontArtifactRef,
): { readonly style: TopThreeStyle; readonly sound: RankingSoundStyle } {
  known(recipe, TOP_KEYS);
  const fonts = exactFonts(font);
  const style: TopThreeStyle = {

    text: typography(recipe, fonts),
    slotColors: colorList(recipe, "slot-colors", "#facc15|#d1d5db|#fb923c"),
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
