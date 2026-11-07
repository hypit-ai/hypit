import { pictureType, type ProgramSource } from "@hypit/audiovisual";
import { visualProgramHtmlSource } from "@hypit/audiovisual-html";
import { htmlVisual } from "@hypit/html-program";
import type { NleComponentResolver, NlePackageSymbol } from "@hypit/nle";
import { sealLocalSpatialDomain } from "@hypit/spatial/algebra";

import { captionModuleRef } from "./manifest.js";

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

/** Minimal official Component for materialized editorial Caption blocks. */
export const captionBasicNleResolver: NleComponentResolver = {
  component: captionBasicNleComponentSymbol,
  resolve: (item) => {
    assert(item.picture !== undefined, `NLE Caption ${item.id} has no Picture appearance.`);
    assert(item.parameters !== null && typeof item.parameters === "object" && !Array.isArray(item.parameters),
      `NLE Caption ${item.id} parameters must be a record.`);
    const parameters = item.parameters as Readonly<Record<string, unknown>>;
    assert(typeof parameters.text === "string" && parameters.text.length > 0,
      `NLE Caption ${item.id} text is empty.`);
    assert(parameters.family === "basic", `NLE Caption ${item.id} requires the basic style family.`);
    assert(parameters.style !== null && typeof parameters.style === "object" && !Array.isArray(parameters.style),
      `NLE Caption ${item.id} basic style must be a record.`);
    const style = parameters.style as Readonly<Record<string, unknown>>;
    const allowed = new Set(["background", "borderRadius", "color", "fontFamily", "fontSize", "fontWeight", "padding"]);
    for (const name of Object.keys(style)) assert(allowed.has(name), `Basic NLE Caption style field ${name} is unknown.`);
    const color = optionalColor(style.color, "#ffffff", "Basic NLE Caption color");
    const background = optionalColor(style.background, "#000000cc", "Basic NLE Caption background");
    const fontSize = optionalNumber(style.fontSize, 42, "Basic NLE Caption fontSize", 1, 500);
    const fontWeight = optionalNumber(style.fontWeight, 600, "Basic NLE Caption fontWeight", 100, 900);
    const padding = optionalNumber(style.padding, 12, "Basic NLE Caption padding", 0, 200);
    const borderRadius = optionalNumber(style.borderRadius, 8, "Basic NLE Caption borderRadius", 0, 200);
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
        html: `<div data-hypit-nle-caption><span>${escapeHtml(parameters.text)}</span></div>`,
        css: `:scope>[data-hypit-nle-caption]{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;font-family:${optionalFont(style.fontFamily)};font-size:${fontSize}px;font-weight:${fontWeight};color:${color}}:scope>[data-hypit-nle-caption]>span{padding:${padding}px;background:${background};border-radius:${borderRadius}px}`,
      })),
    };
  },
};
