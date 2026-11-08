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
  CaptionFineStyleParameters,
  CaptionFineUnderlineParameters,
} from "./types.js";

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
    "cueBox", "activeBox", "karaoke", "entry", "attributeFaces",
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
    kind: optionalChoice(entryInput.kind, "pop", ["none", "fade", "pop", "slide-up"] as const,
      "Fine Caption entry kind"),
    frames: optionalInteger(entryInput.frames, 5, "Fine Caption entry frames", 0, 120),
  };
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
      data: { caption, color: alphaHex(color, opacity), karaoke, cueBox, activeBox, entry,
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
            paintSolid(data.color);
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
        return localFrame => {
          const time = localFrame / fps;
          const entryProgress = data.entry.frames <= 0 ? 1 : Math.max(0, Math.min(1, localFrame / data.entry.frames));
          if (data.entry.kind === 'fade') {
            cue.style.opacity = String(entryProgress);
            cue.style.transform = '';
          } else if (data.entry.kind === 'pop') {
            cue.style.opacity = String(entryProgress);
            cue.style.transform = 'scale(' + (0.72 + 0.28 * (1 - Math.pow(1 - entryProgress, 3))) + ')';
          } else if (data.entry.kind === 'slide-up') {
            cue.style.opacity = String(entryProgress);
            cue.style.transform = 'translateY(' + ((1 - entryProgress) * 28) + 'px)';
          } else {
            cue.style.opacity = '1';
            cue.style.transform = '';
          }
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
            element.style.transform = '';
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
