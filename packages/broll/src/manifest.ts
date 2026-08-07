import { artifactDependency } from "@narratage/artifact";
import {
  audioTrackSchema,
  contractTypes,
  mediaArtifactSchema,
  narrativeSelectionSchema,
  synchronizedMediaSchema,
  videoContractDependencies,
  visualTrackSchema,
} from "@narratage/contracts";
import { digestOf } from "@narratage/protocol";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@narratage/protocol";
import { mediaPipelineManifest, mediaPipelineModuleRef, mediaPipelineTypes } from "@narratage/media-pipeline";
import { svsManifest, svsModuleRef } from "@narratage/svs";

import {
  appendBrollItemImplementationDigest,
  createBrollSetImplementationDigest,
  finalizeBrollProgramImplementationDigest,
} from "./author.js";

import {
  compileBrollImplementationDigest,
  projectBrollAudioImplementationDigest,
  projectBrollVisualImplementationDigest,
} from "./program.js";

export const brollModuleRef = { name: "@narratage/broll", version: "0.0.0-dev" } as const;
export const brollTypes = {
  program: { module: brollModuleRef, name: "BrollProgram" },
  product: { module: brollModuleRef, name: "BrollProduct" },
  trackSpec: { module: brollModuleRef, name: "BrollTrackSpec" },
  itemSpec: { module: brollModuleRef, name: "BrollItemSpec" },
  set: { module: brollModuleRef, name: "BrollSet" },
} satisfies Record<string, TypeRef>;
export const brollProducers = {
  createSet: { module: brollModuleRef, name: "create-broll-set" },
  appendItem: { module: brollModuleRef, name: "append-broll-item" },
  finalize: { module: brollModuleRef, name: "finalize-broll-program" },
  compile: { module: brollModuleRef, name: "compile-broll" },
  projectVisual: { module: brollModuleRef, name: "project-broll-visual" },
  projectAudio: { module: brollModuleRef, name: "project-broll-audio" },
} satisfies Record<string, ProducerRef>;

const string = { kind: "string", minLength: 1 } as const;
const number = { kind: "number" } as const;
const unsignedInteger = { kind: "number", integer: true, minimum: 0 } as const;
const signedInteger = { kind: "number", integer: true } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({
  kind: "object",
  fields,
});

const frameSpan = object({
  startFrame: { schema: unsignedInteger },
  endFrameExclusive: { schema: unsignedInteger },
});
const box = object({
  xPercent: { schema: number },
  yPercent: { schema: number },
  widthPercent: { schema: number },
  heightPercent: { schema: number },
});
const motion = object({
  operator: { schema: { kind: "string", enum: ["fade", "pop", "slide-up", "slide-down"] } },
  durationFrames: { schema: unsignedInteger },
  amount: { schema: number, optional: true },
});
const item = object({
  id: { schema: string },
  artifact: { schema: mediaArtifactSchema },
  span: { schema: frameSpan },
  z: { schema: signedInteger },
  tieBreak: { schema: string },
  box: { schema: box },
  fit: { schema: { kind: "string", enum: ["contain", "cover"] } },
  playback: { schema: { kind: "string", enum: ["freeze", "native", "loop", "stretch"] } },
  mediaStartSec: { schema: number, optional: true },
  includeAudio: { schema: { kind: "boolean" }, optional: true },
  audioGain: { schema: number, optional: true },
  enter: { schema: motion, optional: true },
  exit: { schema: motion, optional: true },
  backgroundColor: { schema: string, optional: true },
  borderRadiusPx: { schema: number, optional: true },
});
const itemSpec = object({
  contract: { schema: { kind: "literal", value: "svml.broll-item-spec@1" } },
  id: { schema: string },
  z: { schema: signedInteger },
  box: { schema: box },
  fit: { schema: { kind: "string", enum: ["contain", "cover"] } },
  backgroundColor: { schema: string, optional: true },
  borderRadiusPx: { schema: number, optional: true },
  enter: { schema: motion, optional: true },
  exit: { schema: motion, optional: true },
});
const transition = object({
  id: { schema: string },
  fromItemId: { schema: string },
  toItemId: { schema: string },
  span: { schema: frameSpan },
  operator: { schema: { kind: "string", enum: ["push", "page-turn"] } },
  direction: { schema: { kind: "string", enum: ["left", "right", "up", "down"] } },
  sfx: { schema: object({
    artifact: { schema: mediaArtifactSchema },
    gain: { schema: number, optional: true },
  }), optional: true },
});

export const brollProgramSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.broll-program@1" } },
  id: { schema: string },
  items: { schema: { kind: "array", minItems: 1, items: item } },
  transitions: { schema: { kind: "array", items: transition } },
});

export const brollProductSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.broll-product@1" } },
  visualTrack: { schema: visualTrackSchema },
  audioTrack: { schema: audioTrackSchema },
});

export const brollTrackSpecSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.broll-track-spec@1" } },
  id: { schema: string },
});
export const brollItemSpecSchema: ValueSchema = itemSpec;
export const brollSetSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.broll-set@1" } },
  items: { schema: { kind: "array", items: item } },
});

export const brollSurfaceImplementationDigest = digestOf("@narratage/broll/track-surface@1");

export const brollManifest: ModuleManifest = {
  format: "svml.module@1",
  name: brollModuleRef.name,
  version: brollModuleRef.version,
  dependencies: [
    artifactDependency,
    videoContractDependencies.narrative,
    videoContractDependencies.media,
    videoContractDependencies.semanticTime,
    videoContractDependencies.programSpace,
    videoContractDependencies.composition,
    { module: mediaPipelineModuleRef, digest: digestOf(mediaPipelineManifest) },
    { module: svsModuleRef, digest: digestOf(svsManifest) },
  ],
  types: [
    { name: brollTypes.program.name, schema: brollProgramSchema },
    { name: brollTypes.product.name, schema: brollProductSchema },
    { name: brollTypes.trackSpec.name, schema: brollTrackSpecSchema },
    { name: brollTypes.itemSpec.name, schema: brollItemSpecSchema },
    { name: brollTypes.set.name, schema: brollSetSchema },
  ],
  capabilities: [],
  surfaces: [{
    name: "track", tag: "Track", mode: "structured",
    outputs: [brollTypes.trackSpec, brollTypes.itemSpec, mediaPipelineTypes.selectionRequest,
      brollTypes.program, brollTypes.product, contractTypes.visualTrack, contractTypes.audioTrack],
    implementation: { kind: "trusted-frontend-surface", locator: "@narratage/broll/track-surface", digest: brollSurfaceImplementationDigest },
  }],
  producers: [
    {
      name: brollProducers.createSet.name,
      inputs: [],
      outputs: [{ name: "set", type: brollTypes.set }], needs: [],
      implementation: { kind: "registered", locator: "@narratage/broll/create-set", digest: createBrollSetImplementationDigest },
    },
    {
      name: brollProducers.appendItem.name,
      inputs: [
        { name: "set", type: brollTypes.set },
        { name: "track", type: brollTypes.trackSpec },
        { name: "map", type: contractTypes.completeSemanticMap },
        { name: "space", type: contractTypes.programSpace },
        { name: "media", type: contractTypes.synchronizedMedia },
        { name: "selection", type: contractTypes.narrativeSelection },
        { name: "spec", type: brollTypes.itemSpec },
      ],
      outputs: [{ name: "set", type: brollTypes.set }], needs: [],
      implementation: { kind: "registered", locator: "@narratage/broll/append-item", digest: appendBrollItemImplementationDigest },
    },
    {
      name: brollProducers.finalize.name,
      inputs: [
        { name: "set", type: brollTypes.set },
        { name: "track", type: brollTypes.trackSpec },
      ],
      outputs: [{ name: "program", type: brollTypes.program }], needs: [],
      implementation: { kind: "registered", locator: "@narratage/broll/finalize-program", digest: finalizeBrollProgramImplementationDigest },
    },
    {
      name: brollProducers.compile.name,
      inputs: [
        { name: "space", type: contractTypes.programSpace },
        { name: "program", type: brollTypes.program },
      ],
      outputs: [{ name: "product", type: brollTypes.product }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "@narratage/broll/compile",
        digest: compileBrollImplementationDigest,
      },
    },
    {
      name: brollProducers.projectVisual.name,
      inputs: [{ name: "product", type: brollTypes.product }],
      outputs: [{ name: "visual", type: contractTypes.visualTrack }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "@narratage/broll/project-visual",
        digest: projectBrollVisualImplementationDigest,
      },
    },
    {
      name: brollProducers.projectAudio.name,
      inputs: [{ name: "product", type: brollTypes.product }],
      outputs: [{ name: "audio", type: contractTypes.audioTrack }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "@narratage/broll/project-audio",
        digest: projectBrollAudioImplementationDigest,
      },
    },
  ],
};

export const brollManifestDigest = digestOf(brollManifest);
