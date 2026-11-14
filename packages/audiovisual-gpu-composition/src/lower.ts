import {
  assertAudiovisualProgram,
  createAudiovisualProgramEvaluator,
  type AudiovisualProgram,
  type EvaluatedPictureGraph,
} from "@hypit/audiovisual";
import {
  assertAudiovisualPictureOutput,
  outputFrameCount,
  outputFramePosition,
  type AudiovisualPictureDemand,
  type AudiovisualPictureOutput,
} from "@hypit/audiovisual-execution";
import {
  sealGpuCompositionProgram,
  type GpuCompositionLayer,
  type GpuCompositionProgram,
} from "@hypit/gpu-composition-program";
import { verifyPreparedPictureSampling, type PreparedPictureSampling } from "@hypit/media";
import {
  composeSpatialMaps,
  sameSpatialDomain,
  sealLocalSpatialDomain,
  type SpatialMap,
} from "@hypit/spatial/algebra";
import {
  addExactTemporalValues,
  compareExactTemporalValues,
  subtractExactTemporalValues,
} from "@hypit/temporal/algebra";

export type AudiovisualGpuCompositionInput = {
  readonly source: string;
  readonly output: string;
  readonly product: PreparedPictureSampling;
};

export type AudiovisualGpuCompositionLowering = {
  readonly program: AudiovisualProgram;
  readonly output: AudiovisualPictureOutput;
  readonly demand: AudiovisualPictureDemand;
  readonly inputs: readonly AudiovisualGpuCompositionInput[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function inputKey(source: string, output: string): string {
  return `${source}\u0000${output}`;
}

function pictureExtent(value: PreparedPictureSampling["source"]) {
  const picture = value.interpretation;
  let width = picture.codedWidth * picture.sampleAspectRatio.numerator
    / picture.sampleAspectRatio.denominator;
  let height = picture.codedHeight;
  if (picture.rotationDegrees === 90 || picture.rotationDegrees === 270) [width, height] = [height, width];
  return { width, height };
}

function flattenFrame(
  graph: EvaluatedPictureGraph,
  outputMapping: SpatialMap,
): readonly {
  readonly path: string;
  readonly source: string;
  readonly output: string;
  readonly at: import("@hypit/temporal").ExactTemporalValue;
  readonly side: "before" | "after";
  readonly mapping: SpatialMap;
}[] {
  const result: Array<{
    path: string;
    source: string;
    output: string;
    at: import("@hypit/temporal").ExactTemporalValue;
    side: "before" | "after";
    mapping: SpatialMap;
  }> = [];
  const visit = (nodeId: string, mapping: SpatialMap, path: string): void => {
    const node = graph.nodes[nodeId];
    assert(node !== undefined, `GPU Composition frame references missing Picture node ${nodeId}.`);
    switch (node.kind) {
      case "transparent": return;
      case "sample": {
        assert(node.temporal.kind === "signal",
          `GPU Composition input ${node.source}.${node.output} is not a signal Picture.`);
        assert(sameSpatialDomain(mapping.source, node.sourceSpace),
          `GPU Composition path ${path} reaches another Source Space.`);
        result.push({
          path,
          source: node.source,
          output: node.output,
          at: structuredClone(node.temporal.at),
          side: node.temporal.side,
          mapping: structuredClone(mapping),
        });
        return;
      }
      case "alias": visit(node.input, mapping, `${path}/alias`); return;
      case "remap": {
        assert(sameSpatialDomain(mapping.source, node.mapping.target),
          `GPU Composition path ${path} cannot compose its spatial mapping.`);
        visit(node.input, composeSpatialMaps(mapping, node.mapping), `${path}/remap`);
        return;
      }
      case "over":
        node.inputs.forEach((input, index) => visit(input, mapping, `${path}/over-${index + 1}`));
        return;
      case "crop":
        throw new Error("GPU Composition root does not yet execute crop; bind that node to another Picture Terminal.");
      case "apply":
        throw new Error(`GPU Composition root does not execute Operator ${node.operator.id}; bind it to its owning Terminal.`);
    }
  };
  visit(graph.root, outputMapping, `root:${graph.root}`);
  return result;
}

function pictureLayerOrder(program: AudiovisualProgram): readonly {
  readonly path: string;
  readonly source: string;
  readonly output: string;
}[] {
  const graph = program.picture!;
  const result: Array<{ path: string; source: string; output: string }> = [];
  const visit = (nodeId: string, path: string): void => {
    const node = graph.nodes[nodeId]!;
    switch (node.kind) {
      case "transparent": return;
      case "use": {
        const occurrence = program.occurrences[node.occurrence]!;
        result.push({ path, source: occurrence.source.id, output: node.output });
        return;
      }
      case "restrict": visit(node.input, `${path}/alias`); return;
      case "remap":
      case "remap-control": visit(node.input, `${path}/remap`); return;
      case "over": node.inputs.forEach((child, index) => visit(child, `${path}/over-${index + 1}`)); return;
      case "crop": throw new Error("GPU Composition root does not yet execute crop; bind that node to another Picture Terminal.");
      case "apply": throw new Error(`GPU Composition root does not execute Operator ${node.operator.id}; bind it to its owning Terminal.`);
    }
  };
  visit(graph.root, `root:${graph.root}`);
  return result;
}

/** Lower one already-projected root island; every live leaf must be an incoming Picture Product. */
export function lowerAudiovisualPictureProgramToGpuCompositionProgram(
  input: AudiovisualGpuCompositionLowering,
): GpuCompositionProgram {
  assertAudiovisualProgram(input.program);
  assertAudiovisualPictureOutput(input.output);
  assert(input.program.picture !== undefined && input.program.pictureDomain !== undefined,
    `Audiovisual Programme ${input.program.id} has no Picture output.`);
  assert(sameSpatialDomain(input.output.pictureMapping.source, input.program.pictureDomain),
    "GPU Composition output Mapping reads another Programme Space.");
  const duration = subtractExactTemporalValues(input.demand.range.end, input.demand.range.start);
  const frameCount = outputFrameCount(duration, input.output.sampling);
  const expectedEnd = addExactTemporalValues(input.demand.range.start, duration);
  assert(compareExactTemporalValues(expectedEnd, input.demand.range.end) === 0,
    "GPU Composition demand range is invalid.");

  const products = new Map<string, AudiovisualGpuCompositionInput>();
  for (const value of input.inputs) {
    verifyPreparedPictureSampling(value.product);
    const key = inputKey(value.source, value.output);
    assert(!products.has(key), `GPU Composition input ${value.source}.${value.output} is repeated.`);
    products.set(key, value);
  }
  const evaluator = createAudiovisualProgramEvaluator(input.program);
  const orderedLayers = pictureLayerOrder(input.program);
  const layerOrder = orderedLayers.map((layer) => layer.path);
  const layerValues = new Map<string, {
    readonly source: string;
    readonly output: string;
    readonly samples: Array<GpuCompositionLayer["samples"][number]>;
  }>(orderedLayers.map((layer) => [layer.path, {
    source: layer.source,
    output: layer.output,
    samples: Array(frameCount).fill(null),
  }]));
  for (let frame = 0; frame < frameCount; frame += 1) {
    const at = addExactTemporalValues(input.demand.range.start,
      outputFramePosition(frame, input.output.sampling));
    const picture = evaluator(at).picture;
    assert(picture !== undefined, `GPU Composition output frame ${frame} has no Picture graph.`);
    const leaves = flattenFrame(picture, input.output.pictureMapping);
    const active = new Set<string>();
    for (const leaf of leaves) {
      assert(!active.has(leaf.path), `GPU Composition frame ${frame} repeats layer path ${leaf.path}.`);
      active.add(leaf.path);
      const layer = layerValues.get(leaf.path);
      assert(layer !== undefined, `GPU Composition frame ${frame} produced unknown layer path ${leaf.path}.`);
      assert(layer.source === leaf.source && layer.output === leaf.output,
        `GPU Composition layer ${leaf.path} changes Source identity.`);
      layer.samples[frame] = {
        at: structuredClone(leaf.at),
        side: leaf.side,
        mapping: structuredClone(leaf.mapping),
      };
    }
  }

  const usedInputs = new Map<string, string>();
  const layers = layerOrder.flatMap((path): GpuCompositionLayer[] => {
    const layer = layerValues.get(path)!;
    if (layer.samples.every((sample) => sample === null)) return [];
    const key = inputKey(layer.source, layer.output);
    const product = products.get(key);
    assert(product !== undefined,
      `GPU Composition layer ${path} has no Product for ${layer.source}.${layer.output}.`);
    let id = usedInputs.get(key);
    if (id === undefined) {
      id = `input-${usedInputs.size + 1}`;
      usedInputs.set(key, id);
    }
    return [{ id: `layer-${path}`, input: id, samples: layer.samples }];
  });
  const inputs = [...usedInputs].map(([key, id]) => {
    const value = products.get(key)!;
    const occurrence = Object.values(input.program.occurrences).find((candidate) =>
      candidate.source.id === value.source && candidate.source.outputs[value.output] !== undefined);
    assert(occurrence !== undefined,
      `GPU Composition cannot recover Source Space for ${value.source}.${value.output}.`);
    const space = occurrence.source.outputs[value.output]!.spatialDomain;
    assert(space !== undefined, `GPU Composition input ${value.source}.${value.output} has no Picture Space.`);
    const extent = pictureExtent(value.product.source);
    assert(space.region.width === extent.width && space.region.height === extent.height,
    `GPU Composition Product ${value.source}.${value.output} differs from its Source Space.`);
    return {
      id,
      source: value.source,
      output: value.output,
      space: structuredClone(space),
      picture: structuredClone(value.product),
    };
  });
  return sealGpuCompositionProgram({
    sampling: structuredClone(input.output.sampling),
    frameCount,
    canvas: {
      ...structuredClone(input.output.canvas),
      space: sealLocalSpatialDomain(structuredClone(input.output.pictureMapping.target)),
    },
    layers,
    inputs,
  });
}
