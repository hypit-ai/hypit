import { assertFontStackRef } from "@narratage/media";
import type { FontStackRef } from "@narratage/media";
import type { SvsRecipe } from "@narratage/svs";

import { sealCommentStickerStyle } from "./program.js";
import type { CommentStickerStyle, CommentStickerTextStyle } from "./types.js";

/** Exported because the Recipe schema states the type of each of these, and a second list would drift. */
export const STYLE_PROPERTIES = [
  "stack-order",
  "background", "border-color", "border-width", "radius", "padding-x", "padding-y", "gap", "rotation",
  "shadow-color", "shadow-x", "shadow-y", "shadow-blur", "shadow-spread",
  "tail", "tail-width", "tail-height", "tail-offset-x",
  "avatar-fallback", "avatar-size", "avatar-border-width", "avatar-border-color", "avatar-background", "avatar-text-color",
  "header-size", "header-weight", "header-line-height", "header-color",
  "body-size", "body-weight", "body-line-height", "body-color", "body-max-lines",
  "meta-size", "meta-weight", "meta-line-height", "meta-color",
  "enter", "enter-frames", "enter-offset-y", "enter-start-scale", "enter-rotation-delta", "enter-easing",
  "exit", "exit-frames", "exit-offset-y", "exit-easing",
  "hold", "hold-amplitude-y", "hold-rotation-amplitude", "hold-period-frames",
] as const;

const KEYS = new Set<string>(STYLE_PROPERTIES);

function fail(recipe: SvsRecipe, message: string): never {
  throw new Error(`Comment Sticker Recipe ${recipe.path} ${message}`);
}

function optionalNumber(recipe: SvsRecipe, name: string): number | undefined {
  const value = recipe.properties[name];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) fail(recipe, `${name} must be a finite number.`);
  return value;
}

function number(recipe: SvsRecipe, name: string, fallback: number): number {
  return optionalNumber(recipe, name) ?? fallback;
}

function integer(recipe: SvsRecipe, name: string, fallback: number): number {
  const value = number(recipe, name, fallback);
  if (!Number.isSafeInteger(value)) fail(recipe, `${name} must be an integer.`);
  return value;
}

function optionalString(recipe: SvsRecipe, name: string): string | undefined {
  const value = recipe.properties[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) fail(recipe, `${name} must be text.`);
  return value.trim();
}

function string(recipe: SvsRecipe, name: string, fallback: string): string {
  return optionalString(recipe, name) ?? fallback;
}

function boolean(recipe: SvsRecipe, name: string, fallback: boolean): boolean {
  const value = recipe.properties[name];
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") fail(recipe, `${name} must be boolean.`);
  return value;
}

function oneOf<const T extends string>(recipe: SvsRecipe, name: string, values: readonly T[], fallback: T): T {
  const value = string(recipe, name, fallback);
  if (!values.includes(value as T)) fail(recipe, `${name} must be ${values.join(" | ")}.`);
  return value as T;
}

function typography(
  recipe: SvsRecipe,
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

export function decodeCommentStickerStyle(recipe: SvsRecipe, fonts: FontStackRef, id: string): CommentStickerStyle {
  assertFontStackRef(fonts, "Comment Sticker font stack");
  const unknown = Object.keys(recipe.properties).filter((key) => !KEYS.has(key));
  if (unknown.length > 0) fail(recipe, `does not accept ${unknown.join(", ")}.`);
  const body = typography(recipe, fonts, "body", { sizePx: 42, weight: 850, lineHeight: 1.16, color: "#111111" });
  return sealCommentStickerStyle({
    contract: "svml.comment-sticker-style@1",
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
        easing: oneOf(recipe, "enter-easing", ["linear", "ease-in", "ease-out", "ease-in-out"] as const, "ease-out"),
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
