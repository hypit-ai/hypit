import { programSpaceFrameCount, renderTextTrack, sealTextTrackProgram } from "../svml.js";
import type { CanonicalValue, TextItem } from "../svml.js";
import { fields, list, number, text } from "./types.js";
import type { PreviewComponent } from "./types.js";

/**
 * The Text Recipe key set, copied from packages/text-track/src/surface.ts.
 * tools/playground-registry.test.mjs fails if the two ever diverge.
 */
const RECIPE_KEYS = [
  "align", "fill", "font", "height", "size",
  "stack-order", "tracking", "weight", "width", "x", "y",
] as const;

function numeric(properties: Readonly<Record<string, CanonicalValue>>, key: string): number {
  const value = Number(properties[key]);
  return Number.isFinite(value) ? value : 0;
}

export const textTrackComponent: PreviewComponent = {
  id: "text-track",
  label: "Text overlay",
  recipeKeys: RECIPE_KEYS,

  parameters: {
    kind: "object",
    fields: {
      stackOrder: { schema: { kind: "number", integer: true, minimum: 0 } },
      font: { schema: { kind: "string" } },
      size: { schema: { kind: "number", minimum: 1 } },
      weight: { schema: { kind: "number", integer: true, minimum: 100, maximum: 900 } },
      tracking: { schema: { kind: "number" } },
      fill: { schema: { kind: "string" } },
      align: { schema: { kind: "string", enum: ["left", "center", "right"] } },
      x: { schema: { kind: "number", minimum: 0, maximum: 1 } },
      y: { schema: { kind: "number", minimum: 0, maximum: 1 } },
      width: { schema: { kind: "number", minimum: 0, maximum: 1 } },
      height: { schema: { kind: "number", minimum: 0, maximum: 1 } },
    },
  },

  content: {
    kind: "object",
    fields: {
      items: {
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
    x: "unit-fraction",
    y: "unit-fraction",
    width: "unit-fraction",
    height: "unit-fraction",
    "items[].text": "multiline",
  },

  defaults: () => ({
    parameters: {
      stackOrder: 90,
      font: "Inter, system-ui, sans-serif",
      size: 96,
      weight: 800,
      tracking: -2,
      fill: "#ffffff",
      align: "left",
      x: 0.08,
      y: 0.12,
      width: 0.84,
      height: 0.2,
    },
    content: {
      items: [{ text: "A title card", startSec: 0, endSec: 4 }],
    },
  }),

  fromRecipe: (properties) => ({
    stackOrder: numeric(properties, "stack-order"),
    font: String(properties["font"] ?? ""),
    size: numeric(properties, "size"),
    weight: numeric(properties, "weight"),
    tracking: numeric(properties, "tracking"),
    fill: String(properties["fill"] ?? "#ffffff"),
    align: String(properties["align"] ?? "left"),
    x: numeric(properties, "x"),
    y: numeric(properties, "y"),
    width: numeric(properties, "width"),
    height: numeric(properties, "height"),
  }),

  build: ({ parameters, content, programSpace }) => {
    const p = fields(parameters);
    const totalFrames = programSpaceFrameCount(programSpace);
    const fps = programSpace.frameRate.numerator / programSpace.frameRate.denominator;

    const items: TextItem[] = list(fields(content)["items"], "items").map((entry, index) => {
      const item = fields(entry);
      const startFrame = Math.max(0, Math.min(totalFrames - 1, Math.round(number(item["startSec"], "startSec") * fps)));
      // assertTextTrackProgramIdentity requires every span inside the program
      // space, so shortening the duration must clamp rather than throw.
      const endFrameExclusive = Math.max(
        startFrame + 1,
        Math.min(totalFrames, Math.round(number(item["endSec"], "endSec") * fps)),
      );
      return {
        id: `item-${index + 1}`,
        text: text(item["text"], "item text"),
        span: { startFrame, endFrameExclusive },
        z: number(p["stackOrder"], "stackOrder"),
        tieBreak: `text:${index + 1}`,
        box: {
          xPercent: number(p["x"], "x") * 100,
          yPercent: number(p["y"], "y") * 100,
          widthPercent: number(p["width"], "width") * 100,
          heightPercent: number(p["height"], "height") * 100,
        },
        appearance: {
          color: text(p["fill"], "fill"),
          fontSizePx: number(p["size"], "size"),
          fontFamily: text(p["font"], "font"),
          fontWeight: number(p["weight"], "weight"),
          letterSpacingPx: number(p["tracking"], "tracking"),
          align: text(p["align"], "align") as "left" | "center" | "right",
        },
      };
    });

    return [renderTextTrack(programSpace, sealTextTrackProgram({
      contract: "svml.text-track-program@1",
      id: "text",
      items,
    }))];
  },
};
