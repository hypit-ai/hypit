import { mediaDependency, mediaTypes } from "@narratage/media";
import { compositionDependency } from "@narratage/composition";
import {
  hyperframesManifest,
  hyperframesManifestDigest,
  hyperframesModuleRef,
  hyperframesTypes,
} from "@narratage/hyperframes";
import { digestOf } from "@narratage/protocol";
import type {
  CapabilityRef,
  ModuleManifest,
  ProducerRef,
} from "@narratage/protocol";
import {
  mediaPipelineManifestDigest,
  mediaPipelineModuleRef,
} from "@narratage/media-pipeline";

import {
  requestHyperframesVisualImplementationDigest,
} from "./product.js";

export const renderHyperframesModuleRef = { name: "@narratage/render-hyperframes", version: "0.0.0-dev" } as const;
export const renderHyperframesSurfaceImplementationDigest = digestOf("@narratage/render-hyperframes/surface@1");
export const renderHyperframesCapabilities = {
  renderVisual: { module: renderHyperframesModuleRef, name: "render-visual" },
} satisfies Record<string, CapabilityRef>;
export const renderHyperframesProducers = {
  requestVisual: { module: renderHyperframesModuleRef, name: "request-visual-render" },
} satisfies Record<string, ProducerRef>;

export const renderHyperframesManifest: ModuleManifest = {
  format: "svml.module@1",
  name: renderHyperframesModuleRef.name,
  version: renderHyperframesModuleRef.version,
  dependencies: [
    mediaDependency,
    compositionDependency,
    { module: hyperframesModuleRef, digest: hyperframesManifestDigest },
    { module: mediaPipelineModuleRef, digest: mediaPipelineManifestDigest },
  ],
  types: [],
  capabilities: [{
    name: renderHyperframesCapabilities.renderVisual.name,
    returns: mediaTypes.renderedVisual,
  }],
  surfaces: [{
    name: "video",
    tag: "Video",
    mode: "structured",
    outputs: [],
    implementation: {
      kind: "trusted-frontend-surface",
      locator: "@narratage/render-hyperframes/surface",
      digest: renderHyperframesSurfaceImplementationDigest,
    },
  }],
  producers: [
    {
      name: renderHyperframesProducers.requestVisual.name,
      inputs: [{ name: "document", type: hyperframesTypes.document }],
      outputs: [],
      needs: [{
        name: "visual",
        capability: renderHyperframesCapabilities.renderVisual,
        returns: mediaTypes.renderedVisual,
      }],
      implementation: {
        kind: "registered",
        locator: "@narratage/render-hyperframes/request-visual",
        digest: requestHyperframesVisualImplementationDigest,
      },
    },
  ],
};

export const renderHyperframesManifestDigest = digestOf(renderHyperframesManifest);
