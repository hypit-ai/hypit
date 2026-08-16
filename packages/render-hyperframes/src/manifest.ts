import { artifactDependency } from "@narratage/artifact";
import { mediaDependency, mediaTypes } from "@narratage/media";
import { compositionDependency } from "@narratage/composition";
import {
  hyperframesManifest,
  hyperframesModuleRef,
  hyperframesTypes,
} from "@narratage/hyperframes";
import type {
  CapabilityRef,
  ModuleManifest,
  ProducerRef,
} from "@narratage/protocol";
import {
  mediaPipelineModuleRef,
} from "@narratage/media-pipeline";

export const renderHyperframesModuleRef = { name: "@narratage/render-hyperframes", version: "1" } as const;
export const renderHyperframesCapabilities = {
  renderVisual: { module: renderHyperframesModuleRef, name: "render-visual" },
} satisfies Record<string, CapabilityRef>;
export const renderHyperframesProducers = {
  requestVisual: { module: renderHyperframesModuleRef, name: "request-visual-render" },
} satisfies Record<string, ProducerRef>;

export const renderHyperframesMarkupSurfaces = [{
    name: "video",
    tag: "Video",
    mode: "structured",
    outputs: [],
  }] as const;


export const renderHyperframesManifest: ModuleManifest = {
  format: "narratage.module@1",
  name: renderHyperframesModuleRef.name,
  version: renderHyperframesModuleRef.version,
  dependencies: [
    artifactDependency,
    mediaDependency,
    compositionDependency,
    { module: hyperframesModuleRef },
    { module: mediaPipelineModuleRef },
  ],
  types: [],
  capabilities: [{
    name: renderHyperframesCapabilities.renderVisual.name,
    returns: mediaTypes.renderedVisual,
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
    },
  ],
};
