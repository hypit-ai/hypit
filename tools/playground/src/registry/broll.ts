import { artifactRef } from "../preview/artifacts.js";
import { compileBrollProduct, programSpaceFrameCount, sealBrollProgram } from "../svml.js";
import type { BrollItem, BrollMotion, CanonicalValue } from "../svml.js";
import { fields, list, number, text } from "./types.js";
import type { PreviewComponent } from "./types.js";

/**
 * The B-roll Recipe key set, copied from packages/broll/src/surface.ts.
 * tools/playground-registry.test.mjs fails if the two ever diverge.
 */
const RECIPE_KEYS = [
  "background", "enter", "exit", "fit", "height",
  "radius", "stack-order", "width", "x", "y",
] as const;

const OPERATORS = ["fade", "pop", "slide-up", "slide-down"] as const;

function numeric(properties: Readonly<Record<string, CanonicalValue>>, key: string): number {
  const value = Number(properties[key]);
  return Number.isFinite(value) ? value : 0;
}

/** SVS writes motion as `<operator> <frames>f`, e.g. `slide-up 8f`. */
function parseMotion(value: CanonicalValue | undefined): { operator: string; frames: number } {
  const found = /^(fade|pop|slide-up|slide-down)\s+([1-9][0-9]*)f$/u.exec(String(value ?? "").trim());
  return found === null
    ? { operator: "fade", frames: 6 }
    : { operator: found[1]!, frames: Number(found[2]) };
}

function motion(operator: string, frames: number): BrollMotion | undefined {
  if (frames <= 0) return undefined;
  return { operator: operator as BrollMotion["operator"], durationFrames: frames };
}

export const brollComponent: PreviewComponent = {
  id: "broll",
  label: "B-roll",
  recipeKeys: RECIPE_KEYS,

  parameters: {
    kind: "object",
    fields: {
      stackOrder: { schema: { kind: "number", integer: true, minimum: 0 } },
      x: { schema: { kind: "number", minimum: 0, maximum: 1 } },
      y: { schema: { kind: "number", minimum: 0, maximum: 1 } },
      width: { schema: { kind: "number", minimum: 0, maximum: 1 } },
      height: { schema: { kind: "number", minimum: 0, maximum: 1 } },
      fit: { schema: { kind: "string", enum: ["contain", "cover"] } },
      background: { schema: { kind: "string" } },
      radius: { schema: { kind: "number", minimum: 0 } },
      enterOperator: { schema: { kind: "string", enum: [...OPERATORS] } },
      enterFrames: { schema: { kind: "number", integer: true, minimum: 0 } },
      exitOperator: { schema: { kind: "string", enum: [...OPERATORS] } },
      exitFrames: { schema: { kind: "number", integer: true, minimum: 0 } },
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
              media: { schema: { kind: "blob", mediaTypes: ["image/*", "video/*"] } },
              startSec: { schema: { kind: "number", minimum: 0 } },
              endSec: { schema: { kind: "number", minimum: 0 } },
            },
          },
        },
      },
    },
  },

  hints: {
    background: "color",
    x: "unit-fraction",
    y: "unit-fraction",
    width: "unit-fraction",
    height: "unit-fraction",
  },

  defaults: () => ({
    parameters: {
      stackOrder: 40,
      x: 0.08, y: 0.2, width: 0.84, height: 0.48,
      fit: "contain",
      background: "#111116",
      radius: 28,
      enterOperator: "slide-up", enterFrames: 8,
      exitOperator: "fade", exitFrames: 6,
    },
    content: {
      items: [{ media: "", startSec: 0, endSec: 4 }],
    },
  }),

  fromRecipe: (properties) => {
    const enter = parseMotion(properties["enter"]);
    const exit = parseMotion(properties["exit"]);
    return {
      stackOrder: numeric(properties, "stack-order"),
      x: numeric(properties, "x"),
      y: numeric(properties, "y"),
      width: numeric(properties, "width"),
      height: numeric(properties, "height"),
      fit: String(properties["fit"] ?? "contain"),
      background: String(properties["background"] ?? "#00000000"),
      radius: numeric(properties, "radius"),
      enterOperator: enter.operator, enterFrames: enter.frames,
      exitOperator: exit.operator, exitFrames: exit.frames,
    };
  },

  build: ({ parameters, content, programSpace }) => {
    const p = fields(parameters);
    const totalFrames = programSpaceFrameCount(programSpace);
    const fps = programSpace.frameRate.numerator / programSpace.frameRate.denominator;
    const enter = motion(text(p["enterOperator"], "enterOperator"), number(p["enterFrames"], "enterFrames"));
    const exit = motion(text(p["exitOperator"], "exitOperator"), number(p["exitFrames"], "exitFrames"));

    const items: BrollItem[] = list(fields(content)["items"], "items").flatMap((entry, index) => {
      const item = fields(entry);
      const digest = item["media"];
      const artifact = artifactRef(typeof digest === "string" && digest !== "" ? digest : undefined);
      // An Item with no media yet is skipped rather than faked: compileBroll
      // would reject a stub digest, and a stand-in would misreport the frame.
      if (artifact === undefined) return [];
      const startFrame = Math.max(0, Math.min(totalFrames - 1, Math.round(number(item["startSec"], "startSec") * fps)));
      const endFrameExclusive = Math.max(
        startFrame + 1,
        Math.min(totalFrames, Math.round(number(item["endSec"], "endSec") * fps)),
      );
      const span = endFrameExclusive - startFrame;
      return [{
        id: `item-${index + 1}`,
        artifact,
        span: { startFrame, endFrameExclusive },
        z: number(p["stackOrder"], "stackOrder"),
        tieBreak: `broll:${index + 1}`,
        box: {
          xPercent: number(p["x"], "x") * 100,
          yPercent: number(p["y"], "y") * 100,
          widthPercent: number(p["width"], "width") * 100,
          heightPercent: number(p["height"], "height") * 100,
        },
        fit: text(p["fit"], "fit") as "contain" | "cover",
        // Not a choice: B-roll requires freeze for a still and forbids it for a
        // moving one, so the media decides and a control would only offer a way
        // to be wrong.
        playback: artifact.mediaType.startsWith("image/") ? "freeze" : "native",
        backgroundColor: text(p["background"], "background"),
        borderRadiusPx: number(p["radius"], "radius"),
        // Motion must fit inside the Present it decorates.
        ...(enter !== undefined && enter.durationFrames < span ? { enter } : {}),
        ...(exit !== undefined && exit.durationFrames < span ? { exit } : {}),
      }];
    });

    if (items.length === 0) return [];
    return [compileBrollProduct(programSpace, sealBrollProgram({
      contract: "svml.broll-program@1",
      id: "broll",
      items,
      transitions: [],
    })).visualTrack];
  },
};
