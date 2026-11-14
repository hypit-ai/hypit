import assert from "node:assert/strict";
import test from "node:test";

import {
  pictureType,
  sealAudiovisualProgram,
  sealOccurrence,
  type ProgramSource,
} from "@hypit/audiovisual";
import { compileGpuCompositionProgramToWebGpuHtmlProgram } from "@hypit/gpu-composition-webgpu-html";
import {
  bindAudiovisualPictureExecution,
  executeAudiovisualPicture,
  partitionAudiovisualPictureExecution,
  prepareAudiovisualPictureExecution,
  type AudiovisualTerminalCapability,
} from "@hypit/audiovisual-execution";
import type { GpuCompositionProgram } from "@hypit/gpu-composition-program";
import { assertHtmlProgram } from "@hypit/html-program";
import { prepareMedia, preparedPictureSampling } from "@hypit/media";
import { sealLocalSpatialDomain, sealSpatialMap } from "@hypit/spatial/algebra";
import {
  exactTemporalValue,
  sealLocalTemporalDomain,
  sealTemporalMap,
} from "@hypit/temporal/algebra";
import { fixtureResource } from "../../../test/fixture-resource.js";

import {
  createAudiovisualGpuCompositionTerminalCapability,
  createAudiovisualGpuCompositionTerminalExecutor,
} from "../src/index.js";
import { preparedPictureSamplingRepresentation } from "@hypit/media";

const at = (value: number) => exactTemporalValue({ numerator: BigInt(value), denominator: 1n });
const time = sealLocalTemporalDomain({ id: "programme-time", duration: at(2) });
const canvas = sealLocalSpatialDomain({ id: "programme-space", region: { x: 0, y: 0, width: 100, height: 100 } });

function source(id: string): ProgramSource {
  return { id, outputs: { picture: {
    kind: "signal",
    type: pictureType,
    domain: sealLocalTemporalDomain({ id: `${id}-time`, duration: at(2) }),
    spatialDomain: sealLocalSpatialDomain({ id: `${id}-space`, region: { x: 0, y: 0, width: 100, height: 100 } }),
  } } };
}

function occurrence(id: string, value: ProgramSource) {
  const local = sealLocalTemporalDomain({ id: `${id}-local`, duration: at(2) });
  const output = value.outputs.picture!;
  assert.equal(output.kind, "signal");
  return sealOccurrence({
    id,
    source: value,
    domain: local,
    placement: { parent: time, start: at(0), active: { start: at(0), end: at(2) } },
    selections: { picture: { kind: "signal", mapping: sealTemporalMap({ stages: [{
      target: local,
      source: output.domain,
      pieces: [{ target: { start: at(0), end: at(2) }, sourceAtStart: at(0),
        rate: { numerator: 1, denominator: 1 } }],
    }] }) } },
  });
}

function product(value: ProgramSource) {
  const domain = value.outputs.picture!;
  assert.equal(domain.kind, "signal");
  return preparedPictureSampling(prepareMedia({
    id: value.id,
    source: { kind: "blob", resource: fixtureResource(`gpu-composition:${value.id}`), size: 1, mediaType: "video/mp4" },
    inspection: { streams: [{
      kind: "video", index: 0, codecName: "h264",
      disposition: { default: true, attachedPicture: false },
      startPts: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } },
      endPts: { ticks: "2", timeBase: { numerator: 1, denominator: 1 } },
      width: 100, height: 100, sampleAspectRatio: { numerator: 1, denominator: 1 },
      rotationDegrees: 0, decodedUnitCount: 2,
      picture: { colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
        colorRange: "limited", bitDepth: 8, alphaMode: "straight" },
    }] },
    selection: { videoStreamIndex: 0, spanAuthority: "video", picture: {
      colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
      colorRange: "limited", bitDepth: 8, alphaMode: "straight",
    } },
  }));
}

test("one AVIR execution lowers through GPU composition into the current WebGPU HTML host", async () => {
  const background = source("background");
  const overlay = source("overlay");
  const backgroundUse = occurrence("background-use", background);
  const overlayUse = occurrence("overlay-use", overlay);
  const program = sealAudiovisualProgram({
    id: "gpu-root-proof",
    domain: time,
    pictureDomain: canvas,
    occurrences: { [backgroundUse.id]: backgroundUse, [overlayUse.id]: overlayUse },
    picture: { root: "root", nodes: {
      background: { kind: "use", occurrence: backgroundUse.id, output: "picture" },
      backgroundPlaced: { kind: "remap", input: "background", mapping: sealSpatialMap({
        target: canvas, source: background.outputs.picture!.spatialDomain!,
        transform: { kind: "affine", xx: 1, xy: 0, yx: 0, yy: 1, tx: 0, ty: 0 },
      }) },
      overlay: { kind: "use", occurrence: overlayUse.id, output: "picture" },
      overlayPlaced: { kind: "remap", input: "overlay", mapping: sealSpatialMap({
        target: canvas, source: overlay.outputs.picture!.spatialDomain!,
        transform: { kind: "affine", xx: 2, xy: 0, yx: 0, yy: 2, tx: 0, ty: 0 },
      }) },
      root: { kind: "over", inputs: ["backgroundPlaced", "overlayPlaced"] },
    } },
  });
  const viewport = sealLocalSpatialDomain({ id: "gpu-output", region: canvas.region });
  const output = {
    id: "gpu-output",
    sampling: { frameRate: { numerator: 1, denominator: 1 } },
    canvas: { width: 100, height: 100, clearColor: "#00000000" },
    pictureMapping: sealSpatialMap({ target: viewport, source: canvas,
      transform: { kind: "affine", xx: 1, xy: 0, yx: 0, yy: 1, tx: 0, ty: 0 } }),
  } as const;
  const prepared = prepareAudiovisualPictureExecution(program, output);
  const sourceCapability: AudiovisualTerminalCapability = {
    terminal: "picture-source",
    finalOutputs: [],
    verifyBinding(context) {
      assert.equal(context.target.kind, "source");
      assert.equal(context.binding.sourceAccess?.kind, "range");
    },
    inputRepresentations: () => [],
    outputRepresentations: () => [preparedPictureSamplingRepresentation],
  };
  const gpuCapability = createAudiovisualGpuCompositionTerminalCapability("gpu-root");
  const partitioned = partitionAudiovisualPictureExecution(prepared, [
    ...prepared.demandPlan.nodes.map(node => ({ node: node.id, terminal: "gpu-root" })),
    ...prepared.demandPlan.sourceTasks.map(task => ({
      node: task.id, terminal: "picture-source", sourceAccess: { kind: "range" as const },
    })),
  ], [sourceCapability, gpuCapability]);
  const plan = bindAudiovisualPictureExecution(partitioned,
    partitioned.execution.products.map(value => ({
      product: value.id, representation: preparedPictureSamplingRepresentation,
    })));
  const products = new Map([[background.id, product(background)], [overlay.id, product(overlay)]]);
  const gpu = await executeAudiovisualPicture<ReturnType<typeof product>, GpuCompositionProgram>(plan, [{
    capability: sourceCapability,
    executor: {
      terminal: "picture-source",
      async execute(request) {
        return { products: request.products.map(({ requirement }) => {
          const task = request.sources.find(value => value.task === requirement.node);
          assert(task !== undefined, `Picture Product ${requirement.id} has no Source task.`);
          const value = products.get(task.source);
          assert(value !== undefined, `Picture Source ${task.source} has no Product.`);
          return { product: requirement.id, value };
        }) };
      },
    },
  }, {
    capability: gpuCapability,
    executor: createAudiovisualGpuCompositionTerminalExecutor({
      terminal: "gpu-root", program, output: plan.output, demand: plan.demand,
    }),
  }]);
  assert.equal(gpu.frameCount, 2);
  assert.equal(gpu.layers.length, 2);
  assert.deepEqual(gpu.layers[1]!.samples[0]?.mapping.transform,
    { kind: "affine", xx: 2, xy: 0, yx: 0, yy: 2, tx: 0, ty: 0 });

  const dawn = compileGpuCompositionProgramToWebGpuHtmlProgram(gpu);
  assert.doesNotThrow(() => assertHtmlProgram(dawn));
  assert.equal(dawn.videoSources.length, 2);
});
