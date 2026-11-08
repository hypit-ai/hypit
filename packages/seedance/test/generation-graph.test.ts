import assert from "node:assert/strict";
import test from "node:test";

import { createNodeGenerationGraphProjectHost } from "@hypit/generation-graph/node";
import type { GenerationGraphProject } from "@hypit/generation-graph";
import { generationProducers } from "@hypit/generation";
import { prepareMedia } from "@hypit/media";
import {
  mediaAssetGenerationNodes,
  serializeMediaAssetDocument,
  type MediaAssetDocument,
} from "@hypit/media-asset";

import blobPackage from "../../blob/src/activation.js";
import generationPackage from "../../generation/src/activation.js";
import mediaPackage from "../../media/src/activation.js";
import mediaAssetPackage from "../../media-asset/src/activation.js";
import promptPackage from "../../prompt/src/activation.js";
import temporalPackage from "../../temporal-graph/src/activation.js";
import textPackage from "../../text/src/activation.js";
import seedancePackage from "../src/activation.js";
import {
  seedanceGenerationNodeDeclarations,
  seedanceGenerationNodes,
} from "../src/generation.js";
import { seedanceEndpointsByModel } from "../src/index.js";

function imageDocument(): MediaAssetDocument {
  const prepared = prepareMedia({
    id: "opening-frame-media",
    source: { kind: "blob", resource: "res_opening_frame", size: 100, mediaType: "image/png" },
    inspection: { streams: [{
      kind: "video", index: 0, codecName: "png",
      disposition: { default: true, attachedPicture: false },
      decodedUnitCount: 1,
      width: 1280, height: 720, sampleAspectRatio: { numerator: 1, denominator: 1 }, rotationDegrees: 0,
      picture: { colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb",
        colorRange: "full", bitDepth: 8, alphaMode: "straight" },
    }] },
    selection: { videoStreamIndex: 0, picture: {
      colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb",
      colorRange: "full", bitDepth: 8, alphaMode: "straight",
    } },
  });
  const { source: _source, ...interpretation } = prepared;
  return {
    format: "hypit.media-asset@1",
    id: "opening-frame",
    media: {
      file: { path: "./opening-frame.png", mediaType: "image/png" },
      interpretation,
    },
    representations: [],
  };
}

test("a file-backed image and concise Seedance node lower into one typed image-to-video Build", async () => {
  const packages = [
    { specifier: "@hypit/blob", contribution: blobPackage },
    { specifier: "@hypit/temporal-graph", contribution: temporalPackage },
    { specifier: "@hypit/media", contribution: mediaPackage },
    { specifier: "@hypit/media-asset", contribution: mediaAssetPackage },
    { specifier: "@hypit/generation", contribution: generationPackage },
    { specifier: "@hypit/text", contribution: textPackage },
    { specifier: "@hypit/prompt", contribution: promptPackage },
    { specifier: "@hypit/seedance", contribution: seedancePackage },
  ];
  const attachment = {
    blob: { kind: "blob" as const, resource: "res_opening_frame" as const, size: 100, mediaType: "image/png" },
    open: async () => (async function* () { yield new Uint8Array(100); })(),
  };
  const project: GenerationGraphProject = {
    format: "hypit.generation-graph@1",
    id: "opening-shot",
    name: "Opening shot",
    revision: 0,
    nodes: [{
      id: "opening-frame",
      using: mediaAssetGenerationNodes.resource,
      inputs: { asset: { value: { path: "assets/opening-frame.media.json" } } },
    }, {
      id: "opening-motion",
      using: seedanceGenerationNodes["seedance-2.5"].frameVideo,
      inputs: {
        prompt: { value: "A slow camera move reveals the full room." },
        duration: { value: 5 },
        resolution: { value: "720p" },
        aspectRatio: { value: "16:9" },
        generateAudio: { value: false },
        firstFrame: { node: "opening-frame" },
        firstFramePersonReference: { value: false },
      },
    }],
    layout: [],
  };
  const host = createNodeGenerationGraphProjectHost({
    packages,
    assets: {
      readAsset: () => new TextEncoder().encode(serializeMediaAssetDocument(imageDocument())),
      resolveAsset: () => attachment.blob,
      attachments: () => [attachment],
    },
  });
  const prepared = await host.prepare(project, ["opening-motion"]);
  const endpoint = seedanceEndpointsByModel["seedance-2.5"];
  assert.deepEqual(prepared.definition.plan.steps.map((step) => step.producer.name).sort(), [
    endpoint.textFieldBindings.prompt!.producer.name,
    endpoint.mediaBindings.firstFrame!.producer.name,
    endpoint.finalizeProducer.name,
    endpoint.producer.name,
    generationProducers.primaryVideo.name,
  ].sort());
  assert.deepEqual(prepared.generated.map((item) => item.node), ["opening-motion"]);
  assert.deepEqual(prepared.executionPackages, ["@hypit/seedance"]);
  assert.deepEqual(prepared.attachments, [attachment]);
  assert.deepEqual(project.nodes[1]!.inputs.prompt, {
    value: "A slow camera move reveals the full room.",
  });
});

test("Seedance graph nodes preserve exact model modes and explicit visual classification", () => {
  const components = seedancePackage.facets.flatMap((facet) =>
    facet.abi === "hypit.generation-node-package@1"
      ? (facet as { implementation: { nodes: readonly { using: { name: string } }[] } }).implementation.nodes
      : []);
  assert.deepEqual(components.map((item) => item.using.name), [
    "seedance-2.text-video", "seedance-2.frame-video",
    "seedance-2-fast.text-video", "seedance-2-fast.frame-video",
    "seedance-2-mini.text-video", "seedance-2-mini.frame-video",
    "seedance-2.5.text-video", "seedance-2.5.frame-video",
  ]);
  const frame = seedanceGenerationNodeDeclarations.find((item) =>
    item.using.name === "seedance-2.5.frame-video")!;
  assert.ok("compile" in frame);
  assert.throws(() => frame.compile({
    node: {
      id: "unclassified",
      using: frame.using,
      inputs: {
        prompt: { value: "Move the camera." },
        duration: { value: 5 },
        firstFrame: { node: "frame" },
      },
    },
    project: {
      format: "hypit.generation-graph@1",
      id: "invalid",
      name: "Invalid",
      revision: 0,
      nodes: [],
      layout: [],
    },
  }), /firstFramePersonReference/u);
});
