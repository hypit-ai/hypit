import type {
  GenerationCanvasItem,
  GenerationCanvasView,
} from "./types.js";
import type {
  GenerationCanvasTransaction,
} from "./transaction.js";

export type AcceptedGenerationCanvasBuild = {
  readonly build: string;
  /** Every operation output durably intended for publication by this accepted Build. */
  readonly outputs: readonly string[];
};

export type GenerationCanvasBuildOutputPlacement = {
  readonly id: string;
  readonly output: string;
  readonly x: number;
  readonly y: number;
};

/**
 * Turn one durable submission receipt into a Canvas-only transaction.
 * Placement remains Host-owned because Core does not know node dimensions or layout policy.
 */
export function planAcceptedGenerationCanvasBuild(
  view: GenerationCanvasView,
  accepted: AcceptedGenerationCanvasBuild,
  placements: readonly GenerationCanvasBuildOutputPlacement[],
): GenerationCanvasTransaction {
  if (accepted.build.trim().length === 0) throw new Error("Accepted Generation Build identity is empty.");
  const expected = new Set(accepted.outputs);
  if (expected.size !== accepted.outputs.length || [...expected].some((output) => output.trim().length === 0)) {
    throw new Error("Accepted Generation Build outputs must be unique and non-empty.");
  }
  const actual = new Set(placements.map((placement) => placement.output));
  if (actual.size !== placements.length
    || expected.size !== actual.size
    || [...expected].some((output) => !actual.has(output))) {
    throw new Error("Generation Canvas placements must cover every accepted Build output exactly once.");
  }
  const items: GenerationCanvasItem[] = placements.map((placement) => ({
    id: placement.id,
    subject: { kind: "build-output", build: accepted.build, output: placement.output },
    x: placement.x,
    y: placement.y,
  }));
  return {
    revision: view.revision,
    commands: items.map((item) => ({ kind: "item.add", item })),
  };
}
