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
import type { NleHtmlVideoComponentResolver } from "@hypit/html-video";
import { assertFontStackRef } from "@hypit/media";
import type {
  NleComponentItem,
  NleComponentParameterAuthoring,
  NleComponentResolver,
  NlePackageSymbol,
} from "@hypit/nle";
import { canonicalize, type ModuleManifest } from "@hypit/protocol";
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
  module: { name: "@hypit/caption-fine", version: "1" },
  name: "fine",
};

/** Package identity used by ordinary NLE package selection; behavior remains in the NLE facets. */
export const captionFineNleManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: captionFineNleComponentSymbol.module.name,
  version: captionFineNleComponentSymbol.module.version,
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

type NormalizedBox = Required<CaptionFineBoxParameters>;
type NormalizedActiveBox = Required<CaptionFineActiveBoxParameters>;
type NormalizedUnderline = Required<CaptionFineUnderlineParameters>;
type NormalizedActiveUnderline = Required<CaptionFineActiveUnderlineParameters>;

function box(value: unknown, active: false): NormalizedBox;
function box(value: unknown, active: true): NormalizedActiveBox;
function box(value: unknown, active: boolean): NormalizedBox | NormalizedActiveBox {
  const input = value === undefined ? {} : record(value, active ? "Fine Caption activeBox" : "Fine Caption cueBox");
  exactKeys(input, active
    ? ["mode", "continuity", "background", "borderColor", "borderWidth", "borderRadius", "paddingX", "paddingY"]
    : ["continuity", "background", "borderColor", "borderWidth", "borderRadius", "paddingX", "paddingY"],
  active ? "Fine Caption activeBox" : "Fine Caption cueBox");
  return {
    ...(active ? { mode: optionalChoice(input.mode, "off", ["off", "current", "trail"] as const,
      "Fine Caption activeBox mode") } : {}),
    continuity: optionalChoice(input.continuity, "isolated", ["isolated", "joined"] as const,
      "Fine Caption box continuity"),
    background: optionalColor(input.background, active ? "#ffd54a44" : "#00000000",
      active ? "Fine Caption activeBox background" : "Fine Caption cueBox background"),
    borderColor: optionalColor(input.borderColor, "#00000000",
      active ? "Fine Caption activeBox borderColor" : "Fine Caption cueBox borderColor"),
    borderWidth: optionalNumber(input.borderWidth, 0, "Fine Caption box borderWidth", 0, 40),
    borderRadius: optionalNumber(input.borderRadius, active ? 8 : 12, "Fine Caption box borderRadius", 0, 200),
    paddingX: optionalNumber(input.paddingX, active ? 5 : 14, "Fine Caption box paddingX", 0, 200),
    paddingY: optionalNumber(input.paddingY, active ? 2 : 10, "Fine Caption box paddingY", 0, 200),
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
    thickness: optionalNumber(input.thickness, 3, `${label} thickness`, 0, 40),
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
): readonly HtmlTextNode[] {
  const words = new Map(payload.words.map((word) => [word.id, word] as const));
  return payload.units.map((unit) => ({
    kind: "group",
    id: unit.id,
    children: unit.wordIds.map((wordId) => {
      const word = words.get(wordId)!;
      const typography = wordTypography(word, faces);
      return {
        kind: "text",
        id: word.id,
        text: `${word.separatorBefore}${word.text}`,
        ...(typography === undefined ? {} : { style: { typography } }),
      };
    }),
  }));
}

function resolveCaptionFine(item: NleComponentItem) {
  assert(item.picture !== undefined, `NLE Fine Caption ${item.id} has no Picture appearance.`);
  assertCaptionNleComponentParameters(item.parameters, "fine", item.duration);
  const parameters = item.parameters;
  const caption = parameters.caption;
  const style = record(parameters.style, `NLE Fine Caption ${item.id} style`) as CaptionFineStyleParameters;
  exactKeys(style as Readonly<Record<string, unknown>>, [
    "fonts", "color", "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "wordGap",
    "textAlign", "outlineColor", "outlineWidth", "shadowColor", "shadowBlur", "shadowOffsetX",
    "shadowOffsetY", "shadowSpread", "glow", "longShadow", "gradient", "opacity",
    "cueBox", "activeBox", "karaoke", "entry", "exit", "atom", "activeResponse", "loop",
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
  const wordGap = optionalNumber(style.wordGap, 0, "Fine Caption wordGap", 0, 100);
  const textAlign = optionalChoice(style.textAlign, "center", ["left", "center", "right"] as const,
    "Fine Caption textAlign");
  const outlineColor = optionalColor(style.outlineColor, "#000000", "Fine Caption outlineColor");
  const outlineWidth = optionalNumber(style.outlineWidth, 3, "Fine Caption outlineWidth", 0, 40);
  const shadowColor = optionalColor(style.shadowColor, "#00000099", "Fine Caption shadowColor");
  const shadowBlur = optionalNumber(style.shadowBlur, 0, "Fine Caption shadowBlur", 0, 100);
  const shadowOffsetX = optionalNumber(style.shadowOffsetX, 4, "Fine Caption shadowOffsetX", -100, 100);
  const shadowOffsetY = optionalNumber(style.shadowOffsetY, 5, "Fine Caption shadowOffsetY", -100, 100);
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
  const entryInput = style.entry === undefined ? {} : record(style.entry, "Fine Caption entry");
  exactKeys(entryInput, ["kind", "frames"], "Fine Caption entry");
  const entry = {
    kind: optionalChoice(entryInput.kind, "pop", oneShotMotions,
      "Fine Caption entry kind"),
    frames: optionalInteger(entryInput.frames, 5, "Fine Caption entry frames", 0, 120),
  };
  const exitInput = style.exit === undefined ? {} : record(style.exit, "Fine Caption exit");
  exactKeys(exitInput, ["kind", "frames"], "Fine Caption exit");
  const exit = {
    kind: optionalChoice(exitInput.kind, "none", oneShotMotions, "Fine Caption exit kind"),
    frames: optionalInteger(exitInput.frames, 5, "Fine Caption exit frames", 0, 120),
  };
  const atomInput = style.atom === undefined ? {} : record(style.atom, "Fine Caption atom");
  exactKeys(atomInput, ["enter", "enterFrames", "exit", "exitFrames", "reveal"], "Fine Caption atom");
  const atom = {
    enter: optionalChoice(atomInput.enter, "none", oneShotMotions, "Fine Caption atom.enter"),
    enterFrames: optionalInteger(atomInput.enterFrames, 4, "Fine Caption atom.enterFrames", 0, 120),
    exit: optionalChoice(atomInput.exit, "none", oneShotMotions, "Fine Caption atom.exit"),
    exitFrames: optionalInteger(atomInput.exitFrames, 4, "Fine Caption atom.exitFrames", 0, 120),
    reveal: optionalChoice(atomInput.reveal, "all", ["all", "on-start", "typewriter"] as const,
      "Fine Caption atom.reveal"),
  };
  const responseInput = style.activeResponse === undefined
    ? {} : record(style.activeResponse, "Fine Caption activeResponse");
  exactKeys(responseInput, ["frames", "kind", "scale"], "Fine Caption activeResponse");
  const activeResponse = {
    kind: optionalChoice(responseInput.kind, "none", oneShotMotions, "Fine Caption activeResponse.kind"),
    frames: optionalInteger(responseInput.frames, 4, "Fine Caption activeResponse.frames", 0, 120),
    scale: optionalNumber(responseInput.scale, 1, "Fine Caption activeResponse.scale", 0.01, 10),
  };
  const loopInput = style.loop === undefined ? {} : record(style.loop, "Fine Caption loop");
  exactKeys(loopInput, ["intensity", "kind", "periodFrames", "target"], "Fine Caption loop");
  const loop = {
    kind: optionalChoice(loopInput.kind, "none",
      ["none", "shake", "wobble", "glow-pulse", "breathe", "float", "pulse", "flicker"] as const,
      "Fine Caption loop.kind"),
    target: optionalChoice(loopInput.target, "cue", ["cue", "active-atom"] as const,
      "Fine Caption loop.target"),
    periodFrames: optionalInteger(loopInput.periodFrames, 24, "Fine Caption loop.periodFrames", 1, 600),
    intensity: optionalNumber(loopInput.intensity, 1, "Fine Caption loop.intensity", 0, 100),
  };
  const slideDistance = optionalNumber(style.slideDistance, 32, "Fine Caption slideDistance", 0, 1000);
  const attributeFaces = attributes(style.attributeFaces);
  const baseUnderline = underline(style.underline, false, color);
  const activeUnderline = underline(style.activeUnderline, true, karaoke.activeColor);
  const paints: HtmlTextPaintLayer[] = [];
  if (longShadow.opacity > 0 && longShadow.distance > 0) {
    paints.push({
      kind: "long-shadow",
      color: alphaHex(longShadow.color, longShadow.opacity),
      distancePx: longShadow.distance,
      angleDeg: longShadow.angleDeg,
      steps: longShadow.steps,
    });
  }
  if (glow.opacity > 0 && (glow.blur > 0 || glow.spread > 0)) {
    paints.push({
      kind: "glow",
      color: alphaHex(glow.color, glow.opacity),
      blurPx: glow.blur,
      spreadPx: glow.spread,
    });
  }
  if (shadowColor !== "#00000000"
    && (shadowBlur > 0 || shadowOffsetX !== 0 || shadowOffsetY !== 0 || shadowSpread > 0)) {
    paints.push({
      kind: "shadow",
      color: shadowColor,
      offsetX: shadowOffsetX,
      offsetY: shadowOffsetY,
      blurPx: shadowBlur,
      spreadPx: shadowSpread,
    });
  }
  if (outlineWidth > 0) {
    paints.push({
      kind: "stroke",
      paint: { kind: "solid", color: outlineColor },
      widthPx: outlineWidth,
      placement: "outside",
    });
  }
  paints.push({ kind: "fill", paint: gradient === undefined
    ? { kind: "solid", color: alphaHex(color, opacity) }
    : { kind: "linear-gradient", angleDeg: gradient.angleDeg, stops: [
        { offset: 0, color: gradient.from, opacity },
        { offset: 1, color: gradient.to, opacity },
      ] } });
  const text = htmlTextFragment({
    id: `${item.id}-text`,
    typography: {
      ...(fonts === undefined ? {} : { fonts }),
      fontFamily,
      fontSizePx: fontSize,
      fontWeight,
      fontStyle: "normal",
      lineHeight,
      letterSpacingPx: letterSpacing,
      wordSpacingPx: wordGap,
    },
    paints,
    children: captionTextNodes(caption, attributeFaces),
  });
  const sourceId = `${item.id}:caption-source`;
  const spatialDomain = sealLocalSpatialDomain({
    id: `${sourceId}:picture`,
    region: { x: 0, y: 0, width: item.picture.layout.width, height: item.picture.layout.height },
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
      data: { caption, color: alphaHex(color, opacity), karaoke, cueBox, activeBox, entry, exit, atom,
        activeResponse, loop, slideDistance,
        underline: baseUnderline, activeUnderline },
      html: `<div data-hypit-caption-fine><span data-caption-cue><svg data-caption-cue-union aria-hidden="true"><path></path></svg><svg data-caption-active-union aria-hidden="true"><path></path></svg><span data-caption-text-layer>${text.html}</span></span></div>`,
      css: `:scope>[data-hypit-caption-fine]{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:${textAlign}}:scope [data-caption-cue]{position:relative;display:inline-block;max-width:100%;box-sizing:border-box;${cueBox.continuity === "isolated" ? `padding:${cueBox.paddingY}px ${cueBox.paddingX}px;background:${cueBox.background};border:${cueBox.borderWidth}px solid ${cueBox.borderColor};border-radius:${cueBox.borderRadius}px;` : ""}white-space:pre-wrap;overflow-wrap:anywhere}:scope [data-caption-cue-union],:scope [data-caption-active-union]{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}:scope [data-caption-cue-union]{z-index:0}:scope [data-caption-active-union]{z-index:1}:scope [data-caption-text-layer]{position:relative;z-index:2}`,
      setup: `
        ${htmlLineUnionRuntime}
        const cue = root.querySelector('[data-caption-cue]');
        const cueUnion = root.querySelector('[data-caption-cue-union] path');
        const activeUnion = root.querySelector('[data-caption-active-union] path');
        const units = new Map([...root.querySelectorAll('[data-hypit-text-kind="group"]')]
          .map(element => [element.getAttribute('data-hypit-text-node'), element]));
        const allWords = [...root.querySelectorAll('[data-hypit-text-kind="text"]')];
        const seconds = value => Number(value.ticks) * value.timeBase.numerator / value.timeBase.denominator;
        const fps = context.frameRate.numerator / context.frameRate.denominator;
        const baseFillStyles = new Map([...root.querySelectorAll('[data-hypit-text-paint="fill"]')]
          .map(fill => [fill, {
            color: fill.style.color,
            backgroundImage: fill.style.backgroundImage,
            webkitBackgroundClip: fill.style.webkitBackgroundClip,
            webkitTextFillColor: fill.style.webkitTextFillColor,
          }]));
        const paintText = (element, progress, active) => {
          const fills = element.querySelectorAll('[data-hypit-text-paint="fill"]');
          const paintSolid = selected => {
            for (const fill of fills) {
              fill.style.color = selected;
              fill.style.backgroundImage = '';
              fill.style.webkitBackgroundClip = '';
              fill.style.webkitTextFillColor = selected;
            }
          };
          if (data.karaoke.mode === 'off' || !active) {
            for (const fill of fills) {
              const base = baseFillStyles.get(fill);
              fill.style.color = base.color;
              fill.style.backgroundImage = base.backgroundImage;
              fill.style.webkitBackgroundClip = base.webkitBackgroundClip;
              fill.style.webkitTextFillColor = base.webkitTextFillColor;
            }
            return;
          }
          if (data.karaoke.transition === 'step' || progress >= 1) {
            paintSolid(data.karaoke.activeColor);
            return;
          }
          const percentage = Math.max(0, Math.min(100, progress * 100));
          for (const fill of fills) {
            fill.style.color = 'transparent';
            fill.style.backgroundImage = 'linear-gradient(90deg,' + data.karaoke.activeColor + ' 0%,'
              + data.karaoke.activeColor + ' ' + percentage + '%,' + data.color + ' ' + percentage + '%,'
              + data.color + ' 100%)';
            fill.style.webkitBackgroundClip = 'text';
            fill.style.webkitTextFillColor = 'transparent';
          }
        };
        const paintBox = (element, active) => {
          if (data.activeBox.continuity === 'joined' || !active || data.activeBox.mode === 'off') {
            element.style.background = '';
            element.style.border = '';
            element.style.borderRadius = '';
            element.style.padding = '';
            return;
          }
          element.style.background = data.activeBox.background;
          element.style.border = data.activeBox.borderWidth + 'px solid ' + data.activeBox.borderColor;
          element.style.borderRadius = data.activeBox.borderRadius + 'px';
          element.style.padding = data.activeBox.paddingY + 'px ' + data.activeBox.paddingX + 'px';
        };
        const paintUnderline = (element, selected) => {
          for (const word of element.querySelectorAll('[data-hypit-text-kind="text"]')) {
            if (selected.mode === 'off') {
              word.style.textDecorationLine = 'none';
              word.style.textDecorationColor = '';
              word.style.textDecorationThickness = '';
              word.style.textUnderlineOffset = '';
              word.style.textDecorationStyle = '';
            } else {
              word.style.textDecorationLine = 'underline';
              word.style.textDecorationColor = selected.color;
              word.style.textDecorationThickness = selected.thickness + 'px';
              word.style.textUnderlineOffset = selected.offset + 'px';
              word.style.textDecorationStyle = selected.style;
            }
          }
        };
        const clamp = value => Math.max(0, Math.min(1, value));
        const easeOut = value => 1 - Math.pow(1 - value, 3);
        const easeOutBack = value => {
          const c1 = 1.3, c3 = c1 + 1;
          return 1 + c3 * Math.pow(value - 1, 3) + c1 * Math.pow(value - 1, 2);
        };
        const easeOutBounce = value => {
          let x = value; const n1 = 7.5625, d1 = 2.75;
          if (x < 1 / d1) return n1 * x * x;
          if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
          if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
          return n1 * (x -= 2.625 / d1) * x + 0.984375;
        };
        const easeOutElastic = value => value === 0 || value === 1 ? value
          : Math.pow(2, -10 * value) * Math.sin((value * 10 - 0.75) * (2 * Math.PI / 3)) + 1;
        const neutral = { opacity: 1, transform: '', filter: '', clipPath: '' };
        const oneShot = (kind, progress) => {
          const value = clamp(progress), eased = easeOut(value), distance = data.slideDistance;
          const state = (opacity, transform, filter, clipPath) => ({
            opacity,
            transform: transform || '',
            filter: filter || '',
            clipPath: clipPath || '',
          });
          const scale = (from, position) => 'scale(' + (from + (1 - from) * position) + ')';
          if (kind === 'none') return neutral;
          if (kind === 'fade') return state(eased);
          if (kind === 'blur-in') return state(eased, scale(0.96, eased), 'blur(' + ((1 - eased) * 16) + 'px)');
          if (kind === 'pop') return state(eased, scale(0.6, easeOutBack(value)));
          if (kind === 'scale') return state(eased, scale(0.2, eased));
          if (kind === 'spring') return state(eased, scale(0.72,
            value >= 1 ? 1 : 1 - Math.exp(-5 * value) * Math.cos(10 * value)));
          if (kind === 'bounce') return state(eased, scale(0, easeOutBounce(value)));
          if (kind === 'elastic') return state(eased, scale(0, easeOutElastic(value)));
          if (kind === 'stamp') return state(eased, scale(1.35, easeOutBack(value)));
          if (kind === 'tilt') return state(eased,
            'rotate(' + ((1 - eased) * -8) + 'deg) ' + scale(0.94, eased));
          if (kind === 'zoom-blur') return state(eased, scale(1.18, eased),
            'blur(' + ((1 - eased) * 18) + 'px)');
          if (kind === 'flip-x') return state(eased,
            'perspective(600px) rotateX(' + ((1 - eased) * 88) + 'deg) ' + scale(0.92, eased));
          if (kind === 'flip-y') return state(eased,
            'perspective(600px) rotateY(' + ((1 - eased) * -88) + 'deg) ' + scale(0.92, eased));
          if (kind === 'spin') return state(eased,
            'rotate(' + ((1 - eased) * -180) + 'deg) ' + scale(0.55, eased));
          if (kind === 'squash') return state(eased,
            'scaleX(' + (1.28 - 0.28 * easeOutBack(value)) + ') scaleY('
              + (0.48 + 0.52 * easeOutBack(value)) + ')');
          if (kind === 'stretch') return state(eased,
            'scaleX(' + (0.5 + 0.5 * easeOutBack(value)) + ') scaleY('
              + (1.35 - 0.35 * easeOutBack(value)) + ')');
          const hidden = (1 - eased) * 100;
          if (kind === 'wipe-left') return state(1, '', '', 'inset(0 0 0 ' + hidden + '%)');
          if (kind === 'wipe-right') return state(1, '', '', 'inset(0 ' + hidden + '% 0 0)');
          if (kind === 'wipe-up') return state(1, '', '', 'inset(0 0 ' + hidden + '% 0)');
          if (kind === 'wipe-down') return state(1, '', '', 'inset(' + hidden + '% 0 0 0)');
          const remaining = (1 - eased) * distance;
          if (kind === 'slide-left') return state(eased, 'translateX(' + -remaining + 'px)');
          if (kind === 'slide-right') return state(eased, 'translateX(' + remaining + 'px)');
          if (kind === 'slide-up') return state(eased, 'translateY(' + -remaining + 'px)');
          return state(eased, 'translateY(' + remaining + 'px)');
        };
        const loopAt = localFrame => {
          if (data.loop.kind === 'none') return neutral;
          const phase = localFrame / data.loop.periodFrames * Math.PI * 2;
          const wave = Math.sin(phase), intensity = data.loop.intensity;
          if (data.loop.kind === 'shake') return { ...neutral, transform: 'translateX(' + (wave * intensity) + 'px)' };
          if (data.loop.kind === 'wobble') return { ...neutral, transform: 'rotate(' + (wave * intensity) + 'deg)' };
          if (data.loop.kind === 'breathe') return { ...neutral, transform: 'scale(' + (1 + wave * 0.02 * intensity) + ')' };
          if (data.loop.kind === 'float') return { ...neutral, transform: 'translateY(' + (wave * intensity) + 'px)' };
          if (data.loop.kind === 'pulse') return { ...neutral, transform: 'scale(' + (1 + Math.abs(wave) * 0.04 * intensity) + ')' };
          if (data.loop.kind === 'flicker') return { ...neutral, opacity: 1 - Math.max(0, wave) * 0.15 * intensity };
          return { ...neutral, filter: 'drop-shadow(0 0 ' + ((0.5 + 0.5 * wave) * intensity * 4) + 'px currentColor)' };
        };
        const applyMotion = (element, states) => {
          element.style.opacity = String(states.reduce((amount, state) => amount * state.opacity, 1));
          element.style.transform = states.map(state => state.transform).filter(Boolean).join(' ');
          element.style.filter = states.map(state => state.filter).filter(Boolean).join(' ');
          const clipped = [...states].reverse().find(state => state.clipPath);
          element.style.clipPath = clipped?.clipPath || '';
          element.style.transformOrigin = 'center';
        };
        return localFrame => {
          const time = localFrame / fps;
          const entryProgress = data.entry.frames <= 0 ? 1 : clamp(localFrame / data.entry.frames);
          const remainingFrames = Math.max(0, context.durationFrames - 1 - localFrame);
          const exitProgress = data.exit.frames <= 0 ? 1 : clamp(remainingFrames / data.exit.frames);
          const cueLifecycle = entryProgress < 1 ? oneShot(data.entry.kind, entryProgress)
            : exitProgress < 1 ? oneShot(data.exit.kind, exitProgress) : neutral;
          applyMotion(cue, [cueLifecycle, data.loop.target === 'cue' ? loopAt(localFrame) : neutral]);
          const activeBoxWords = [];
          for (const unit of data.caption.units) {
            const element = units.get(unit.id);
            const start = seconds(unit.start);
            const end = seconds(unit.end);
            const current = time >= start && time < end;
            const passed = time >= end;
            const textActive = data.karaoke.mode === 'trail' ? time >= start : current;
            const boxActive = data.activeBox.mode === 'trail' ? time >= start : current;
            const underlineActive = data.activeUnderline.mode === 'trail' ? time >= start : current;
            const progress = passed ? 1 : current ? (time - start) / Math.max(end - start, 1 / fps) : 0;
            paintText(element, progress, textActive);
            paintBox(element, boxActive);
            paintUnderline(element, data.activeUnderline.mode !== 'off' && underlineActive
              ? data.activeUnderline : data.underline);
            if (data.activeBox.continuity === 'joined' && boxActive) {
              activeBoxWords.push(...element.querySelectorAll('[data-hypit-text-kind="text"]'));
            }
            const startFrame = start * fps, endFrame = end * fps;
            const sinceStart = localFrame - startFrame, untilEnd = endFrame - localFrame;
            let lifecycle = neutral;
            const waits = data.atom.reveal !== 'all' || data.atom.enter !== 'none';
            if (sinceStart < 0 && waits) lifecycle = { ...neutral, opacity: 0 };
            else if (sinceStart >= 0 && sinceStart < data.atom.enterFrames && data.atom.enter !== 'none') {
              lifecycle = oneShot(data.atom.enter, data.atom.enterFrames <= 0 ? 1 : sinceStart / data.atom.enterFrames);
            } else if (untilEnd <= 0 && data.atom.exit !== 'none') lifecycle = oneShot(data.atom.exit, 0);
            else if (untilEnd > 0 && untilEnd < data.atom.exitFrames && data.atom.exit !== 'none') {
              lifecycle = oneShot(data.atom.exit, data.atom.exitFrames <= 0 ? 1 : untilEnd / data.atom.exitFrames);
            }
            if (data.atom.reveal === 'typewriter' && sinceStart >= 0 && untilEnd > 0) {
              lifecycle = { ...lifecycle, opacity: 1,
                clipPath: 'inset(0 ' + ((1 - clamp((time - start) / Math.max(end - start, 1 / fps))) * 100) + '% 0 0)' };
            }
            let response = neutral;
            if (current && data.activeResponse.kind !== 'none') {
              response = oneShot(data.activeResponse.kind,
                data.activeResponse.frames <= 0 ? 1 : clamp(sinceStart / data.activeResponse.frames));
            }
            if (current && data.activeResponse.scale !== 1) {
              response = { ...response, transform: response.transform + ' scale(' + data.activeResponse.scale + ')' };
            }
            applyMotion(element, [lifecycle, response,
              data.loop.target === 'active-atom' && current ? loopAt(localFrame) : neutral]);
          }
          if (data.cueBox.continuity === 'joined') {
            hypitPaintLineUnion(cueUnion, cue, allWords, data.cueBox);
          } else cueUnion.setAttribute('d', '');
          if (data.activeBox.continuity === 'joined' && data.activeBox.mode !== 'off') {
            hypitPaintLineUnion(activeUnion, cue, activeBoxWords, data.activeBox);
          } else activeUnion.setAttribute('d', '');
        };
      `,
    })),
  };
}

export const captionFineNleResolver: NleComponentResolver = {
  component: captionFineNleComponentSymbol,
  resolve: (item) => {
    const { source, pictureOutput } = resolveCaptionFine(item);
    return { source, pictureOutput };
  },
};

export const captionFineNleAuthoring: NleComponentParameterAuthoring = {
  component: captionFineNleComponentSymbol,
  inspect: ({ item }) => {
    resolveCaptionFine(item);
    return canonicalize(item.parameters);
  },
  edit: (operation, { item }) => {
    assertCaptionNleComponentParameters(item.parameters, "fine", item.duration);
    const parameters = editCaptionNleComponentParameters(
      item.parameters as CaptionNleComponentParameters<"fine">,
      operation as unknown as CaptionNleComponentEdit,
      item.duration,
    );
    resolveCaptionFine({ ...structuredClone(item), parameters: canonicalize(parameters) });
    return canonicalize(parameters);
  },
};

export const captionFineNleHtmlVideoResolver: NleHtmlVideoComponentResolver = {
  component: captionFineNleComponentSymbol,
  resolve: (item) => ({ html: resolveCaptionFine(item).html }),
};
