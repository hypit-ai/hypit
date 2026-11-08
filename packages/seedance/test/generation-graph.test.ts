import assert from "node:assert/strict";
import test from "node:test";

import { createNodeGenerationGraphProjectHost } from "@hypit/generation-graph/node";
import {
  createGenerationNodePackageFacet,
  type GenerationGraphProject,
} from "@hypit/generation-graph";
import { generationProducers } from "@hypit/generation";
import { blobTypes } from "@hypit/blob";
import { prepareMedia } from "@hypit/media";
import {
  mediaAssetGenerationNodes,
} from "@hypit/media-asset-generation";
import { serializeMediaAssetDocument, type MediaAssetDocument } from "@hypit/media-asset";

import blobPackage from "../../blob/src/activation.js";
import generationPackage from "../../generation/src/activation.js";
import mediaPackage from "../../media/src/activation.js";
import mediaAssetPackage from "../../media-asset-generation/src/activation.js";
import promptPackage from "../../prompt/src/activation.js";
import temporalPackage from "../../temporal-graph/src/activation.js";
import textPackage from "../../text/src/activation.js";
import seedancePackage from "../src/activation.js";
import {
  seedanceGenerationNodeDeclarations,
  seedanceGenerationNodes,
} from "../src/generation.js";
import { seedanceEndpointsByModel } from "../src/index.js";

const blobValueUsing = {
  module: { name: "@test/seedance-values", version: "1" },
  name: "blob",
} as const;

function installedPackages() {
  return [
    { specifier: "@hypit/blob", contribution: blobPackage },
    { specifier: "@hypit/temporal-graph", contribution: temporalPackage },
    { specifier: "@hypit/media", contribution: mediaPackage },
    { specifier: "@hypit/media-asset-generation", contribution: mediaAssetPackage },
    { specifier: "@hypit/generation", contribution: generationPackage },
    { specifier: "@hypit/text", contribution: textPackage },
    { specifier: "@hypit/prompt", contribution: promptPackage },
    { specifier: "@hypit/seedance", contribution: seedancePackage },
    { specifier: "@test/seedance-values", contribution: {
      format: "hypit.package@1" as const,
      facets: [createGenerationNodePackageFacet({ nodes: [{
        kind: "value",
        using: blobValueUsing,
        inputs: ["blob"],
        type: blobTypes.blob,
        load: ({ inputs }) => inputs.blob!,
      }] })],
    } },
  ];
}

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
  };
  const host = createNodeGenerationGraphProjectHost({
    packages: installedPackages(),
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

test("four existing media values close into one heterogeneous reference-video Build", async () => {
  const media = [
    ["portrait", "image/png"],
    ["room", "image/jpeg"],
    ["camera", "video/mp4"],
    ["voice", "audio/wav"],
  ] as const;
  const project: GenerationGraphProject = {
    format: "hypit.generation-graph@1",
    id: "reference-shot",
    name: "Reference shot",
    revision: 0,
    nodes: [
      ...media.map(([id, mediaType]) => ({
        id,
        using: blobValueUsing,
        inputs: { blob: { value: {
          kind: "blob" as const,
          resource: `res_${id}` as `res_${string}`,
          size: 100,
          mediaType,
        } } },
      })),
      {
        id: "motion",
        using: seedanceGenerationNodes["seedance-2.5"].referenceVideo,
        inputs: {
          prompt: { value: "Keep the person and borrow the camera rhythm." },
          duration: { value: 6 },
          "referenceImage.1": { node: "portrait" },
          "referenceImage.1.personReference": { value: true },
          "referenceImage.2": { node: "room" },
          "referenceImage.2.personReference": { value: false },
          "referenceVideo.1": { node: "camera" },
          "referenceVideo.1.personReference": { value: false },
          "referenceAudio.1": { node: "voice" },
        },
      },
    ],
  };
  const host = createNodeGenerationGraphProjectHost({
    packages: installedPackages(),
    assets: {
      readAsset: () => new Uint8Array(),
      resolveAsset: () => { throw new Error("reference values need no file resolution"); },
      attachments: () => [],
    },
  });
  const prepared = await host.prepare(project, ["motion"]);
  const endpoint = seedanceEndpointsByModel["seedance-2.5"];
  assert.deepEqual(prepared.definition.plan.steps.map((step) => step.producer.name).sort(), [
    endpoint.textFieldBindings.prompt!.producer.name,
    endpoint.mediaBindings.referenceImage!.producer.name,
    endpoint.mediaBindings.referenceImage!.producer.name,
    endpoint.mediaBindings.referenceVideo!.producer.name,
    endpoint.mediaBindings.referenceAudio!.producer.name,
    endpoint.finalizeProducer.name,
    endpoint.producer.name,
    generationProducers.primaryVideo.name,
  ].sort());
  assert.deepEqual(prepared.generated.map((item) => item.node), ["motion"]);
  assert.deepEqual(prepared.executionPackages, ["@hypit/seedance"]);
});

test("Seedance graph nodes preserve exact model modes and explicit visual classification", () => {
  const components = seedancePackage.facets.flatMap((facet) =>
    facet.abi === "hypit.generation-node-package@1"
      ? (facet as { implementation: { nodes: readonly { using: { name: string } }[] } }).implementation.nodes
      : []);
  assert.deepEqual(components.map((item) => item.using.name), [
    "seedance-2.text-video", "seedance-2.frame-video", "seedance-2.reference-video",
    "seedance-2-fast.text-video", "seedance-2-fast.frame-video", "seedance-2-fast.reference-video",
    "seedance-2-mini.text-video", "seedance-2-mini.frame-video", "seedance-2-mini.reference-video",
    "seedance-2.5.text-video", "seedance-2.5.frame-video", "seedance-2.5.reference-video",
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
    },
  }), /firstFramePersonReference/u);
});

test("reference-video compiles indexed heterogeneous references through the common field-model graph helper", () => {
  const reference = seedanceGenerationNodeDeclarations.find((item) =>
    item.using.name === "seedance-2.5.reference-video")!;
  assert.ok("compile" in reference);
  const project = {
    format: "hypit.generation-graph@1" as const,
    id: "references",
    name: "References",
    revision: 0,
    nodes: [],
  };
  const compiled = reference.compile({
    node: {
      id: "motion",
      using: reference.using,
      inputs: {
        prompt: { value: "Keep the person and borrow the camera rhythm." },
        duration: { value: 6 },
        "referenceImage.1": { node: "portrait" },
        "referenceImage.1.personReference": { value: true },
        "referenceImage.2": { node: "room" },
        "referenceImage.2.personReference": { value: false },
        "referenceVideo.1": { node: "camera" },
        "referenceVideo.1.personReference": { value: false },
        "referenceAudio.1": { node: "voice" },
      },
    },
    project,
  });
  assert.ok(!(compiled instanceof Promise));
  if (compiled instanceof Promise) return;
  assert.deepEqual(compiled.inputs["referenceImage.1:artifact"], { node: "portrait" });
  assert.deepEqual(compiled.inputs["referenceImage.2:binding"], {
    value: { fields: { personReference: false }, role: "image" },
  });
  assert.deepEqual(compiled.inputs["referenceVideo.1:binding"], {
    value: { fields: { personReference: false }, role: "video" },
  });
  assert.deepEqual(compiled.inputs["referenceAudio.1:binding"], { value: { role: "audio" } });
  assert.equal(Object.keys(compiled.inputs).filter((name) => name.endsWith(":artifact")).length, 4);

  assert.throws(() => reference.compile({
    node: {
      id: "gap",
      using: reference.using,
      inputs: {
        prompt: { value: "Move." }, duration: { value: 5 },
        "referenceImage.2": { node: "room" },
        "referenceImage.2.personReference": { value: false },
      },
    },
    project,
  }), /indices must be contiguous from 1/u);
  assert.throws(() => reference.compile({
    node: {
      id: "classified-audio",
      using: reference.using,
      inputs: {
        prompt: { value: "Move." }, duration: { value: 5 },
        "referenceAudio.1": { node: "voice" },
        "referenceAudio.1.personReference": { value: false },
      },
    },
    project,
  }), /declares no item fields/u);
});
