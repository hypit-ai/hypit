import type { AudiovisualProgram } from "@hypit/audiovisual";
import {
  projectAudiovisualPictureIsland,
  outputFrameCount,
  outputFramePosition,
  type AudiovisualPictureDemand,
  type AudiovisualPictureOutput,
  type AudiovisualTerminalCapability,
  type AudiovisualTerminalExecutor,
} from "@hypit/audiovisual-execution";
import {
  sealGpuCompositionProgram,
  type GpuCompositionProgram,
} from "@hypit/gpu-composition-program";
import {
  preparedPictureSamplingRepresentation,
  verifyPreparedPictureSampling,
  type PreparedPictureSampling,
} from "@hypit/media";
import { sameSpatialDomain } from "@hypit/spatial/algebra";
import { addExactTemporalValues, subtractExactTemporalValues } from "@hypit/temporal/algebra";

import { lowerAudiovisualPictureProgramToGpuCompositionProgram } from "./lower.js";

export type AudiovisualGpuCompositionTerminal = {
  readonly terminal: string;
  readonly program: AudiovisualProgram;
  readonly output: AudiovisualPictureOutput;
  readonly demand: AudiovisualPictureDemand;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Root-only composition offer. Sources and package Operators remain in other terminals. */
export function createAudiovisualGpuCompositionTerminalCapability(
  terminal: string,
): AudiovisualTerminalCapability {
  assert(terminal.length > 0, "GPU Composition Terminal identity is empty.");
  return {
    terminal,
    finalOutputs: ["picture"],
    verifyBinding(context) {
      assert(context.target.kind === "node" && context.target.demand.signal === "picture",
        `GPU Composition Terminal ${terminal} accepts only Picture graph nodes.`);
      const node = context.program.picture?.nodes[context.target.demand.node];
      assert(node !== undefined, `GPU Composition Terminal ${terminal} cannot find its Picture node.`);
      assert(node.kind === "transparent" || node.kind === "use" || node.kind === "restrict"
        || node.kind === "remap" || node.kind === "remap-control" || node.kind === "over",
      `GPU Composition Terminal ${terminal} does not execute ${node.kind} nodes.`);
    },
    inputRepresentations: context => context.requirement.signal === "picture"
      ? [preparedPictureSamplingRepresentation] : [],
    outputRepresentations: () => [],
  };
}

export function createAudiovisualGpuCompositionTerminalExecutor(
  input: AudiovisualGpuCompositionTerminal,
): AudiovisualTerminalExecutor<PreparedPictureSampling, GpuCompositionProgram> {
  assert(input.terminal.length > 0, "GPU Composition Terminal identity is empty.");
  return {
    terminal: input.terminal,
    async execute(request) {
      assert(request.island.signals.length === 1 && request.island.signals[0] === "picture"
        && request.sources.length === 0 && request.products.length === 0,
      "GPU Composition Terminal accepts only a root Picture composition island.");
      assert(request.finalOutputs.length === 1 && request.finalOutputs[0] === "picture",
        "GPU Composition Terminal must close exactly one final Picture output.");
      if (request.nodes.length === 0) {
        assert(request.inputs.length === 1,
          "GPU Composition output sink requires exactly one authored-root Picture Product.");
        const product = request.inputs[0]!;
        assert(product.requirement.signal === "picture"
          && product.requirement.pictureDomain !== undefined
          && product.binding.representation === preparedPictureSamplingRepresentation,
        `GPU Composition output sink cannot consume Product ${product.requirement.id}.`);
        verifyPreparedPictureSampling(product.value);
        assert(sameSpatialDomain(input.output.pictureMapping.source, product.requirement.pictureDomain),
          "GPU Composition output sink Product belongs to another Picture Space.");
        const duration = subtractExactTemporalValues(input.demand.range.end, input.demand.range.start);
        const frameCount = outputFrameCount(duration, input.output.sampling);
        const document = sealGpuCompositionProgram({
          sampling: structuredClone(input.output.sampling),
          frameCount,
          canvas: {
            ...structuredClone(input.output.canvas),
            space: structuredClone(input.output.pictureMapping.target),
          },
          inputs: [{
            id: "authored-root",
            source: input.program.id,
            output: "picture",
            space: structuredClone(product.requirement.pictureDomain),
            picture: structuredClone(product.value),
          }],
          layers: [{
            id: "authored-root",
            input: "authored-root",
            samples: Array.from({ length: frameCount }, (_, frame) => ({
              at: addExactTemporalValues(
                input.demand.range.start,
                outputFramePosition(frame, input.output.sampling),
              ),
              side: "after" as const,
              mapping: structuredClone(input.output.pictureMapping),
            })),
          }],
        });
        return { products: [], outputs: { picture: document } };
      }
      const root = request.nodes.find((node) => node.node === input.program.picture?.root);
      assert(root !== undefined,
        `GPU Composition island ${request.island.id} does not own the Programme Picture root.`);
      const projection = projectAudiovisualPictureIsland(input.program, request, root.id);
      const products = new Map(request.inputs.map((entry) => {
        assert(entry.requirement.signal === "picture"
          && entry.binding.representation === preparedPictureSamplingRepresentation,
        `GPU Composition Terminal cannot consume Product ${entry.requirement.id}.`);
        verifyPreparedPictureSampling(entry.value);
        return [entry.requirement.id, entry.value] as const;
      }));
      const document = lowerAudiovisualPictureProgramToGpuCompositionProgram({
        program: projection.program,
        output: input.output,
        demand: input.demand,
        inputs: projection.inputs.map((entry) => {
          const product = products.get(entry.product);
          assert(product !== undefined, `GPU Composition input ${entry.product} is missing.`);
          return { source: entry.source, output: entry.output, product };
        }),
      });
      return { products: [], outputs: { picture: document } };
    },
  };
}
