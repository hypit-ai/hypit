import {
  audioTrackSchema,
  contractTypes,
  mediaArtifactSchema,
  programSpaceSchema,
  videoContractDependencies,
  visualTrackSchema,
} from "@svml/contracts";
import { digestOf } from "@svml/protocol";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@svml/protocol";

import {
  compileBrollImplementationDigest,
  projectBrollAudioImplementationDigest,
  projectBrollVisualImplementationDigest,
} from "./program.js";

export const brollModuleRef = { name: "@svml/broll", version: "0.0.0-dev" } as const;
export const brollTypes = {
  program: { module: brollModuleRef, name: "BrollProgram" },
  product: { module: brollModuleRef, name: "BrollProduct" },
} satisfies Record<string, TypeRef>;
export const brollProducers = {
  compile: { module: brollModuleRef, name: "compile-broll" },
  projectVisual: { module: brollModuleRef, name: "project-broll-visual" },
  projectAudio: { module: brollModuleRef, name: "project-broll-audio" },
} satisfies Record<string, ProducerRef>;

const string = { kind: "string", minLength: 1 } as const;
const number = { kind: "number" } as const;
const unsignedInteger = { kind: "number", integer: true, minimum: 0 } as const;
const signedInteger = { kind: "number", integer: true } as const;
const digest = { kind: "string", minLength: 71, maxLength: 71 } as const;
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
  digest: { schema: digest },
  id: { schema: string },
  programSpaceDigest: { schema: digest },
  items: { schema: { kind: "array", minItems: 1, items: item } },
  transitions: { schema: { kind: "array", items: transition } },
});

export const brollProductSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.broll-product@1" } },
  productDigest: { schema: digest },
  programSpace: { schema: programSpaceSchema },
  visualTrack: { schema: visualTrackSchema },
  audioTrack: { schema: audioTrackSchema },
});

export const brollManifest: ModuleManifest = {
  format: "svml.module@0",
  name: brollModuleRef.name,
  version: brollModuleRef.version,
  dependencies: [
    videoContractDependencies.programSpace,
    videoContractDependencies.composition,
  ],
  types: [
    { name: brollTypes.program.name, schema: brollProgramSchema },
    { name: brollTypes.product.name, schema: brollProductSchema },
  ],
  capabilities: [],
  surfaces: [],
  producers: [
    {
      name: brollProducers.compile.name,
      inputs: [
        { name: "space", type: contractTypes.programSpace },
        { name: "program", type: brollTypes.program },
      ],
      outputs: [{
        name: "product",
        type: brollTypes.product,
        affinity: [
          { resultPointer: "/programSpace/digest", input: "space", inputPointer: "/digest" },
        ],
      }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "@svml/broll/compile",
        digest: compileBrollImplementationDigest,
      },
    },
    {
      name: brollProducers.projectVisual.name,
      inputs: [{ name: "product", type: brollTypes.product }],
      outputs: [{
        name: "visual",
        type: contractTypes.visualTrack,
        affinity: [
          { resultPointer: "/programSpaceDigest", input: "product", inputPointer: "/programSpace/digest" },
        ],
      }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "@svml/broll/project-visual",
        digest: projectBrollVisualImplementationDigest,
      },
    },
    {
      name: brollProducers.projectAudio.name,
      inputs: [{ name: "product", type: brollTypes.product }],
      outputs: [{
        name: "audio",
        type: contractTypes.audioTrack,
        affinity: [
          { resultPointer: "/programSpaceDigest", input: "product", inputPointer: "/programSpace/digest" },
        ],
      }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "@svml/broll/project-audio",
        digest: projectBrollAudioImplementationDigest,
      },
    },
  ],
};

export const brollManifestDigest = digestOf(brollManifest);
