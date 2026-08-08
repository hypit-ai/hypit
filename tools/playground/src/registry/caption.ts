import {
  renderCaptionTrack,
  sealCaptionTrackProgram,
} from "../svml.js";
import type {
  CanonicalValue,
  CaptionPresentationMode,
  TimedCaptionProjection,
  TimedCaptionRegion,
} from "../svml.js";
import { fields, list, number, text } from "./types.js";
import type { PreviewComponent } from "./types.js";

/**
 * The Caption Recipe key set, copied from packages/caption/src/surface.ts.
 * tools/playground-registry.test.mjs fails if the two ever diverge.
 */
const RECIPE_KEYS = [
  "align", "background", "fill", "font", "line-height", "padding",
  "radius", "size", "stack-order", "weight", "width", "x", "y",
] as const;

const MODES: readonly CaptionPresentationMode[] = ["whole", "proportional-word", "character-flow"];

/** SVS writes padding as "y" or "y x" — the y value comes first. */
function padding(value: CanonicalValue): { y: number; x: number } {
  const parts = String(value).trim().split(/\s+/u).map(Number);
  const y = parts[0];
  if (y === undefined || !Number.isFinite(y)) return { y: 0, x: 0 };
  const x = parts[1];
  return { y, x: x !== undefined && Number.isFinite(x) ? x : y };
}

function numeric(properties: Readonly<Record<string, CanonicalValue>>, key: string): number {
  const value = Number(properties[key]);
  return Number.isFinite(value) ? value : 0;
}

export const captionComponent: PreviewComponent = {
  id: "caption",
  label: "Caption",
  recipeKeys: RECIPE_KEYS,

  parameters: {
    kind: "object",
    fields: {
      mode: { schema: { kind: "string", enum: [...MODES] } },
      stackOrder: { schema: { kind: "number", integer: true, minimum: 0 } },
      font: { schema: { kind: "string" } },
      size: { schema: { kind: "number", minimum: 1 } },
      weight: { schema: { kind: "number", integer: true, minimum: 100, maximum: 900 } },
      lineHeight: { schema: { kind: "number", minimum: 0 } },
      fill: { schema: { kind: "string" } },
      background: { schema: { kind: "string" } },
      paddingY: { schema: { kind: "number", minimum: 0 } },
      paddingX: { schema: { kind: "number", minimum: 0 } },
      radius: { schema: { kind: "number", minimum: 0 } },
      align: { schema: { kind: "string", enum: ["left", "center", "right"] } },
      x: { schema: { kind: "number", minimum: 0, maximum: 1 } },
      y: { schema: { kind: "number", minimum: 0, maximum: 1 } },
      width: { schema: { kind: "number", minimum: 0, maximum: 1 } },
    },
  },

  content: {
    kind: "object",
    fields: {
      cues: {
        schema: {
          kind: "array",
          minItems: 1,
          items: {
            kind: "object",
            fields: {
              text: { schema: { kind: "string" } },
              startSec: { schema: { kind: "number", minimum: 0 } },
              endSec: { schema: { kind: "number", minimum: 0 } },
            },
          },
        },
      },
    },
  },

  hints: {
    fill: "color",
    background: "color",
    x: "unit-fraction",
    y: "unit-fraction",
    width: "unit-fraction",
    "cues[].text": "multiline",
  },

  defaults: () => ({
    parameters: {
      mode: "whole",
      stackOrder: 70,
      font: "Inter, system-ui, sans-serif",
      size: 58,
      weight: 600,
      lineHeight: 1.25,
      fill: "#ffffff",
      background: "#000000cc",
      paddingY: 14,
      paddingX: 26,
      radius: 18,
      align: "center",
      x: 0.08,
      y: 0.76,
      width: 0.84,
    },
    content: {
      cues: [
        { text: "This is the first caption cue.", startSec: 0, endSec: 1.8 },
        { text: "And this one follows it.", startSec: 1.8, endSec: 4 },
      ],
    },
  }),

  fromRecipe: (properties) => {
    const pad = padding(properties["padding"] ?? "0");
    return {
      mode: "whole",
      stackOrder: numeric(properties, "stack-order"),
      font: String(properties["font"] ?? ""),
      size: numeric(properties, "size"),
      weight: numeric(properties, "weight"),
      lineHeight: numeric(properties, "line-height"),
      fill: String(properties["fill"] ?? "#ffffff"),
      background: String(properties["background"] ?? "#00000000"),
      paddingY: pad.y,
      paddingX: pad.x,
      radius: numeric(properties, "radius"),
      align: String(properties["align"] ?? "center"),
      x: numeric(properties, "x"),
      y: numeric(properties, "y"),
      width: numeric(properties, "width"),
    };
  },

  build: ({ parameters, content, programSpace }) => {
    const p = fields(parameters);
    const mode = text(p["mode"], "mode") as CaptionPresentationMode;

    // The compiler's own conversion, from packages/caption/src/surface.ts:
    // SVS geometry is a 0–1 fraction and the style carries percentages.
    const program = sealCaptionTrackProgram({
      contract: "svml.caption-track-program@1",
      id: "caption",
      mode,
      stacking: { order: number(p["stackOrder"], "stackOrder"), tieBreak: "caption" },
      style: {
        fontFamily: text(p["font"], "font"),
        fontSizePx: number(p["size"], "size"),
        fontWeight: number(p["weight"], "weight"),
        color: text(p["fill"], "fill"),
        backgroundColor: text(p["background"], "background"),
        paddingXPx: number(p["paddingX"], "paddingX"),
        paddingYPx: number(p["paddingY"], "paddingY"),
        borderRadiusPx: number(p["radius"], "radius"),
        bottomPercent: 0,
        maxWidthPercent: number(p["width"], "width") * 100,
        leftPercent: number(p["x"], "x") * 100,
        topPercent: number(p["y"], "y") * 100,
        widthPercent: number(p["width"], "width") * 100,
        lineHeight: number(p["lineHeight"], "lineHeight"),
        textAlign: text(p["align"], "align") as "left" | "center" | "right",
      },
    });

    // A projection the playground synthesises. planCaptionPresentation reads
    // only display text and timing, so an empty token list and no refinements
    // are honest here rather than a stub: every mode, including
    // proportional-word, distributes time the same way it does without
    // alignment refinements in a real Build.
    const cues = list(fields(content)["cues"], "cues");
    const regions: TimedCaptionRegion[] = cues.map((cue, index) => {
      const item = fields(cue);
      return {
        id: `cue-${index + 1}`,
        display: text(item["text"], "cue text"),
        segmentId: "playground",
        kind: "identity",
        sourceTokenIds: [],
        startSec: number(item["startSec"], "startSec"),
        endSec: number(item["endSec"], "endSec"),
        refinements: [],
      };
    });
    const projection: TimedCaptionProjection = {
      contract: "svml.timed-caption-projection@1",
      text: regions.map((region) => region.display).join(" "),
      regions,
    };

    return [renderCaptionTrack(projection, program, programSpace)];
  },
};
