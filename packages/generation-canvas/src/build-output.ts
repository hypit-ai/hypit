import type { GenerationCanvasTransaction } from "./transaction.js";
import type { GenerationCanvasView } from "./types.js";

export type GenerationCanvasBuildOutputAddress = {
  readonly build: string;
  readonly output: string;
};

export type GenerationCanvasBuildOutputItemPlacement = {
  readonly id: string;
  readonly x: number;
  readonly y: number;
};

/** Place one exact Build output without reading Runtime, Result history or Product data. */
export function planGenerationCanvasBuildOutputPlacement(
  view: GenerationCanvasView,
  address: GenerationCanvasBuildOutputAddress,
  placement: GenerationCanvasBuildOutputItemPlacement,
): GenerationCanvasTransaction {
  if (address.build.trim().length === 0) throw new Error("Generation Build identity is empty.");
  if (address.output.trim().length === 0) throw new Error("Generation Build output is empty.");
  return {
    revision: view.revision,
    commands: [{ kind: "item.add", item: {
      id: placement.id,
      subject: { kind: "build-output", build: address.build, output: address.output },
      x: placement.x,
      y: placement.y,
    } }],
  };
}
