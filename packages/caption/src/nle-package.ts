import { pictureType, type ProgramSource } from "@hypit/audiovisual";
import { visualProgramHtmlSource } from "@hypit/audiovisual-html";
import { htmlVisual } from "@hypit/html-program";
import type { NleHtmlVideoComponentResolver } from "@hypit/html-video";
import type { NleComponentItem, NleComponentResolver, NlePackageSymbol } from "@hypit/nle";
import { sealLocalSpatialDomain } from "@hypit/spatial/algebra";

import { captionModuleRef } from "./manifest.js";
import { assertCaptionNlePayload } from "./nle-payload.js";
import type { CaptionBasicKaraokeParameters, CaptionNlePayload } from "./types.js";

export const captionBasicNleComponentSymbol: NlePackageSymbol = {
  module: captionModuleRef,
  name: "basic",
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll("\"", "&quot;");
}

function optionalNumber(value: unknown, fallback: number, label: string, minimum: number, maximum: number): number {
  if (value === undefined) return fallback;
  assert(typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum,
    `${label} is invalid.`);
  return value;
}

function optionalColor(value: unknown, fallback: string, label: string): string {
  if (value === undefined) return fallback;
  assert(typeof value === "string" && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(value), `${label} is invalid.`);
  return value;
}

function optionalFont(value: unknown): string {
  if (value === undefined) return "system-ui, sans-serif";
  assert(typeof value === "string" && /^[A-Za-z0-9 ,'"-]{1,160}$/u.test(value),
    "Basic NLE Caption fontFamily is invalid.");
  return value;
}

function karaokeParameters(value: unknown): Required<CaptionBasicKaraokeParameters> {
  if (value === undefined) return {
    mode: "off", transition: "step", activeColor: "#ffd54a",
  };
  assert(value !== null && typeof value === "object" && !Array.isArray(value),
    "Basic NLE Caption karaoke must be a record.");
  const input = value as Readonly<Record<string, unknown>>;
  const allowed = new Set(["activeColor", "mode", "transition"]);
  for (const name of Object.keys(input)) assert(allowed.has(name), `Basic NLE Caption karaoke field ${name} is unknown.`);
  const mode = input.mode ?? "off";
  const transition = input.transition ?? "step";
  assert(mode === "off" || mode === "current" || mode === "trail",
    "Basic NLE Caption karaoke mode is invalid.");
  assert(transition === "step" || transition === "wipe",
    "Basic NLE Caption karaoke transition is invalid.");
  return {
    mode,
    transition,
    activeColor: optionalColor(input.activeColor, "#ffd54a", "Basic NLE Caption karaoke activeColor"),
  };
}

function captionUnitText(payload: CaptionNlePayload, unitId: string): string {
  const unit = payload.units.find((candidate) => candidate.id === unitId)!;
  const words = new Map(payload.words.map((word) => [word.id, word] as const));
  return unit.wordIds.map((wordId) => {
    const word = words.get(wordId)!;
    return `${word.separatorBefore}${word.text}`;
  }).join("");
}

function resolveCaptionBasic(item: NleComponentItem) {
  assert(item.picture !== undefined, `NLE Caption ${item.id} has no Picture appearance.`);
  assert(item.parameters !== null && typeof item.parameters === "object" && !Array.isArray(item.parameters),
    `NLE Caption ${item.id} parameters must be a record.`);
  const parameters = item.parameters as Readonly<Record<string, unknown>>;
  assertCaptionNlePayload(parameters.caption, item.duration);
  const caption = parameters.caption;
  assert(parameters.family === "basic", `NLE Caption ${item.id} requires the basic style family.`);
  assert(parameters.style !== null && typeof parameters.style === "object" && !Array.isArray(parameters.style),
    `NLE Caption ${item.id} basic style must be a record.`);
  const style = parameters.style as Readonly<Record<string, unknown>>;
  const allowed = new Set(["background", "borderRadius", "color", "fontFamily", "fontSize", "fontWeight", "karaoke", "padding"]);
  for (const name of Object.keys(style)) assert(allowed.has(name), `Basic NLE Caption style field ${name} is unknown.`);
  const color = optionalColor(style.color, "#ffffff", "Basic NLE Caption color");
  const background = optionalColor(style.background, "#000000cc", "Basic NLE Caption background");
  const fontSize = optionalNumber(style.fontSize, 42, "Basic NLE Caption fontSize", 1, 500);
  const fontWeight = optionalNumber(style.fontWeight, 600, "Basic NLE Caption fontWeight", 100, 900);
  const padding = optionalNumber(style.padding, 12, "Basic NLE Caption padding", 0, 200);
  const borderRadius = optionalNumber(style.borderRadius, 8, "Basic NLE Caption borderRadius", 0, 200);
  const karaoke = karaokeParameters(style.karaoke);
  const sourceId = `${item.id}:caption-source`;
  const spatialDomain = sealLocalSpatialDomain({
    id: `${sourceId}:picture`,
    region: { x: 0, y: 0, width: item.picture.layout.width, height: item.picture.layout.height },
  });
  const source: ProgramSource = {
    id: sourceId,
    outputs: { picture: { kind: "constant", type: pictureType, spatialDomain } },
  };
  return {
    source,
    pictureOutput: "picture",
    html: visualProgramHtmlSource(sourceId, "picture", htmlVisual({
      data: { caption, color, karaoke },
      html: `<div data-hypit-nle-caption><span data-hypit-nle-caption-box>${caption.units.map((unit) =>
        `<span data-caption-unit="${escapeHtml(unit.id)}">${escapeHtml(captionUnitText(caption, unit.id))}</span>`).join("")}</span></div>`,
      css: `:scope>[data-hypit-nle-caption]{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;font-family:${optionalFont(style.fontFamily)};font-size:${fontSize}px;font-weight:${fontWeight};color:${color}}:scope [data-hypit-nle-caption-box]{padding:${padding}px;background:${background};border-radius:${borderRadius}px;white-space:pre-wrap}:scope [data-caption-unit]{color:${color}}`,
      setup: `
        const units = new Map([...root.querySelectorAll('[data-caption-unit]')]
          .map(element => [element.getAttribute('data-caption-unit'), element]));
        const seconds = value => Number(value.ticks) * value.timeBase.numerator / value.timeBase.denominator;
        const fps = context.frameRate.numerator / context.frameRate.denominator;
        const paint = (element, progress, active) => {
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
        return localFrame => {
          const time = localFrame / fps;
          for (const unit of data.caption.units) {
            const start = seconds(unit.start);
            const end = seconds(unit.end);
            const current = time >= start && time < end;
            const passed = time >= end;
            const active = data.karaoke.mode === 'trail' ? time >= start : current;
            const progress = passed ? 1 : current ? (time - start) / Math.max(end - start, 1 / fps) : 0;
            paint(units.get(unit.id), progress, active);
          }
        };
      `,
    })),
  };
}

/** Minimal official Component for materialized editorial Caption blocks. */
export const captionBasicNleResolver: NleComponentResolver = {
  component: captionBasicNleComponentSymbol,
  resolve: (item) => {
    const { source, pictureOutput } = resolveCaptionBasic(item);
    return { source, pictureOutput };
  },
};

export const captionBasicNleHtmlVideoResolver: NleHtmlVideoComponentResolver = {
  component: captionBasicNleComponentSymbol,
  resolve: (item) => ({ html: resolveCaptionBasic(item).html }),
};
