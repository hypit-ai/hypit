import type { ValueSchema } from "@hypit/protocol";

export const fineCaptionOneShotMotions = [
  "none", "fade", "pop", "scale", "spring", "bounce", "elastic", "stamp", "tilt", "zoom-blur",
  "flip-x", "flip-y", "spin", "squash", "stretch", "slide-left", "slide-right", "slide-up", "slide-down",
  "blur-in", "wipe-left", "wipe-right", "wipe-up", "wipe-down",
] as const;

const paired = (...names: readonly string[]): readonly string[] =>
  names.flatMap((name) => [name, `active-${name}`]);

const colors = new Set([
  ...paired("fill", "glow-color", "gradient-from", "gradient-to", "long-shadow-color", "shadow-color", "stroke-color"),
  "background", "border-color", "cue-shadow-color", "underline-color",
  "active-box-background", "active-box-border-color", "active-underline-color",
]);

const unitFractions = new Set([
  "cue-shadow-opacity", "height", "x", "y", "width",
  ...paired("opacity", "glow-opacity", "long-shadow-opacity", "shadow-opacity"),
]);

const integers = new Set([
  "stack-order",
  "lead-frames", "tail-frames",
  "max-lines", "max-words-per-line",
  "active-box-transition-frames", "active-response-frames",
  "atom-enter-frames", "atom-exit-frames", "cue-enter-frames", "cue-exit-frames",
  "loop-period-frames",
]);

const numbers = new Set([
  "size", "radius", "line-height", "border-width", "letter-spacing", "loop-intensity",
  "cue-shadow-blur", "cue-shadow-spread", "cue-shadow-x", "cue-shadow-y",
  "slide-distance", "word-gap", "active-box-border-width", "active-box-radius", "active-scale",
  "underline-offset", "underline-thickness", "active-underline-offset", "active-underline-thickness",
  ...paired("glow-blur", "glow-spread", "gradient-angle", "long-shadow-angle", "long-shadow-distance",
    "shadow-blur", "shadow-spread", "shadow-x", "shadow-y", "stroke-width"),
]);

const strings = new Set(["padding", "active-box-padding"]);

const enums: Readonly<Record<string, readonly string[]>> = {
  "handoff": ["cut", "overlap"],
  "align": ["left", "center", "right"],
  "block-align": ["start", "center", "end"],
  "anchor-x": ["left", "center", "right"],
  "anchor-y": ["top", "center", "bottom"],
  "direction": ["ltr", "rtl"],
  "inline-size": ["hug", "fixed"],
  "wrap": ["word", "grapheme"],
  "overflow": ["visible", "clip"],
  "kerning": ["auto", "normal", "none"],
  "caps": ["normal", "small-caps", "all-small-caps"],
  "text-transform": ["none", "uppercase", "lowercase", "capitalize"],
  "atom-reveal": ["all", "on-start", "typewriter"],
  "karaoke": ["off", "current", "trail"],
  "karaoke-transition": ["step", "wipe"],
  "underline": ["off", "always"],
  "active-underline": ["off", "current", "trail"],
  "active-box": ["off", "current", "trail"],
  "active-box-continuity": ["isolated", "joined"],
  "loop": ["none", "shake", "wobble", "glow-pulse", "breathe", "float", "pulse", "flicker"],
  "loop-target": ["cue", "active-atom"],
  "cue-enter": fineCaptionOneShotMotions,
  "cue-exit": fineCaptionOneShotMotions,
  "atom-enter": fineCaptionOneShotMotions,
  "atom-exit": fineCaptionOneShotMotions,
  "active-box-enter": fineCaptionOneShotMotions,
  "active-box-exit": fineCaptionOneShotMotions,
  "active-response": fineCaptionOneShotMotions,
};

export const fineCaptionRequiredRecipeProperties = [
  "align", "background", "fill",
  "line-height", "padding", "radius", "size", "stack-order", "width", "x", "y",
] as const;

export const fineCaptionOptionalRecipeProperties = [
  "active-box", "active-box-background", "active-box-border-color", "active-box-border-width",
  "active-box-continuity", "active-box-enter", "active-box-exit", "active-box-padding", "active-box-radius",
  "active-box-transition-frames", "active-fill", "active-glow-blur", "active-glow-color", "active-glow-opacity",
  "active-glow-spread",
  "active-gradient-angle", "active-gradient-from", "active-gradient-to", "active-long-shadow-angle",
  "active-long-shadow-color", "active-long-shadow-distance", "active-long-shadow-opacity", "active-opacity",
  "active-response", "active-response-frames", "active-scale", "active-shadow-blur", "active-shadow-color", "active-shadow-opacity",
  "active-shadow-spread", "active-shadow-x", "active-shadow-y", "active-stroke-color", "active-stroke-width", "active-underline",
  "active-underline-color", "active-underline-offset", "active-underline-thickness", "anchor-x", "anchor-y",
  "atom-enter", "atom-enter-frames", "atom-exit", "atom-exit-frames", "atom-reveal", "block-align", "border-color", "border-width", "caps", "cue-enter",
  "cue-shadow-blur", "cue-shadow-color", "cue-shadow-opacity", "cue-shadow-spread", "cue-shadow-x", "cue-shadow-y",
  "cue-enter-frames", "cue-exit", "cue-exit-frames", "direction", "glow-blur", "glow-color",
  "glow-opacity", "glow-spread", "gradient-angle", "gradient-from", "gradient-to", "height", "inline-size", "karaoke", "karaoke-transition", "kerning",
  "handoff", "lead-frames", "letter-spacing", "long-shadow-angle", "long-shadow-color", "long-shadow-distance", "long-shadow-opacity",
  "loop", "loop-intensity", "loop-period-frames", "loop-target", "max-lines", "max-words-per-line", "opacity", "overflow", "shadow-blur", "shadow-color",
  "shadow-opacity", "shadow-spread", "shadow-x", "shadow-y", "slide-distance", "stroke-color", "stroke-width", "text-transform",
  "tail-frames", "underline", "underline-color", "underline-offset", "underline-thickness", "word-gap", "wrap",
] as const;

function schemaFor(name: string): ValueSchema {
  if (colors.has(name)) return { kind: "string" };
  if (unitFractions.has(name)) return { kind: "number", minimum: 0, maximum: 1 };
  if (integers.has(name)) return { kind: "number", integer: true };
  if (numbers.has(name)) return { kind: "number" };
  if (strings.has(name)) return { kind: "string" };
  const values = enums[name];
  if (values !== undefined) return { kind: "string", enum: values };
  throw new Error(`Fine Caption Recipe property ${name} has no declared value shape`);
}

const required = new Set<string>(fineCaptionRequiredRecipeProperties);
const properties = [...fineCaptionRequiredRecipeProperties, ...fineCaptionOptionalRecipeProperties];

/** Public author contract for the exact properties accepted by a Fine Caption SVS Recipe. */
export const fineCaptionRecipeSchema: ValueSchema = {
  kind: "object",
  fields: Object.fromEntries(properties.map((name) => [
    name,
    required.has(name) ? { schema: schemaFor(name) } : { schema: schemaFor(name), optional: true },
  ])),
};
