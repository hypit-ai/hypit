import { assertFontArtifactRef, assertFontStackRef } from "@hypit/media";
import type { FontArtifactRef, FontStackRef } from "@hypit/media";
import { canonicalize } from "@hypit/protocol";
import type { SvsRecipe } from "@hypit/svs";

import { assertNotepadStyle } from "./schedule.js";
import type { NotepadStyle } from "./types.js";

const NOTEPAD_KEYS = [
  "surface-fit",
  "title-x", "title-y", "title-width", "title-size", "title-line-height",
  "title-tracking", "title-color", "title-underline",
  "opening-x", "opening-y", "opening-width", "opening-size", "opening-line-height",
  "opening-tracking", "opening-color", "opening-underline",
  "opening-shadow-x", "opening-shadow-y", "opening-shadow-blur", "opening-shadow-color",
  "row-x", "row-top", "row-width", "row-gap", "row-size", "row-line-height",
  "row-tracking", "row-color", "row-number-width",
  "mark-color", "mark-stroke", "mark-pad-x", "mark-pad-y", "mark-rotate", "mark-frames", "mark-advance",
  "title-type-frames", "row-type-frames",
  "surface-stack", "title-stack", "row-stack", "mark-stack",
] as const;

function fail(recipe: SvsRecipe, message: string): never {
  throw new Error(`Notepad Recipe ${recipe.path} ${message}`);
}

function known(recipe: SvsRecipe): void {
  const allowed = new Set<string>(NOTEPAD_KEYS);
  const unknown = Object.keys(recipe.properties).filter((key) => !allowed.has(key));
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

function exactFonts(value: FontStackRef | FontArtifactRef, label: string): FontArtifactRef[] {
  if ("faces" in value) {
    assertFontStackRef(value, label);
    return [...structuredClone(value.faces)];
  }
  assertFontArtifactRef(value, label);
  return [structuredClone(value)];
}

export function decodeNotepadStyle(
  recipe: SvsRecipe,
  fonts: {
    readonly lead: FontStackRef | FontArtifactRef;
    readonly emphasis: FontStackRef | FontArtifactRef;
    readonly row: FontStackRef | FontArtifactRef;
    readonly number?: FontStackRef | FontArtifactRef;
  },
): NotepadStyle {
  known(recipe);
  const openingShadowBlur = number(recipe, "opening-shadow-blur", 10);
  const style: NotepadStyle = {
    leadFonts: exactFonts(fonts.lead, "Notepad title font"),
    emphasisFonts: exactFonts(fonts.emphasis, "Notepad emphasis font"),
    rowFonts: exactFonts(fonts.row, "Notepad row font"),
    numberFonts: exactFonts(fonts.number ?? fonts.row, "Notepad number font"),
    surfaceFit: oneOf(recipe, "surface-fit", ["contain", "cover"] as const, "cover"),
    title: {
      xFraction: number(recipe, "title-x", 0.1),
      yFraction: number(recipe, "title-y", 0.19),
      widthFraction: number(recipe, "title-width", 0.82),
      sizePx: number(recipe, "title-size", 74),
      lineHeight: number(recipe, "title-line-height", 1.16),
      trackingPx: number(recipe, "title-tracking", 0),
      color: text(recipe, "title-color", "#1c1c1c"),
      underlinePx: number(recipe, "title-underline", 0),
    },
    opening: {
      xFraction: number(recipe, "opening-x", 0.08),
      yFraction: number(recipe, "opening-y", 0.55),
      widthFraction: number(recipe, "opening-width", 0.86),
      sizePx: number(recipe, "opening-size", 74),
      lineHeight: number(recipe, "opening-line-height", 1.16),
      trackingPx: number(recipe, "opening-tracking", 0),
      color: text(recipe, "opening-color", "#ffffff"),
      underlinePx: number(recipe, "opening-underline", 0),
      shadow: {
        offsetX: number(recipe, "opening-shadow-x", 0),
        offsetY: number(recipe, "opening-shadow-y", 2),
        blurPx: openingShadowBlur,
        color: text(recipe, "opening-shadow-color", "#00000080"),
      },
    },
    row: {
      xFraction: number(recipe, "row-x", 0.21),
      topFraction: number(recipe, "row-top", 0.36),
      widthFraction: number(recipe, "row-width", 0.72),
      gapPx: number(recipe, "row-gap", 96),
      sizePx: number(recipe, "row-size", 52),
      lineHeight: number(recipe, "row-line-height", 1.2),
      trackingPx: number(recipe, "row-tracking", 0),
      color: text(recipe, "row-color", "#1c1c1c"),
      numberWidthPx: number(recipe, "row-number-width", 54),
    },
    mark: {
      color: text(recipe, "mark-color", "#1c1c1c"),
      strokeWidthPx: number(recipe, "mark-stroke", 4),
      padXPx: number(recipe, "mark-pad-x", 16),
      padYPx: number(recipe, "mark-pad-y", 8),
      rotateDeg: number(recipe, "mark-rotate", -1.5),
      frames: integer(recipe, "mark-frames", 8),
      advance: number(recipe, "mark-advance", 0.5),
    },
    typing: {
      titleFramesPerCharacter: integer(recipe, "title-type-frames", 2),
      rowFramesPerCharacter: integer(recipe, "row-type-frames", 2),
    },
    stacking: {
      surface: integer(recipe, "surface-stack", 40),
      title: integer(recipe, "title-stack", 42),
      row: integer(recipe, "row-stack", 44),
      mark: integer(recipe, "mark-stack", 46),
    },
  };
  assertNotepadStyle(style);
  return canonicalize(style) as unknown as NotepadStyle;
}
