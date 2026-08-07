import {
  contractTypes,
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
} from "@svml/protocol";
import {
  mediaPipelineManifestDigest,
  mediaPipelineModuleRef,
} from "@svml/media-pipeline";

import {
  requestHyperframesVisualImplementationDigest,
} from "./product.js";

export const hyperframesRenderModuleRef = { name: "@svml/hyperframes-render", version: "0.0.0-dev" } as const;
export const hyperframesRenderSurfaceImplementationDigest = digestOf("@svml/hyperframes-render/surface@1");
export const hyperframesRenderCapabilities = {
  renderVisual: { module: hyperframesRenderModuleRef, name: "render-visual" },
} satisfies Record<string, CapabilityRef>;
export const hyperframesRenderProducers = {
  requestVisual: { module: hyperframesRenderModuleRef, name: "request-visual-render" },
} satisfies Record<string, ProducerRef>;

export const hyperframesRenderManifest: ModuleManifest = {
  format: "svml.module@0",
  name: hyperframesRenderModuleRef.name,
  version: hyperframesRenderModuleRef.version,
  dependencies: [
    videoContractDependencies.media,
    videoContractDependencies.composition,
    { module: hyperframesModuleRef, digest: hyperframesManifestDigest },
    { module: mediaPipelineModuleRef, digest: mediaPipelineManifestDigest },
  ],
  types: [],
  capabilities: [{
    name: hyperframesRenderCapabilities.renderVisual.name,
    returns: contractTypes.renderedVisual,
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
      name: hyperframesRenderProducers.requestVisual.name,
      inputs: [{ name: "document", type: hyperframesTypes.document }],
      outputs: [],
      needs: [{
        name: "visual",
        capability: hyperframesRenderCapabilities.renderVisual,
        returns: contractTypes.renderedVisual,
      }],
      implementation: {
        kind: "registered",
        locator: "@svml/hyperframes-render/request-visual",
        digest: requestHyperframesVisualImplementationDigest,
      },
    },
  ],
};

export const hyperframesRenderManifestDigest = digestOf(hyperframesRenderManifest);
