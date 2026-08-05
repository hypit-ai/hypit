import {
  contractTypes,
  mediaArtifactSchema,
  videoContractDependencies,
} from "@svml/contracts";
import {
  hyperframesManifest,
  hyperframesManifestDigest,
  hyperframesModuleRef,
  hyperframesTypes,
} from "@svml/hyperframes";
import { digestOf } from "@svml/protocol";
import type {
  CapabilityRef,
  ModuleManifest,
  ProducerRef,
  TypeRef,
  ValueSchema,
} from "@svml/protocol";

import {
  projectHyperframesVideoImplementationDigest,
  requestHyperframesRenderImplementationDigest,
} from "./product.js";

export const hyperframesRenderModuleRef = { name: "@svml/hyperframes-render", version: "0.0.0-dev" } as const;
export const hyperframesRenderSurfaceImplementationDigest = digestOf("@svml/hyperframes-render/surface@1");
export const hyperframesRenderTypes = {
  product: { module: hyperframesRenderModuleRef, name: "HyperframesRenderedVideo" },
} satisfies Record<string, TypeRef>;
export const hyperframesRenderCapabilities = {
  render: { module: hyperframesRenderModuleRef, name: "render-video" },
} satisfies Record<string, CapabilityRef>;
export const hyperframesRenderProducers = {
  request: { module: hyperframesRenderModuleRef, name: "request-render" },
  projectVideo: { module: hyperframesRenderModuleRef, name: "project-video" },
} satisfies Record<string, ProducerRef>;

const digest = { kind: "string", minLength: 71, maxLength: 71 } as const;
const positiveInteger = { kind: "number", integer: true, minimum: 1 } as const;
export const hyperframesRenderedVideoSchema: ValueSchema = {
  kind: "object",
  fields: {
    contract: { schema: { kind: "literal", value: "svml.hyperframes-rendered-video@2" } },
    digest: { schema: digest },
    documentDigest: { schema: digest },
    programSpaceDigest: { schema: digest },
    frameRate: { schema: {
      kind: "object",
      fields: {
        numerator: { schema: positiveInteger },
        denominator: { schema: positiveInteger },
      },
    } },
    frameCount: { schema: positiveInteger },
    canvas: { schema: {
      kind: "object",
      fields: {
        width: { schema: positiveInteger },
        height: { schema: positiveInteger },
      },
    } },
    artifact: { schema: mediaArtifactSchema },
  },
};

export const hyperframesRenderManifest: ModuleManifest = {
  format: "svml.module@0",
  name: hyperframesRenderModuleRef.name,
  version: hyperframesRenderModuleRef.version,
  dependencies: [
    videoContractDependencies.media,
    videoContractDependencies.composition,
    { module: hyperframesModuleRef, digest: hyperframesManifestDigest },
  ],
  types: [{ name: hyperframesRenderTypes.product.name, schema: hyperframesRenderedVideoSchema }],
  capabilities: [{
    name: hyperframesRenderCapabilities.render.name,
    returns: hyperframesRenderTypes.product,
  }],
  surfaces: [{
    name: "video",
    tag: "Video",
    mode: "structured",
    outputs: [],
    implementation: {
      kind: "trusted-frontend-surface",
      locator: "@svml/hyperframes-render/surface",
      digest: hyperframesRenderSurfaceImplementationDigest,
    },
  }],
  producers: [
    {
      name: hyperframesRenderProducers.request.name,
      inputs: [{ name: "document", type: hyperframesTypes.document }],
      outputs: [],
      needs: [{
        name: "product",
        capability: hyperframesRenderCapabilities.render,
        returns: hyperframesRenderTypes.product,
        affinity: [
          { resultPointer: "/documentDigest", input: "document", inputPointer: "/digest" },
          { resultPointer: "/programSpaceDigest", input: "document", inputPointer: "/programSpaceDigest" },
          { resultPointer: "/frameRate/numerator", input: "document", inputPointer: "/frameRate/numerator" },
          { resultPointer: "/frameRate/denominator", input: "document", inputPointer: "/frameRate/denominator" },
          { resultPointer: "/frameCount", input: "document", inputPointer: "/frameCount" },
          { resultPointer: "/canvas/width", input: "document", inputPointer: "/canvas/width" },
          { resultPointer: "/canvas/height", input: "document", inputPointer: "/canvas/height" },
        ],
      }],
      implementation: {
        kind: "registered",
        locator: "@svml/hyperframes-render/request",
        digest: requestHyperframesRenderImplementationDigest,
      },
    },
    {
      name: hyperframesRenderProducers.projectVideo.name,
      inputs: [{ name: "product", type: hyperframesRenderTypes.product }],
      outputs: [{
        name: "video",
        type: contractTypes.mediaArtifact,
        affinity: [{ resultPointer: "/digest", input: "product", inputPointer: "/artifact/digest" }],
      }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "@svml/hyperframes-render/project-video",
        digest: projectHyperframesVideoImplementationDigest,
      },
    },
  ],
};

export const hyperframesRenderManifestDigest = digestOf(hyperframesRenderManifest);
