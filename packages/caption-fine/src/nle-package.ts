import { pictureType, type ProgramSource } from "@hypit/audiovisual";
import { visualProgramHtmlSource } from "@hypit/audiovisual-html";
import { htmlVisual } from "@hypit/html-program";
import type { NleHtmlVideoComponentResolver } from "@hypit/html-video";
import type { NleComponentItem, NleComponentResolver, NlePackageSymbol } from "@hypit/nle";
import type { ModuleManifest } from "@hypit/protocol";
import { sealLocalSpatialDomain } from "@hypit/spatial/algebra";
import { sealLocalTemporalDomain } from "@hypit/temporal/algebra";

import {
  assertCaptionCuePayload,
  type CaptionCuePayload,
  type CaptionDisplayWord,
} from "@hypit/caption";
import type {
  CaptionFineActiveBoxParameters,
  CaptionFineAttributeFace,
  CaptionFineBoxParameters,
  CaptionFineStyleParameters,
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

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll("\"", "&quot;");
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

function box(value: unknown, active: false): NormalizedBox;
function box(value: unknown, active: true): NormalizedActiveBox;
function box(value: unknown, active: boolean): NormalizedBox | NormalizedActiveBox {
  const input = value === undefined ? {} : record(value, active ? "Fine Caption activeBox" : "Fine Caption cueBox");
  exactKeys(input, active
    ? ["mode", "background", "borderColor", "borderWidth", "borderRadius", "paddingX", "paddingY"]
    : ["background", "borderColor", "borderWidth", "borderRadius", "paddingX", "paddingY"],
  active ? "Fine Caption activeBox" : "Fine Caption cueBox");
  return {
    ...(active ? { mode: optionalChoice(input.mode, "off", ["off", "current", "trail"] as const,
      "Fine Caption activeBox mode") } : {}),
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

function wordStyle(word: CaptionDisplayWord, faces: readonly CaptionFineAttributeFace[]): string {
  const declarations: string[] = [];
  for (const face of faces) {
    if (!word.attributes.some((attribute) => attribute.name === face.attribute && attribute.value === face.value)) continue;
    if (face.fontFamily !== undefined) declarations.push(`font-family:${face.fontFamily}`);
    if (face.fontWeight !== undefined) declarations.push(`font-weight:${face.fontWeight}`);
    if (face.fontStyle !== undefined) declarations.push(`font-style:${face.fontStyle}`);
  }
  return declarations.join(";");
}

function unitHtml(payload: CaptionCuePayload, unitId: string, faces: readonly CaptionFineAttributeFace[]): string {
  const unit = payload.units.find((candidate) => candidate.id === unitId)!;
  const words = new Map(payload.words.map((word) => [word.id, word] as const));
  return unit.wordIds.map((wordId) => {
    const word = words.get(wordId)!;
    const style = wordStyle(word, faces);
    return `<span data-caption-word="${escapeHtml(word.id)}"${style ? ` style="${escapeHtml(style)}"` : ""}>${escapeHtml(`${word.separatorBefore}${word.text}`)}</span>`;
  }).join("");
}

function resolveCaptionFine(item: NleComponentItem) {
  assert(item.picture !== undefined, `NLE Fine Caption ${item.id} has no Picture appearance.`);
  const parameters = record(item.parameters, `NLE Fine Caption ${item.id} parameters`);
  exactKeys(parameters, ["caption", "styleId", "family", "style"], `NLE Fine Caption ${item.id} parameters`);
  assertCaptionCuePayload(parameters.caption, item.duration);
  const caption = parameters.caption;
  assert(parameters.family === "fine", `NLE Fine Caption ${item.id} requires the fine style family.`);
  const style = record(parameters.style, `NLE Fine Caption ${item.id} style`) as CaptionFineStyleParameters;
  exactKeys(style as Readonly<Record<string, unknown>>, [
    "color", "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "wordGap",
    "textAlign", "outlineColor", "outlineWidth", "shadowColor", "shadowBlur", "shadowOffsetX",
    "shadowOffsetY", "cueBox", "activeBox", "karaoke", "entry", "attributeFaces",
  ], `NLE Fine Caption ${item.id} style`);
  const color = optionalColor(style.color, "#ffffff", "Fine Caption color");
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
      data: { caption, color, karaoke, activeBox, entry },
      html: `<div data-hypit-caption-fine><span data-caption-cue>${caption.units.map((unit) =>
        `<span data-caption-unit="${escapeHtml(unit.id)}">${unitHtml(caption, unit.id, attributeFaces)}</span>`).join("")}</span></div>`,
      css: `:scope>[data-hypit-caption-fine]{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:${textAlign};font-family:${fontFamily};font-size:${fontSize}px;font-weight:${fontWeight};line-height:${lineHeight};letter-spacing:${letterSpacing}px;color:${color}}:scope [data-caption-cue]{display:inline;max-width:100%;padding:${cueBox.paddingY}px ${cueBox.paddingX}px;background:${cueBox.background};border:${cueBox.borderWidth}px solid ${cueBox.borderColor};border-radius:${cueBox.borderRadius}px;box-shadow:${shadowOffsetX}px ${shadowOffsetY}px ${shadowBlur}px ${shadowColor};white-space:pre-wrap;overflow-wrap:anywhere;-webkit-box-decoration-break:clone;box-decoration-break:clone}:scope [data-caption-unit]{display:inline;position:relative;margin-right:${wordGap}px;color:${color};-webkit-text-stroke:${outlineWidth}px ${outlineColor};paint-order:stroke fill;transition:transform 80ms linear}:scope [data-caption-word]{color:inherit}`,
      setup: `
        const cue = root.querySelector('[data-caption-cue]');
        const units = new Map([...root.querySelectorAll('[data-caption-unit]')]
          .map(element => [element.getAttribute('data-caption-unit'), element]));
        const seconds = value => Number(value.ticks) * value.timeBase.numerator / value.timeBase.denominator;
        const fps = context.frameRate.numerator / context.frameRate.denominator;
        const paintText = (element, progress, active) => {
          if (data.karaoke.mode === 'off' || !active) {
            element.style.color = data.color;
            element.style.backgroundImage = '';
            element.style.webkitBackgroundClip = '';
            element.style.webkitTextFillColor = '';
            return;
          }
          if (data.karaoke.transition === 'step' || progress >= 1) {
            element.style.color = data.karaoke.activeColor;
            element.style.backgroundImage = '';
            element.style.webkitBackgroundClip = '';
            element.style.webkitTextFillColor = '';
            return;
          }
          const percentage = Math.max(0, Math.min(100, progress * 100));
          element.style.color = 'transparent';
          element.style.backgroundImage = 'linear-gradient(90deg,' + data.karaoke.activeColor + ' 0%,'
            + data.karaoke.activeColor + ' ' + percentage + '%,' + data.color + ' ' + percentage + '%,'
            + data.color + ' 100%)';
          element.style.webkitBackgroundClip = 'text';
          element.style.webkitTextFillColor = 'transparent';
        };
        const paintBox = (element, active) => {
          if (!active || data.activeBox.mode === 'off') {
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
          for (const unit of data.caption.units) {
            const element = units.get(unit.id);
            const start = seconds(unit.start);
            const end = seconds(unit.end);
            const current = time >= start && time < end;
            const passed = time >= end;
            const textActive = data.karaoke.mode === 'trail' ? time >= start : current;
            const boxActive = data.activeBox.mode === 'trail' ? time >= start : current;
            const progress = passed ? 1 : current ? (time - start) / Math.max(end - start, 1 / fps) : 0;
            paintText(element, progress, textActive);
            paintBox(element, boxActive);
            element.style.transform = current ? 'scale(1.035)' : '';
          }
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

export const captionFineNleHtmlVideoResolver: NleHtmlVideoComponentResolver = {
  component: captionFineNleComponentSymbol,
  resolve: (item) => ({ html: resolveCaptionFine(item).html }),
};
