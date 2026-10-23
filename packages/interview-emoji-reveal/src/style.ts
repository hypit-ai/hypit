import { canonicalize } from "@hypit/hypit/protocol";
import type { Recipe } from "@hypit/hypit/recipe";

import { assertEmojiRevealStyle } from "./program.js";
import type { EmojiRevealStyle } from "./types.js";

const KEYS = new Set([
  "center-x", "top-y", "slot-size", "slot-gap", "padding-x", "padding-y",
  "background", "border-color", "border-width", "radius",
  "shadow-color", "shadow-x", "shadow-y", "shadow-blur", "shadow-spread",
  "icon-size", "reveal-frames",
]);

function fail(recipe: Recipe, message: string): never { throw new Error(`Emoji Reveal Recipe ${recipe.path} ${message}`); }
function numeric(recipe: Recipe, name: string, fallback: number): number {
  const value = recipe.properties[name] ?? fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) fail(recipe, `${name} must be a finite number.`);
  return value;
}
function integer(recipe: Recipe, name: string, fallback: number): number {
  const value = numeric(recipe, name, fallback);
  if (!Number.isSafeInteger(value)) fail(recipe, `${name} must be an integer.`);
  return value;
}
function text(recipe: Recipe, name: string, fallback: string): string {
  const value = recipe.properties[name] ?? fallback;
  if (typeof value !== "string" || value.trim().length === 0) fail(recipe, `${name} must be text.`);
  return value.trim();
}
export function decodeEmojiRevealStyle(id: string, recipe: Recipe): EmojiRevealStyle {
  const unknown = Object.keys(recipe.properties).filter((key) => !KEYS.has(key));
  if (unknown.length > 0) fail(recipe, `does not accept ${unknown.join(", ")}.`);
  const style: EmojiRevealStyle = {
    id,
    centerX: numeric(recipe, "center-x", 0.5), topY: numeric(recipe, "top-y", 0.07),
    slotSizePx: numeric(recipe, "slot-size", 72), gapPx: numeric(recipe, "slot-gap", 10),
    paddingXPx: numeric(recipe, "padding-x", 18), paddingYPx: numeric(recipe, "padding-y", 14),
    background: text(recipe, "background", "#FFFDF7"), borderColor: text(recipe, "border-color", "#161616"),
    borderWidthPx: numeric(recipe, "border-width", 4), radiusPx: numeric(recipe, "radius", 22),
    shadowColor: text(recipe, "shadow-color", "#000000B8"), shadowXPx: numeric(recipe, "shadow-x", 9),
    shadowYPx: numeric(recipe, "shadow-y", 10), shadowBlurPx: numeric(recipe, "shadow-blur", 0),
    shadowSpreadPx: numeric(recipe, "shadow-spread", 0), iconSizePx: numeric(recipe, "icon-size", 48),
    revealFrames: integer(recipe, "reveal-frames", 6),
  };
  assertEmojiRevealStyle(style);
  return canonicalize(style) as unknown as EmojiRevealStyle;
}
