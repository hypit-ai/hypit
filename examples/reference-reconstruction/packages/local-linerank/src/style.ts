import { assertFontArtifactRef, assertFontStackRef } from "@hypit/media";
import type { FontArtifactRef, FontStackRef } from "@hypit/media";
import { canonicalize } from "@hypit/protocol";
import type { SvsRecipe } from "@hypit/svs";

import { assertLinerankStyle } from "./schedule.js";
import type { LinerankStyle, LinerankTextStyle } from "./types.js";

const KEYS: readonly string[] = [
  "paper-background", "rule-color", "rule-gap",
  "title-size", "title-weight", "title-color", "title-line-height",
  "number-size", "number-weight", "number-color",
  "label-size", "label-weight", "label-color", "label-line-height",
  "top-padding", "left-padding", "right-padding", "row-height", "row-gap", "number-width",
  "type-frames-per-char",
  "circle-color", "circle-width", "circle-frames",
  "board-stack", "row-stack", "circle-stack",
];

function fail(recipe: SvsRecipe, message: string): never {
  throw new Error(`Linerank Recipe ${recipe.path} ${message}`);
}

function known(recipe: SvsRecipe): void {
  const set = new Set(KEYS);
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

function exactFonts(value: FontStackRef | FontArtifactRef): FontArtifactRef[] {
  if ("faces" in value) {
    assertFontStackRef(value, "Linerank font");
    return [...structuredClone(value.faces)];
  }
  assertFontArtifactRef(value, "Linerank font");
  return [structuredClone(value)];
}

function typography(
  recipe: SvsRecipe,
  fonts: readonly FontArtifactRef[],
  sizeName: string,
  weightName: string,
  colorName: string,
  lineHeightName: string,
  defaults: { readonly size: number; readonly weight: number; readonly color: string; readonly lineHeight: number },
): LinerankTextStyle {
  return {
    fonts: structuredClone(fonts),
    sizePx: number(recipe, sizeName, defaults.size),
    weight: integer(recipe, weightName, defaults.weight),
    color: text(recipe, colorName, defaults.color),
    lineHeight: number(recipe, lineHeightName, defaults.lineHeight),
  };
}

export function decodeLinerankStyle(
  recipe: SvsRecipe,
  font: FontStackRef | FontArtifactRef,
): LinerankStyle {
  known(recipe);
  const fonts = exactFonts(font);
  const style: LinerankStyle = {
    paperBackground: text(recipe, "paper-background", "#ffffff"),
    ruleColor: text(recipe, "rule-color", "#cfe0f5"),
    ruleGapPx: number(recipe, "rule-gap", 64),
    title: typography(recipe, fonts, "title-size", "title-weight", "title-color", "title-line-height", {
      size: 40, weight: 700, color: "#111111", lineHeight: 1.15,
    }),
    number: typography(recipe, fonts, "number-size", "number-weight", "number-color", "label-line-height", {
      size: 34, weight: 600, color: "#222222", lineHeight: 1.2,
    }),
    label: typography(recipe, fonts, "label-size", "label-weight", "label-color", "label-line-height", {
      size: 36, weight: 500, color: "#111111", lineHeight: 1.2,
    }),
    topPaddingPx: number(recipe, "top-padding", 120),
    leftPaddingPx: number(recipe, "left-padding", 56),
    rightPaddingPx: number(recipe, "right-padding", 40),
    rowHeightPx: number(recipe, "row-height", 72),
    rowGapPx: number(recipe, "row-gap", 10),
    numberWidthPx: number(recipe, "number-width", 64),
    typeFramesPerChar: integer(recipe, "type-frames-per-char", 4),
    circleColor: text(recipe, "circle-color", "#111111"),
    circleWidthPx: number(recipe, "circle-width", 3),
    circleFrames: integer(recipe, "circle-frames", 18),
    boardStackingOrder: integer(recipe, "board-stack", 20),
    rowStackingOrder: integer(recipe, "row-stack", 30),
    circleStackingOrder: integer(recipe, "circle-stack", 40),
  };
  assertLinerankStyle(style);
  return canonicalize(style) as unknown as LinerankStyle;
}
