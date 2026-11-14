import { pictureType, type ProgramSource } from "@hypit/audiovisual";
import { visualProgramHtmlSource } from "@hypit/audiovisual-html";
import {
  htmlTextFragment,
  htmlLineUnionRuntime,
  htmlVisual,
  type HtmlTextNode,
  type HtmlTextPaintLayer,
  type HtmlTextTypography,
} from "@hypit/html-program";
import type { NleAudiovisualComponentResolver } from "@hypit/nle-audiovisual";
import { assertFontStackRef } from "@hypit/media";
import {
  resolveNleComponentSharedValue,
  resolveNlePictureLayout,
  type NleComponentItem,
  type NleComponentParameterAuthoring,
  type NleComponentResolver,
  type NlePackageSymbol,
  type NleComposition,
} from "@hypit/nle";
import { canonicalize } from "@hypit/protocol";
import { type GenerationModuleDefinition } from "@hypit/generation-build";
import { sealLocalSpatialDomain } from "@hypit/spatial/algebra";
import { sealLocalTemporalDomain } from "@hypit/temporal/algebra";

import {
  type CaptionCuePayload,
  type CaptionDisplayWord,
} from "@hypit/caption";
import {
  assertCaptionNleComponentParameters,
  editCaptionNleComponentParameters,
  type CaptionNleComponentEdit,
  type CaptionNleComponentParameters,
} from "@hypit/caption-nle";
import { captionFineHtmlRuntime } from "./html-runtime.js";
import type {
  CaptionFineActiveBoxParameters,
  CaptionFineActiveUnderlineParameters,
  CaptionFineAttributeFace,
  CaptionFineBoxParameters,
  CaptionFineOneShotMotion,
  CaptionFineStyleParameters,
  CaptionFineUnderlineParameters,
} from "./types.js";

const oneShotMotions = [
  "none", "fade", "pop", "scale", "spring", "bounce", "elastic", "stamp", "tilt", "zoom-blur",
  "flip-x", "flip-y", "spin", "squash", "stretch", "slide-left", "slide-right", "slide-up",
  "slide-down", "blur-in", "wipe-left", "wipe-right", "wipe-up", "wipe-down",
] as const satisfies readonly CaptionFineOneShotMotion[];

export const captionFineNleComponentSymbol: NlePackageSymbol = {
  module: { name: "@hypit/caption-fine" },
  name: "fine",
};

/** Package identity used by ordinary NLE package selection; behavior remains in the NLE facets. */
export const captionFineNleManifest: GenerationModuleDefinition = {
  name: captionFineNleComponentSymbol.module.name,
  dependencies: [],
  types: [],
  capabilities: [],
  producers: [],
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be a record.`);
  return value as Readonly<Record<string, unknown>>;
}

function exactKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[], label: string): void {
  const allowed = new Set(keys);
  for (const name of Object.keys(value)) assert(allowed.has(name), `${label} field ${name} is unknown.`);
}

function optionalNumber(value: unknown, fallback: number, label: string, minimum: number, maximum: number): number {
  if (value === undefined) return fallback;
  assert(typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum,
    `${label} is invalid.`);
  return value;
}

function optionalInteger(value: unknown, fallback: number, label: string, minimum: number, maximum: number): number {
  const result = optionalNumber(value, fallback, label, minimum, maximum);
  assert(Number.isSafeInteger(result), `${label} must be an integer.`);
  return result;
}

function optionalColor(value: unknown, fallback: string, label: string): string {
  if (value === undefined) return fallback;
  assert(typeof value === "string" && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(value), `${label} is invalid.`);
  return value;
}

function alphaHex(value: string, opacity: number): string {
  const authored = value.length === 9 ? Number.parseInt(value.slice(7, 9), 16) / 255 : 1;
  const alpha = Math.round(Math.max(0, Math.min(1, authored * opacity)) * 255)
    .toString(16).padStart(2, "0");
  return `${value.slice(0, 7)}${alpha}`;
}

function boxShadowCss(value: NormalizedBox): string {
  if (value.shadow.opacity <= 0) return "none";
  return `${value.shadow.offsetX}px ${value.shadow.offsetY}px ${value.shadow.blur}px ${value.shadow.spread}px ${alphaHex(
    value.shadow.color, value.shadow.opacity,
  )}`;
}

function optionalFont(value: unknown, fallback = "system-ui, sans-serif"): string {
  if (value === undefined) return fallback;
  assert(typeof value === "string" && /^[A-Za-z0-9 ,'"-]{1,160}$/u.test(value),
    "Fine Caption fontFamily is invalid.");
  return value;
}

function optionalChoice<const T extends readonly string[]>(
  value: unknown,
  fallback: T[number],
  choices: T,
  label: string,
): T[number] {
  if (value === undefined) return fallback;
  assert(typeof value === "string" && choices.includes(value), `${label} is invalid.`);
  return value as T[number];
}

type NormalizedBox = Required<Omit<CaptionFineBoxParameters, "shadow">> & {
  readonly shadow: {
    readonly color: string;
    readonly opacity: number;
    readonly blur: number;
    readonly offsetX: number;
    readonly offsetY: number;
    readonly spread: number;
  };
};
type NormalizedActiveBox = NormalizedBox & Required<Pick<CaptionFineActiveBoxParameters,
  "mode" | "enter" | "exit" | "transitionFrames">>;
type NormalizedUnderline = Required<CaptionFineUnderlineParameters>;
type NormalizedActiveUnderline = Required<CaptionFineActiveUnderlineParameters>;

function box(value: unknown, active: false): NormalizedBox;
function box(value: unknown, active: true): NormalizedActiveBox;
function box(value: unknown, active: boolean): NormalizedBox | NormalizedActiveBox {
  const input = value === undefined ? {} : record(value, active ? "Fine Caption activeBox" : "Fine Caption cueBox");
  exactKeys(input, active
    ? ["mode", "continuity", "background", "borderColor", "borderWidth", "borderRadius", "paddingX", "paddingY",
      "shadow", "enter", "exit", "transitionFrames"]
    : ["continuity", "background", "borderColor", "borderWidth", "borderRadius", "paddingX", "paddingY", "shadow"],
  active ? "Fine Caption activeBox" : "Fine Caption cueBox");
  const shadowInput = input.shadow === undefined ? {} : record(input.shadow,
    active ? "Fine Caption activeBox shadow" : "Fine Caption cueBox shadow");
  exactKeys(shadowInput, ["blur", "color", "offsetX", "offsetY", "opacity", "spread"],
    active ? "Fine Caption activeBox shadow" : "Fine Caption cueBox shadow");
  return {
    ...(active ? { mode: optionalChoice(input.mode, "off", ["off", "current", "trail"] as const,
      "Fine Caption activeBox mode"),
    enter: optionalChoice(input.enter, "none", oneShotMotions, "Fine Caption activeBox enter"),
    exit: optionalChoice(input.exit, "none", oneShotMotions, "Fine Caption activeBox exit"),
    transitionFrames: optionalInteger(input.transitionFrames, 0,
      "Fine Caption activeBox transitionFrames", 0, 120) } : {}),
    continuity: optionalChoice(input.continuity, "isolated", ["isolated", "joined"] as const,
      "Fine Caption box continuity"),
    background: optionalColor(input.background, active ? "#ffd54a" : "#00000000",
      active ? "Fine Caption activeBox background" : "Fine Caption cueBox background"),
    borderColor: optionalColor(input.borderColor, "#00000000",
      active ? "Fine Caption activeBox borderColor" : "Fine Caption cueBox borderColor"),
    borderWidth: optionalNumber(input.borderWidth, 0, "Fine Caption box borderWidth", 0, 40),
    borderRadius: optionalNumber(input.borderRadius, active ? 8 : 0, "Fine Caption box borderRadius", 0, 200),
    paddingX: optionalNumber(input.paddingX, 0, "Fine Caption box paddingX", 0, 200),
    paddingY: optionalNumber(input.paddingY, 0, "Fine Caption box paddingY", 0, 200),
    shadow: {
      color: optionalColor(shadowInput.color, "#000000", "Fine Caption box shadow color"),
      opacity: optionalNumber(shadowInput.opacity, 0, "Fine Caption box shadow opacity", 0, 1),
      blur: optionalNumber(shadowInput.blur, 0, "Fine Caption box shadow blur", 0, 200),
      offsetX: optionalNumber(shadowInput.offsetX, 0, "Fine Caption box shadow offsetX", -200, 200),
      offsetY: optionalNumber(shadowInput.offsetY, 0, "Fine Caption box shadow offsetY", -200, 200),
      spread: optionalNumber(shadowInput.spread, 0, "Fine Caption box shadow spread", 0, 100),
    },
  } as NormalizedBox | NormalizedActiveBox;
}

function underline(value: unknown, active: false, fallbackColor: string): NormalizedUnderline;
function underline(value: unknown, active: true, fallbackColor: string): NormalizedActiveUnderline;
function underline(
  value: unknown,
  active: boolean,
  fallbackColor: string,
): NormalizedUnderline | NormalizedActiveUnderline {
  const label = active ? "Fine Caption activeUnderline" : "Fine Caption underline";
  const input = value === undefined ? {} : record(value, label);
  exactKeys(input, ["color", "mode", "offset", "style", "thickness"], label);
  return {
    mode: active
      ? optionalChoice(input.mode, "off", ["off", "current", "trail"] as const, `${label} mode`)
      : optionalChoice(input.mode, "off", ["off", "always"] as const, `${label} mode`),
    color: optionalColor(input.color, fallbackColor, `${label} color`),
    thickness: optionalNumber(input.thickness, active ? 3 : 2, `${label} thickness`, 0, 40),
    offset: optionalNumber(input.offset, 4, `${label} offset`, -100, 100),
    style: optionalChoice(input.style, "solid", ["solid", "double", "dotted", "dashed", "wavy"] as const,
      `${label} style`),
  } as NormalizedUnderline | NormalizedActiveUnderline;
}

function attributes(value: unknown): readonly CaptionFineAttributeFace[] {
  if (value === undefined) return [];
  assert(Array.isArray(value), "Fine Caption attributeFaces must be an array.");
  return value.map((item, index) => {
    const input = record(item, `Fine Caption attributeFaces.${index}`);
    exactKeys(input, ["attribute", "value", "fontFamily", "fontWeight", "fontStyle"],
      `Fine Caption attributeFaces.${index}`);
    assert(typeof input.attribute === "string" && input.attribute.trim().length > 0,
      `Fine Caption attributeFaces.${index}.attribute is invalid.`);
    assert(typeof input.value === "string" || typeof input.value === "number" || typeof input.value === "boolean",
      `Fine Caption attributeFaces.${index}.value is invalid.`);
    return {
      attribute: input.attribute,
      value: input.value,
      ...(input.fontFamily === undefined ? {} : { fontFamily: optionalFont(input.fontFamily) }),
      ...(input.fontWeight === undefined ? {} : { fontWeight: optionalInteger(input.fontWeight, 700,
        `Fine Caption attributeFaces.${index}.fontWeight`, 100, 900) }),
      ...(input.fontStyle === undefined ? {} : { fontStyle: optionalChoice(input.fontStyle, "normal",
        ["normal", "italic"] as const, `Fine Caption attributeFaces.${index}.fontStyle`) }),
    };
  });
}

function wordTypography(
  word: CaptionDisplayWord,
  faces: readonly CaptionFineAttributeFace[],
): HtmlTextTypography | undefined {
  let typography: HtmlTextTypography = {};
  for (const face of faces) {
    if (!word.attributes.some((attribute) => attribute.name === face.attribute && attribute.value === face.value)) continue;
    typography = {
      ...typography,
      ...(face.fontFamily === undefined ? {} : { fontFamily: face.fontFamily }),
      ...(face.fontWeight === undefined ? {} : { fontWeight: face.fontWeight }),
      ...(face.fontStyle === undefined ? {} : { fontStyle: face.fontStyle }),
    };
  }
  return Object.keys(typography).length === 0 ? undefined : typography;
}

function captionTextNodes(
  payload: CaptionCuePayload,
  faces: readonly CaptionFineAttributeFace[],
  maxWordsPerLine: number | undefined,
  wordGap: number,
): readonly HtmlTextNode[] {
  const words = new Map(payload.words.map((word) => [word.id, word] as const));
  const nodes: HtmlTextNode[] = [];
  const gap = (id: string): HtmlTextNode => ({
    kind: "text",
    id,
    text: " ",
    style: {
      inlineAdvancePx: wordGap,
      paints: [],
    },
  });
  let wordsOnLine = 0;
  for (const [unitIndex, unit] of payload.units.entries()) {
    const startsLine = maxWordsPerLine !== undefined && wordsOnLine > 0
      && wordsOnLine + unit.wordIds.length > maxWordsPerLine;
    if (startsLine) {
      nodes.push({ kind: "break", id: `caption-row-${unitIndex}` });
      wordsOnLine = 0;
    }
    const firstWord = words.get(unit.wordIds[0]!)!;
    if (!startsLine && unitIndex > 0 && firstWord.separatorBefore === " ") {
      // A Cue boundary owns its spacing. Keep that spacing outside the Unit so
      // an isolated active box encloses glyphs, not the preceding gap. This is
      // the same flow boundary used by the original Fine renderer.
      nodes.push(gap(`caption-gap-${unitIndex}`));
    }
    nodes.push({
      kind: "group",
      id: unit.id,
      children: unit.wordIds.flatMap((wordId, wordIndex): readonly HtmlTextNode[] => {
        const word = words.get(wordId)!;
        const typography = wordTypography(word, faces);
        return [
          ...(wordIndex > 0 && word.separatorBefore === " "
            ? [gap(`caption-gap-${unitIndex}-${wordIndex}`)] : []),
          {
          kind: "text",
          id: word.id,
          text: word.text,
          ...(typography === undefined ? {} : { style: { typography } }),
          } satisfies HtmlTextNode,
        ];
      }),
    });
    wordsOnLine += unit.wordIds.length;
  }
  return nodes;
}

function structuralLineCount(payload: CaptionCuePayload, maxWordsPerLine: number | undefined): number {
  if (payload.units.length === 0) return 0;
  if (maxWordsPerLine === undefined) return 1;
  let lines = 1;
  let wordsOnLine = 0;
  for (const unit of payload.units) {
    if (wordsOnLine > 0 && wordsOnLine + unit.wordIds.length > maxWordsPerLine) {
      lines += 1;
      wordsOnLine = 0;
    }
    wordsOnLine += unit.wordIds.length;
  }
  return lines;
}

function resolveCaptionFine(item: NleComponentItem, context: { readonly project: NleComposition }) {
  assert(item.picture !== undefined, `NLE Fine Caption ${item.id} has no Picture appearance.`);
  assertCaptionNleComponentParameters(item.parameters, item.duration);
  const parameters = item.parameters;
  const caption = parameters.caption;
  const linkedStyle = resolveNleComponentSharedValue(context.project, item, "style");
  const style = record(linkedStyle.value, `NLE Fine Caption ${item.id} style`) as CaptionFineStyleParameters;
  const pictureLayout = resolveNlePictureLayout(context.project, item.picture.layout);
  exactKeys(style as Readonly<Record<string, unknown>>, [
    "fonts", "color", "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "wordGap",
    "language", "direction", "writingMode", "textTransform", "variantCaps", "kerning",
    "textAlign", "blockAlign", "inlineSize", "wrap", "maxWordsPerLine", "maxLines", "overflow",
    "minimumScale", "outlineColor", "outlineWidth", "shadowColor", "shadowBlur", "shadowOffsetX",
    "shadowOffsetY", "shadowSpread", "glow", "longShadow", "gradient", "opacity",
    "cueBox", "activeBox", "karaoke", "activePaint", "entry", "exit", "atom", "activeResponse", "loop",
    "slideDistance", "attributeFaces",
    "underline", "activeUnderline",
  ], `NLE Fine Caption ${item.id} style`);
  const fonts = style.fonts;
  if (fonts !== undefined) assertFontStackRef(fonts, "Fine Caption fonts");
  const color = optionalColor(style.color, "#ffffff", "Fine Caption color");
  const opacity = optionalNumber(style.opacity, 1, "Fine Caption opacity", 0, 1);
  const fontFamily = optionalFont(style.fontFamily);
  const fontSize = optionalNumber(style.fontSize, 58, "Fine Caption fontSize", 1, 500);
  const fontWeight = optionalInteger(style.fontWeight, 800, "Fine Caption fontWeight", 100, 900);
  const lineHeight = optionalNumber(style.lineHeight, 1.05, "Fine Caption lineHeight", 0.5, 4);
  const letterSpacing = optionalNumber(style.letterSpacing, 0, "Fine Caption letterSpacing", -20, 100);
  // Fine has always treated authored word gap as a physical replacement for a normal space.
  // Its omitted value scales with the type size instead of collapsing words together.
  const wordGap = optionalNumber(style.wordGap, fontSize * 0.25, "Fine Caption wordGap", 0, 100);
  const language = style.language;
  if (language !== undefined) {
    assert(typeof language === "string" && /^[A-Za-z0-9]{1,8}(?:-[A-Za-z0-9]{1,8})*$/u.test(language),
      "Fine Caption language is invalid.");
  }
  const direction = optionalChoice(style.direction, "ltr", ["auto", "ltr", "rtl"] as const,
    "Fine Caption direction");
  const writingMode = optionalChoice(style.writingMode, "horizontal-tb",
    ["horizontal-tb", "vertical-rl", "vertical-lr"] as const, "Fine Caption writingMode");
  const textTransform = optionalChoice(style.textTransform, "none",
    ["none", "uppercase", "lowercase", "capitalize"] as const, "Fine Caption textTransform");
  const variantCaps = optionalChoice(style.variantCaps, "normal",
    ["normal", "small-caps", "all-small-caps"] as const, "Fine Caption variantCaps");
  const kerning = optionalChoice(style.kerning, "auto", ["auto", "normal", "none"] as const,
    "Fine Caption kerning");
  const textAlign = optionalChoice(style.textAlign, "center", ["left", "center", "right"] as const,
    "Fine Caption textAlign");
  const blockAlign = optionalChoice(style.blockAlign, "center", ["start", "center", "end"] as const,
    "Fine Caption blockAlign");
  const inlineSize = optionalChoice(style.inlineSize, "hug", ["hug", "fixed"] as const,
    "Fine Caption inlineSize");
  const wrap = optionalChoice(style.wrap, "word", ["none", "word", "grapheme"] as const,
    "Fine Caption wrap");
  const maxWordsPerLine = style.maxWordsPerLine === undefined ? undefined
    : optionalInteger(style.maxWordsPerLine, 1, "Fine Caption maxWordsPerLine", 1, 10_000);
  const maxLines = style.maxLines === undefined ? undefined
    : optionalInteger(style.maxLines, 1, "Fine Caption maxLines", 1, 1_000);
  const overflow = optionalChoice(style.overflow, "visible",
    ["visible", "clip", "ellipsis", "shrink"] as const, "Fine Caption overflow");
  const minimumScale = style.minimumScale === undefined ? undefined
    : optionalNumber(style.minimumScale, 0.5, "Fine Caption minimumScale", 0.01, 1);
  assert(overflow === "shrink" || minimumScale === undefined,
    "Fine Caption minimumScale belongs only to shrink overflow.");
  assert(overflow !== "shrink" || minimumScale !== undefined,
    "Fine Caption shrink overflow requires minimumScale.");
  assert(overflow !== "ellipsis" || maxLines !== undefined,
    "Fine Caption ellipsis overflow requires maxLines.");
  const structuralLines = structuralLineCount(caption, maxWordsPerLine);
  assert(maxLines === undefined || structuralLines <= maxLines,
    `Fine Caption constructs ${structuralLines} structural lines but maxLines is ${maxLines}.`);
  const outlineColor = optionalColor(style.outlineColor, "#000000", "Fine Caption outlineColor");
  const outlineWidth = optionalNumber(style.outlineWidth, 0, "Fine Caption outlineWidth", 0, 40);
  const shadowColor = optionalColor(style.shadowColor, "#00000000", "Fine Caption shadowColor");
  const shadowBlur = optionalNumber(style.shadowBlur, 0, "Fine Caption shadowBlur", 0, 100);
  const shadowOffsetX = optionalNumber(style.shadowOffsetX, 0, "Fine Caption shadowOffsetX", -100, 100);
  const shadowOffsetY = optionalNumber(style.shadowOffsetY, 0, "Fine Caption shadowOffsetY", -100, 100);
  const shadowSpread = optionalNumber(style.shadowSpread, 0, "Fine Caption shadowSpread", 0, 100);
  const gradientInput = style.gradient === undefined ? undefined : record(style.gradient, "Fine Caption gradient");
  if (gradientInput !== undefined) exactKeys(gradientInput, ["angleDeg", "from", "to"], "Fine Caption gradient");
  const gradient = gradientInput === undefined ? undefined : {
    from: optionalColor(gradientInput.from, color, "Fine Caption gradient.from"),
    to: optionalColor(gradientInput.to, color, "Fine Caption gradient.to"),
    angleDeg: optionalNumber(gradientInput.angleDeg, 90, "Fine Caption gradient.angleDeg", -3600, 3600),
  };
  const glowInput = style.glow === undefined ? {} : record(style.glow, "Fine Caption glow");
  exactKeys(glowInput, ["blur", "color", "opacity", "spread"], "Fine Caption glow");
  const glow = {
    color: optionalColor(glowInput.color, color, "Fine Caption glow.color"),
    opacity: optionalNumber(glowInput.opacity, 0, "Fine Caption glow.opacity", 0, 1),
    blur: optionalNumber(glowInput.blur, 0, "Fine Caption glow.blur", 0, 200),
    spread: optionalNumber(glowInput.spread, 0, "Fine Caption glow.spread", 0, 100),
  };
  const longShadowInput = style.longShadow === undefined ? {} : record(style.longShadow, "Fine Caption longShadow");
  exactKeys(longShadowInput, ["angleDeg", "color", "distance", "opacity", "steps"], "Fine Caption longShadow");
  const longShadow = {
    color: optionalColor(longShadowInput.color, "#000000", "Fine Caption longShadow.color"),
    opacity: optionalNumber(longShadowInput.opacity, 0, "Fine Caption longShadow.opacity", 0, 1),
    distance: optionalNumber(longShadowInput.distance, 0, "Fine Caption longShadow.distance", 0, 500),
    angleDeg: optionalNumber(longShadowInput.angleDeg, 45, "Fine Caption longShadow.angleDeg", -3600, 3600),
    steps: optionalInteger(longShadowInput.steps, Math.min(32, Math.max(1, Math.ceil(
      optionalNumber(longShadowInput.distance, 0, "Fine Caption longShadow.distance", 0, 500),
    ))), "Fine Caption longShadow.steps", 1, 128),
  };
  const cueBox = box(style.cueBox, false);
  const activeBox = box(style.activeBox, true);
  const karaokeInput = style.karaoke === undefined ? {} : record(style.karaoke, "Fine Caption karaoke");
  exactKeys(karaokeInput, ["mode", "transition", "activeColor"], "Fine Caption karaoke");
  const karaoke = {
    mode: optionalChoice(karaokeInput.mode, "off", ["off", "current", "trail"] as const,
      "Fine Caption karaoke mode"),
    transition: optionalChoice(karaokeInput.transition, "step", ["step", "wipe"] as const,
      "Fine Caption karaoke transition"),
    activeColor: optionalColor(karaokeInput.activeColor, "#ffd54a", "Fine Caption activeColor"),
  };
  const activePaintInput = style.activePaint === undefined
    ? {} : record(style.activePaint, "Fine Caption activePaint");
  exactKeys(activePaintInput, [
    "color", "gradient", "glow", "longShadow", "opacity", "outlineColor", "outlineWidth",
    "shadowBlur", "shadowColor", "shadowOffsetX", "shadowOffsetY", "shadowSpread",
  ], "Fine Caption activePaint");
  const activeColor = optionalColor(activePaintInput.color,
    karaoke.activeColor, "Fine Caption activePaint.color");
  const activeOpacity = optionalNumber(activePaintInput.opacity, opacity,
    "Fine Caption activePaint.opacity", 0, 1);
  const activeGradientInput = activePaintInput.gradient === undefined || activePaintInput.gradient === null
    ? undefined
      : record(activePaintInput.gradient, "Fine Caption activePaint.gradient");
  if (activeGradientInput !== undefined) {
    exactKeys(activeGradientInput, ["angleDeg", "from", "to"], "Fine Caption activePaint.gradient");
  }
  const activeGradient = activeGradientInput === undefined ? undefined : {
    from: optionalColor(activeGradientInput.from, activeColor, "Fine Caption activePaint.gradient.from"),
    to: optionalColor(activeGradientInput.to, activeColor, "Fine Caption activePaint.gradient.to"),
    angleDeg: optionalNumber(activeGradientInput.angleDeg, 90,
      "Fine Caption activePaint.gradient.angleDeg", -3600, 3600),
  };
  const activeOutlineColor = optionalColor(activePaintInput.outlineColor, outlineColor,
    "Fine Caption activePaint.outlineColor");
  const activeOutlineWidth = optionalNumber(activePaintInput.outlineWidth, outlineWidth,
    "Fine Caption activePaint.outlineWidth", 0, 40);
  const activeShadowColor = optionalColor(activePaintInput.shadowColor, shadowColor,
    "Fine Caption activePaint.shadowColor");
  const activeShadowBlur = optionalNumber(activePaintInput.shadowBlur, shadowBlur,
    "Fine Caption activePaint.shadowBlur", 0, 100);
  const activeShadowOffsetX = optionalNumber(activePaintInput.shadowOffsetX, shadowOffsetX,
    "Fine Caption activePaint.shadowOffsetX", -100, 100);
  const activeShadowOffsetY = optionalNumber(activePaintInput.shadowOffsetY, shadowOffsetY,
    "Fine Caption activePaint.shadowOffsetY", -100, 100);
  const activeShadowSpread = optionalNumber(activePaintInput.shadowSpread, shadowSpread,
    "Fine Caption activePaint.shadowSpread", 0, 100);
  const activeGlowInput = activePaintInput.glow === undefined
    ? undefined : record(activePaintInput.glow, "Fine Caption activePaint.glow");
  if (activeGlowInput !== undefined) {
    exactKeys(activeGlowInput, ["blur", "color", "opacity", "spread"], "Fine Caption activePaint.glow");
  }
  const activeGlow = {
    color: optionalColor(activeGlowInput?.color, glow.color, "Fine Caption activePaint.glow.color"),
    opacity: optionalNumber(activeGlowInput?.opacity, glow.opacity,
      "Fine Caption activePaint.glow.opacity", 0, 1),
    blur: optionalNumber(activeGlowInput?.blur, glow.blur, "Fine Caption activePaint.glow.blur", 0, 200),
    spread: optionalNumber(activeGlowInput?.spread, glow.spread,
      "Fine Caption activePaint.glow.spread", 0, 100),
  };
  const activeLongShadowInput = activePaintInput.longShadow === undefined
    ? undefined : record(activePaintInput.longShadow, "Fine Caption activePaint.longShadow");
  if (activeLongShadowInput !== undefined) {
    exactKeys(activeLongShadowInput, ["angleDeg", "color", "distance", "opacity", "steps"],
      "Fine Caption activePaint.longShadow");
  }
  const activeLongShadowDistance = optionalNumber(activeLongShadowInput?.distance, longShadow.distance,
    "Fine Caption activePaint.longShadow.distance", 0, 500);
  const activeLongShadow = {
    color: optionalColor(activeLongShadowInput?.color, longShadow.color,
      "Fine Caption activePaint.longShadow.color"),
    opacity: optionalNumber(activeLongShadowInput?.opacity, longShadow.opacity,
      "Fine Caption activePaint.longShadow.opacity", 0, 1),
    distance: activeLongShadowDistance,
    angleDeg: optionalNumber(activeLongShadowInput?.angleDeg, longShadow.angleDeg,
      "Fine Caption activePaint.longShadow.angleDeg", -3600, 3600),
    steps: optionalInteger(activeLongShadowInput?.steps,
      Math.min(32, Math.max(1, Math.ceil(activeLongShadowDistance))),
      "Fine Caption activePaint.longShadow.steps", 1, 128),
  };
  const entryInput = style.entry === undefined ? {} : record(style.entry, "Fine Caption entry");
  exactKeys(entryInput, ["kind", "frames", "startScale"], "Fine Caption entry");
  const entry = {
    kind: optionalChoice(entryInput.kind, "none", oneShotMotions,
      "Fine Caption entry kind"),
    frames: optionalInteger(entryInput.frames, 0, "Fine Caption entry frames", 0, 120),
    ...(entryInput.startScale === undefined ? {} : { startScale: optionalNumber(entryInput.startScale, 1,
      "Fine Caption entry startScale", 0.01, 10) }),
  };
  const exitInput = style.exit === undefined ? {} : record(style.exit, "Fine Caption exit");
  exactKeys(exitInput, ["kind", "frames"], "Fine Caption exit");
  const exit = {
    kind: optionalChoice(exitInput.kind, "none", oneShotMotions, "Fine Caption exit kind"),
    frames: optionalInteger(exitInput.frames, 0, "Fine Caption exit frames", 0, 120),
  };
  const atomInput = style.atom === undefined ? {} : record(style.atom, "Fine Caption atom");
  exactKeys(atomInput, ["enter", "enterFrames", "exit", "exitFrames", "reveal"], "Fine Caption atom");
  const atom = {
    enter: optionalChoice(atomInput.enter, "none", oneShotMotions, "Fine Caption atom.enter"),
    enterFrames: optionalInteger(atomInput.enterFrames, 0, "Fine Caption atom.enterFrames", 0, 120),
    exit: optionalChoice(atomInput.exit, "none", oneShotMotions, "Fine Caption atom.exit"),
    exitFrames: optionalInteger(atomInput.exitFrames, 0, "Fine Caption atom.exitFrames", 0, 120),
    reveal: optionalChoice(atomInput.reveal, "all", ["all", "on-start", "typewriter"] as const,
      "Fine Caption atom.reveal"),
  };
  const responseInput = style.activeResponse === undefined
    ? {} : record(style.activeResponse, "Fine Caption activeResponse");
  exactKeys(responseInput, ["frames", "kind", "scale"], "Fine Caption activeResponse");
  const activeResponse = {
    kind: optionalChoice(responseInput.kind, "none", oneShotMotions, "Fine Caption activeResponse.kind"),
    frames: optionalInteger(responseInput.frames, 6, "Fine Caption activeResponse.frames", 0, 120),
    scale: optionalNumber(responseInput.scale, 1.08, "Fine Caption activeResponse.scale", 0.01, 10),
  };
  const loopInput = style.loop === undefined ? {} : record(style.loop, "Fine Caption loop");
  exactKeys(loopInput, ["intensity", "kind", "periodFrames", "target"], "Fine Caption loop");
  const loop = {
    kind: optionalChoice(loopInput.kind, "none",
      ["none", "shake", "wobble", "glow-pulse", "breathe", "float", "pulse", "flicker"] as const,
      "Fine Caption loop.kind"),
    target: optionalChoice(loopInput.target, "cue", ["cue", "active-atom"] as const,
      "Fine Caption loop.target"),
    periodFrames: optionalInteger(loopInput.periodFrames, 12, "Fine Caption loop.periodFrames", 1, 600),
    intensity: optionalNumber(loopInput.intensity, 1, "Fine Caption loop.intensity", 0, 100),
  };
  const slideDistance = optionalNumber(style.slideDistance, 24, "Fine Caption slideDistance", 0, 1000);
  const attributeFaces = attributes(style.attributeFaces);
  const baseUnderline = underline(style.underline, false, color);
  const activeUnderline = underline(style.activeUnderline, true, karaoke.activeColor);
  const paintLayers = (value: {
    readonly color: string;
    readonly opacity: number;
    readonly gradient?: { readonly from: string; readonly to: string; readonly angleDeg: number };
    readonly outline: { readonly color: string; readonly width: number };
    readonly shadow: { readonly color: string; readonly blur: number; readonly offsetX: number;
      readonly offsetY: number; readonly spread: number };
    readonly glow: { readonly color: string; readonly opacity: number; readonly blur: number; readonly spread: number };
    readonly longShadow: { readonly color: string; readonly opacity: number; readonly distance: number;
      readonly angleDeg: number; readonly steps: number };
  }): readonly HtmlTextPaintLayer[] => [
    ...(value.longShadow.opacity > 0 && value.longShadow.distance > 0 ? [{
      kind: "long-shadow" as const,
      color: alphaHex(value.longShadow.color, value.longShadow.opacity),
      distancePx: value.longShadow.distance,
      angleDeg: value.longShadow.angleDeg,
      steps: value.longShadow.steps,
    }] : []),
    ...(value.glow.opacity > 0 && (value.glow.blur > 0 || value.glow.spread > 0) ? [{
      kind: "glow" as const,
      color: alphaHex(value.glow.color, value.glow.opacity),
      blurPx: value.glow.blur,
      spreadPx: value.glow.spread,
    }] : []),
    ...(value.shadow.color !== "#00000000"
      && (value.shadow.blur > 0 || value.shadow.offsetX !== 0
        || value.shadow.offsetY !== 0 || value.shadow.spread > 0) ? [{
      kind: "shadow" as const,
      color: value.shadow.color,
      offsetX: value.shadow.offsetX,
      offsetY: value.shadow.offsetY,
      blurPx: value.shadow.blur,
      spreadPx: value.shadow.spread,
    }] : []),
    ...(value.outline.width > 0 ? [{
      kind: "stroke" as const,
      paint: { kind: "solid" as const, color: value.outline.color },
      widthPx: value.outline.width,
      placement: "outside" as const,
    }] : []),
    { kind: "fill" as const, paint: value.gradient === undefined
      ? { kind: "solid" as const, color: alphaHex(value.color, 1) }
      : { kind: "linear-gradient" as const, angleDeg: value.gradient.angleDeg, stops: [
          { offset: 0, color: value.gradient.from, opacity: 1 },
          { offset: 1, color: value.gradient.to, opacity: 1 },
        ] } },
  ];
  const basePaints = paintLayers({
    color, opacity, ...(gradient === undefined ? {} : { gradient }),
    outline: { color: outlineColor, width: outlineWidth },
    shadow: { color: shadowColor, blur: shadowBlur, offsetX: shadowOffsetX,
      offsetY: shadowOffsetY, spread: shadowSpread },
    glow, longShadow,
  });
  const activePaints = paintLayers({
    color: activeColor, opacity: activeOpacity,
    ...(activeGradient === undefined ? {} : { gradient: activeGradient }),
    outline: { color: activeOutlineColor, width: activeOutlineWidth },
    shadow: { color: activeShadowColor, blur: activeShadowBlur, offsetX: activeShadowOffsetX,
      offsetY: activeShadowOffsetY, spread: activeShadowSpread },
    glow: activeGlow, longShadow: activeLongShadow,
  });
  const typography: HtmlTextTypography = {
    ...(fonts === undefined ? {} : { fonts }),
    fontFamily,
    fontSizePx: fontSize,
    fontWeight,
    fontStyle: "normal",
    lineHeight,
    letterSpacingPx: letterSpacing,
    ...(language === undefined ? {} : { language }),
    direction,
    writingMode,
    textTransform,
    variantCaps,
    kerning,
  };
  const textNodes = captionTextNodes(caption, attributeFaces, maxWordsPerLine, wordGap);
  const decoration = (value: NormalizedUnderline | NormalizedActiveUnderline) => value.mode === "off"
    ? undefined : { line: "underline" as const, color: value.color, thicknessPx: value.thickness,
      offsetPx: value.offset, style: value.style };
  const baseDecoration = decoration(baseUnderline);
  const text = htmlTextFragment({
    id: `${item.id}-text-base`, typography, paints: basePaints,
    ...(baseDecoration === undefined ? {} : { decoration: baseDecoration }),
    children: textNodes,
  });
  const activeText = karaoke.mode === "off" ? undefined : htmlTextFragment({
    id: `${item.id}-text-active`, typography, paints: activePaints, children: textNodes,
  });
  const activeUnderlineText = activeUnderline.mode === "off" ? undefined : htmlTextFragment({
    id: `${item.id}-text-active-underline`, typography,
    paints: [{ kind: "fill", paint: { kind: "solid", color: "#00000000" } }],
    decoration: decoration(activeUnderline)!,
    children: textNodes,
  });
  const sourceId = `${item.id}:caption-source`;
  const spatialDomain = sealLocalSpatialDomain({
    id: `${sourceId}:picture`,
    region: { x: 0, y: 0, width: pictureLayout.width, height: pictureLayout.height },
  });
  const source: ProgramSource = {
    id: sourceId,
    outputs: { picture: {
      kind: "signal",
      type: pictureType,
      domain: sealLocalTemporalDomain({ id: `${sourceId}:time`, duration: structuredClone(item.duration) }),
      spatialDomain,
    } },
  };
  return {
    source,
    pictureOutput: "picture",
    html: visualProgramHtmlSource(sourceId, "picture", htmlVisual({
      dependencies: text.dependencies,
      data: { caption, karaoke, cueBox, activeBox, entry, exit, atom,
        activeResponse, loop, slideDistance, direction,
        loopPaint: {
          base: { fill: color, glow: { color: glow.color, opacity: glow.opacity, blur: glow.blur } },
          active: { fill: activeColor, glow: {
            color: activeGlow.color, opacity: activeGlow.opacity, blur: activeGlow.blur,
          } },
        },
        layout: { overflow, minimumScale: minimumScale ?? 1 },
        underline: baseUnderline, activeUnderline },
      html: `<div data-hypit-caption-fine><span data-caption-layout><span data-caption-cue><svg data-caption-cue-union aria-hidden="true"><path></path></svg><svg data-caption-active-union aria-hidden="true"><path></path></svg><span data-caption-text-stack><span data-caption-text-layer="base" style="opacity:${opacity}">${text.html}</span>${activeText === undefined ? "" : `<span data-caption-text-layer="active" style="opacity:${activeOpacity}">${activeText.html}</span>`}${activeUnderlineText === undefined ? "" : `<span data-caption-text-layer="active-underline">${activeUnderlineText.html}</span>`}</span></span></span></div>`,
      css: `:scope>[data-hypit-caption-fine]{position:absolute;inset:0;display:flex;align-items:${blockAlign === "start" ? "flex-start" : blockAlign === "center" ? "center" : "flex-end"};justify-content:${textAlign === "left" ? "flex-start" : textAlign === "center" ? "center" : "flex-end"};text-align:${textAlign};${overflow === "visible" ? "" : "overflow:hidden;"}}:scope [data-caption-layout]{display:inline-block;${inlineSize === "fixed" ? "width:100%;" : "width:max-content;max-width:100%;"}}:scope [data-caption-cue]{position:relative;display:inline-block;${inlineSize === "fixed" ? "width:100%;" : "max-width:100%;"}box-sizing:border-box;${cueBox.continuity === "isolated" ? `padding:${cueBox.paddingY}px ${cueBox.paddingX}px;background:${cueBox.background};border:${cueBox.borderWidth}px solid ${cueBox.borderColor};border-radius:${cueBox.borderRadius}px;box-shadow:${boxShadowCss(cueBox)};` : ""}white-space:${wrap === "none" ? "nowrap" : "pre-wrap"};overflow-wrap:${wrap === "word" ? "anywhere" : "normal"};word-break:${wrap === "grapheme" ? "break-all" : "normal"};${overflow === "visible" ? "" : "overflow:hidden;"}}:scope [data-caption-cue-union],:scope [data-caption-active-union]{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}:scope [data-caption-cue-union]{z-index:0}:scope [data-caption-active-union]{z-index:1}:scope [data-caption-text-stack]{position:relative;z-index:2;display:inline-block;${overflow === "ellipsis" ? `display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:${maxLines};overflow:hidden;` : ""}}:scope [data-caption-text-layer="base"]{position:relative;z-index:2}:scope [data-caption-text-layer="active"],:scope [data-caption-text-layer="active-underline"]{position:absolute;inset:0;z-index:3;pointer-events:none}:scope [data-caption-text-layer="active-underline"]{z-index:4}:scope [data-hypit-text-kind="group"]{display:inline-flex;min-width:0;position:relative}:scope [data-caption-text-layer="active"] [data-hypit-text-kind="group"],:scope [data-caption-text-layer="active-underline"] [data-hypit-text-kind="group"]{opacity:0}`,
      setup: `${htmlLineUnionRuntime}\n${captionFineHtmlRuntime}`,
    })),
  };
}

export const captionFineNleResolver: NleComponentResolver = {
  component: captionFineNleComponentSymbol,
  resolve: (item, context) => {
    const { source, pictureOutput } = resolveCaptionFine(item, context);
    return { source, pictureOutput };
  },
};

export const captionFineNleAuthoring: NleComponentParameterAuthoring = {
  component: captionFineNleComponentSymbol,
  inspect: (context) => {
    resolveCaptionFine(context.item, context);
    return canonicalize(context.item.parameters);
  },
  edit: (operation, context) => {
    const { item } = context;
    assertCaptionNleComponentParameters(item.parameters, item.duration);
    const parameters = editCaptionNleComponentParameters(
      item.parameters as CaptionNleComponentParameters,
      operation as unknown as CaptionNleComponentEdit,
      item.duration,
    );
    resolveCaptionFine({ ...structuredClone(item), parameters: canonicalize(parameters) }, context);
    return canonicalize(parameters);
  },
};

export const captionFineNleAudiovisualResolver: NleAudiovisualComponentResolver = {
  component: captionFineNleComponentSymbol,
  resolve: (item, context) => ({ html: resolveCaptionFine(item, context).html }),
};
