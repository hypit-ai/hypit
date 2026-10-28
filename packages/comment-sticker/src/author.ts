import { assertFontStackRef } from "@hypit/media";
import type { FontStackRef } from "@hypit/media";
import type { Recipe } from "@hypit/hypit/recipe";

import { sealCommentStickerStyle } from "./program.js";
import type { CommentStickerStyle, CommentStickerTextStyle } from "./types.js";

/** Recipe vocabulary owned by the style decoder and reused by Studio. */
export const commentStickerRecipeProperties = [
  { name: "stack-order" },
  { name: "background" }, { name: "border-color" }, { name: "border-width" }, { name: "radius" },
  { name: "padding-x" }, { name: "padding-y" }, { name: "gap" }, { name: "rotation" },
  { name: "shadow-color" }, { name: "shadow-x" }, { name: "shadow-y" }, { name: "shadow-blur" },
  { name: "shadow-spread" }, { name: "tail" }, { name: "tail-width" }, { name: "tail-height" },
  { name: "tail-offset-x" }, { name: "avatar-fallback", values: ["none", "initial"] },
  { name: "avatar-size" }, { name: "avatar-border-width" }, { name: "avatar-border-color" },
  { name: "avatar-background" }, { name: "avatar-text-color" }, { name: "header-size" },
  { name: "header-weight" }, { name: "header-line-height" }, { name: "header-color" },
  { name: "body-size" }, { name: "body-weight" }, { name: "body-line-height" }, { name: "body-color" },
  { name: "body-max-lines" }, { name: "meta-size" }, { name: "meta-weight" },
  { name: "meta-line-height" }, { name: "meta-color" },
  { name: "enter", values: ["none", "fade", "pop", "slide-pop"] }, { name: "enter-frames" },
  { name: "enter-offset-y" }, { name: "enter-start-scale" }, { name: "enter-rotation-delta" },
  { name: "enter-easing", values: ["linear", "ease-in", "ease-out", "ease-in-out", "out-back"] },
  { name: "exit", values: ["none", "fade", "fade-up"] }, { name: "exit-frames" },
  { name: "exit-offset-y" },
  { name: "exit-easing", values: ["linear", "ease-in", "ease-out", "ease-in-out"] },
  { name: "hold", values: ["none", "float"] }, { name: "hold-amplitude-y" },
  { name: "hold-rotation-amplitude" }, { name: "hold-period-frames" },
] as const;

const KEYS = new Set<string>(commentStickerRecipeProperties.map(({ name }) => name));

function fail(recipe: Recipe, message: string): never {
  throw new Error(`Comment Sticker Recipe ${recipe.path} ${message}`);
}

function optionalNumber(recipe: Recipe, name: string): number | undefined {
  const value = recipe.properties[name];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) fail(recipe, `${name} must be a finite number.`);
  return value;
}

function number(recipe: Recipe, name: string, fallback: number): number {
  return optionalNumber(recipe, name) ?? fallback;
}

function integer(recipe: Recipe, name: string, fallback: number): number {
  const value = number(recipe, name, fallback);
  if (!Number.isSafeInteger(value)) fail(recipe, `${name} must be an integer.`);
  return value;
}

function optionalString(recipe: Recipe, name: string): string | undefined {
  const value = recipe.properties[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) fail(recipe, `${name} must be text.`);
  return value.trim();
}

function string(recipe: Recipe, name: string, fallback: string): string {
  return optionalString(recipe, name) ?? fallback;
}

function boolean(recipe: Recipe, name: string, fallback: boolean): boolean {
  const value = recipe.properties[name];
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") fail(recipe, `${name} must be boolean.`);
  return value;
}

function oneOf<const T extends string>(recipe: Recipe, name: string, values: readonly T[], fallback: T): T {
  const value = string(recipe, name, fallback);
  if (!values.includes(value as T)) fail(recipe, `${name} must be ${values.join(" | ")}.`);
  return value as T;
}

function typography(
  recipe: Recipe,
  fonts: FontStackRef,
  prefix: "header" | "body" | "meta",
  defaults: Omit<CommentStickerTextStyle, "fonts">,
): CommentStickerTextStyle {
  return {
    fonts: structuredClone(fonts.faces),
    sizePx: number(recipe, `${prefix}-size`, defaults.sizePx),
    weight: integer(recipe, `${prefix}-weight`, defaults.weight),
    lineHeight: number(recipe, `${prefix}-line-height`, defaults.lineHeight),
    color: string(recipe, `${prefix}-color`, defaults.color),
  };
}

export function decodeCommentStickerStyle(recipe: Recipe, fonts: FontStackRef, id: string): CommentStickerStyle {
  assertFontStackRef(fonts, "Comment Sticker font stack");
  const unknown = Object.keys(recipe.properties).filter((key) => !KEYS.has(key));
  if (unknown.length > 0) fail(recipe, `does not accept ${unknown.join(", ")}.`);
  const body = typography(recipe, fonts, "body", { sizePx: 42, weight: 850, lineHeight: 1.16, color: "#111111" });
  return sealCommentStickerStyle({

    id,
    stackingOrder: integer(recipe, "stack-order", 62),
    card: {
      background: string(recipe, "background", "#ffffff"),
      borderColor: string(recipe, "border-color", "#0000000e"),
      borderWidthPx: number(recipe, "border-width", 1),
      radiusPx: number(recipe, "radius", 28),
      paddingXPx: number(recipe, "padding-x", 28),
      paddingYPx: number(recipe, "padding-y", 24),
      gapPx: number(recipe, "gap", 18),
      rotationDeg: number(recipe, "rotation", -2.5),
      shadow: {
        color: string(recipe, "shadow-color", "#0000004d"),
        offsetX: number(recipe, "shadow-x", 0),
        offsetY: number(recipe, "shadow-y", 18),
        blurPx: number(recipe, "shadow-blur", 46),
        spreadPx: number(recipe, "shadow-spread", 0),
      },
      tail: {
        enabled: boolean(recipe, "tail", true),
        widthPx: number(recipe, "tail-width", 42),
        heightPx: number(recipe, "tail-height", 28),
        offsetXPx: number(recipe, "tail-offset-x", 58),
      },
    },
    avatar: {
      fallback: oneOf(recipe, "avatar-fallback", ["none", "initial"] as const, "none"),
      sizePx: number(recipe, "avatar-size", 58),
      borderWidthPx: number(recipe, "avatar-border-width", 3),
      borderColor: string(recipe, "avatar-border-color", "#ffffff"),
      background: string(recipe, "avatar-background", "#34313a"),
      textColor: string(recipe, "avatar-text-color", "#ffffff"),
    },
    header: typography(recipe, fonts, "header", { sizePx: 24, weight: 680, lineHeight: 1.15, color: "#8f8f8f" }),
    body: { ...body, maxLines: integer(recipe, "body-max-lines", 3) },
    meta: typography(recipe, fonts, "meta", { sizePx: 21, weight: 650, lineHeight: 1.15, color: "#8f8f8f" }),
    motion: {
      enter: {
        kind: oneOf(recipe, "enter", ["none", "fade", "pop", "slide-pop"] as const, "pop"),
        durationFrames: integer(recipe, "enter-frames", 17),
        offsetYPx: number(recipe, "enter-offset-y", -180),
        startScale: number(recipe, "enter-start-scale", 0.78),
        rotationDeltaDeg: number(recipe, "enter-rotation-delta", -4.5),
        easing: oneOf(recipe, "enter-easing", ["linear", "ease-in", "ease-out", "ease-in-out", "out-back"] as const, "ease-out"),
      },
      exit: {
        kind: oneOf(recipe, "exit", ["none", "fade", "fade-up"] as const, "fade-up"),
        durationFrames: integer(recipe, "exit-frames", 20),
        offsetYPx: number(recipe, "exit-offset-y", -28),
        easing: oneOf(recipe, "exit-easing", ["linear", "ease-in", "ease-out", "ease-in-out"] as const, "ease-in"),
      },
      hold: {
        kind: oneOf(recipe, "hold", ["none", "float"] as const, "float"),
        amplitudeYPx: number(recipe, "hold-amplitude-y", 4),
        rotationAmplitudeDeg: number(recipe, "hold-rotation-amplitude", 0.35),
        periodFrames: integer(recipe, "hold-period-frames", 84),
      },
    },
  });
}
