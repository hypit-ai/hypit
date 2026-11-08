import { pictureType, type ProgramSource } from "@hypit/audiovisual";
import { visualProgramHtmlSource } from "@hypit/audiovisual-html";
import {
  htmlTextFragment,
  htmlVisual,
  type HtmlTextNode,
} from "@hypit/html-program";
import type { NleHtmlVideoComponentResolver } from "@hypit/html-video";
import { assertFontStackRef } from "@hypit/media";
import type {
  NleComponentItem,
  NleComponentParameterAuthoring,
  NleComponentResolver,
  NlePackageSymbol,
} from "@hypit/nle";
import { canonicalize } from "@hypit/protocol";
import type { ModuleManifest } from "@hypit/protocol";
import { sealLocalSpatialDomain } from "@hypit/spatial/algebra";
import { sealLocalTemporalDomain } from "@hypit/temporal/algebra";

import { type CaptionCuePayload } from "@hypit/caption";
import {
  assertCaptionNleComponentParameters,
  editCaptionNleComponentParameters,
  type CaptionNleComponentEdit,
  type CaptionNleComponentParameters,
} from "@hypit/caption-nle";
import type { CaptionBasicKaraokeParameters, CaptionBasicStyleParameters } from "./types.js";

export const captionBasicNleComponentSymbol: NlePackageSymbol = {
  module: { name: "@hypit/caption-basic", version: "1" },
  name: "basic",
};

/** Package identity used by ordinary NLE package selection; behavior remains in the NLE facets. */
export const captionBasicNleManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: captionBasicNleComponentSymbol.module.name,
  version: captionBasicNleComponentSymbol.module.version,
  dependencies: [],
  types: [],
  capabilities: [],
  producers: [],
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
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
  if (value === undefined) return { mode: "off", transition: "step", activeColor: "#ffd54a" };
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

function captionTextNodes(payload: CaptionCuePayload): readonly HtmlTextNode[] {
  const words = new Map(payload.words.map((word) => [word.id, word] as const));
  return payload.units.map((unit) => ({
    kind: "group",
    id: unit.id,
    children: unit.wordIds.map((wordId) => {
      const word = words.get(wordId)!;
      return { kind: "text", id: word.id, text: `${word.separatorBefore}${word.text}` };
    }),
  }));
}

function resolveCaptionBasic(item: NleComponentItem) {
  assert(item.picture !== undefined, `NLE Caption ${item.id} has no Picture appearance.`);
  assertCaptionNleComponentParameters(item.parameters, "basic", item.duration);
  const parameters = item.parameters;
  const caption = parameters.caption;
  assert(parameters.style !== null && typeof parameters.style === "object" && !Array.isArray(parameters.style),
    `NLE Caption ${item.id} basic style must be a record.`);
  const style = parameters.style as Readonly<Record<string, unknown>> & CaptionBasicStyleParameters;
  const allowed = new Set(["background", "borderRadius", "color", "fontFamily", "fontSize", "fontWeight", "fonts", "karaoke", "padding"]);
  for (const name of Object.keys(style)) assert(allowed.has(name), `Basic NLE Caption style field ${name} is unknown.`);
  if (style.fonts !== undefined) assertFontStackRef(style.fonts, "Basic NLE Caption fonts");
  const color = optionalColor(style.color, "#ffffff", "Basic NLE Caption color");
  const background = optionalColor(style.background, "#000000cc", "Basic NLE Caption background");
  const fontSize = optionalNumber(style.fontSize, 42, "Basic NLE Caption fontSize", 1, 500);
  const fontWeight = optionalNumber(style.fontWeight, 600, "Basic NLE Caption fontWeight", 100, 900);
  const padding = optionalNumber(style.padding, 12, "Basic NLE Caption padding", 0, 200);
  const borderRadius = optionalNumber(style.borderRadius, 8, "Basic NLE Caption borderRadius", 0, 200);
  const karaoke = karaokeParameters(style.karaoke);
  const text = htmlTextFragment({
    id: `${item.id}-text`,
    typography: {
      ...(style.fonts === undefined ? {} : { fonts: style.fonts }),
      fontFamily: optionalFont(style.fontFamily),
      fontSizePx: fontSize,
      fontWeight,
      fontStyle: "normal",
      lineHeight: 1.15,
    },
    paints: [{ kind: "fill", paint: { kind: "solid", color } }],
    children: captionTextNodes(caption),
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
      data: { caption, color, karaoke },
      html: `<div data-hypit-nle-caption><span data-hypit-nle-caption-box>${text.html}</span></div>`,
      css: `:scope>[data-hypit-nle-caption]{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center}:scope [data-hypit-nle-caption-box]{padding:${padding}px;background:${background};border-radius:${borderRadius}px;white-space:pre-wrap}`,
      setup: `
        const units = new Map([...root.querySelectorAll('[data-hypit-text-kind="group"]')]
          .map(element => [element.getAttribute('data-hypit-text-node'), element]));
        const seconds = value => Number(value.ticks) * value.timeBase.numerator / value.timeBase.denominator;
        const fps = context.frameRate.numerator / context.frameRate.denominator;
        const paint = (element, progress, active) => {
          const fills = element.querySelectorAll('[data-hypit-text-paint="fill"]');
          const solid = selected => {
            for (const fill of fills) {
              fill.style.color = selected;
              fill.style.backgroundImage = '';
              fill.style.webkitBackgroundClip = '';
              fill.style.webkitTextFillColor = selected;
            }
          };
          if (data.karaoke.mode === 'off' || !active) {
            solid(data.color);
            return;
          }
          if (data.karaoke.transition === 'step' || progress >= 1) {
            solid(data.karaoke.activeColor);
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

export const captionBasicNleResolver: NleComponentResolver = {
  component: captionBasicNleComponentSymbol,
  resolve: (item) => {
    const { source, pictureOutput } = resolveCaptionBasic(item);
    return { source, pictureOutput };
  },
};

export const captionBasicNleAuthoring: NleComponentParameterAuthoring = {
  component: captionBasicNleComponentSymbol,
  inspect: ({ item }) => {
    resolveCaptionBasic(item);
    return canonicalize(item.parameters);
  },
  edit: (operation, { item }) => {
    assertCaptionNleComponentParameters(item.parameters, "basic", item.duration);
    const parameters = editCaptionNleComponentParameters(
      item.parameters as CaptionNleComponentParameters<"basic">,
      operation as unknown as CaptionNleComponentEdit,
      item.duration,
    );
    resolveCaptionBasic({ ...structuredClone(item), parameters: canonicalize(parameters) });
    return canonicalize(parameters);
  },
};

export const captionBasicNleHtmlVideoResolver: NleHtmlVideoComponentResolver = {
  component: captionBasicNleComponentSymbol,
  resolve: (item) => ({ html: resolveCaptionBasic(item).html }),
};
