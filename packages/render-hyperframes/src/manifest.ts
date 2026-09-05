import { artifactDependency, artifactTypes } from "@hypit/artifact";
import { mediaDependency, mediaTypes } from "@hypit/media";
import { compositionDependency, compositionTypes } from "@hypit/composition";
import { semanticTrackDependency, semanticTrackTypes } from "@hypit/semantic-track";
import {
  hyperframesManifest,
  hyperframesModuleRef,
  hyperframesTypes,
} from "@hypit/hyperframes";
import type {
  CapabilityRef,
  ModuleManifest,
  ProducerRef,
} from "@hypit/protocol";
import {
  mediaPipelineModuleRef,
} from "@hypit/media-pipeline";

export const renderHyperframesModuleRef = { name: "@hypit/render-hyperframes", version: "1" } as const;
export const renderHyperframesCapabilities = {
  renderVisual: { module: renderHyperframesModuleRef, name: "render-visual" },
} satisfies Record<string, CapabilityRef>;
export const renderHyperframesProducers = {
  requestVisualRange: { module: renderHyperframesModuleRef, name: "request-visual-range" },
  requestVisual: { module: renderHyperframesModuleRef, name: "request-visual-render" },
} satisfies Record<string, ProducerRef>;

export const renderHyperframesMarkupSurfaces = [{
    name: "video",
    tag: "Video",
    mode: "structured",
    outputs: [mediaTypes.frameRange],
    vocabulary: {
      summary:
        "Renders one Composition on one SemanticTrack into a final video, publishing the muxed result as a BlobArtifact.",
      attributes: [
        { name: "id", kind: "identifier", required: true,
          summary: "Names the render component and the final video this element publishes." },
        { name: "composition", kind: "reference", required: true,
          accepts: [compositionTypes.composition],
          summary: "Selects the Composition this element compiles, renders and muxes." },
        { name: "semantic", kind: "reference", required: true,
          accepts: [semanticTrackTypes.track],
          summary: "Selects the SemanticTrack whose derived duration and frame rate every rendered Product is bound to." },
        { name: "start-frame", kind: "literal", required: false, summary: "First original programme frame to render; requires end-frame-exclusive." },
        { name: "end-frame-exclusive", kind: "literal", required: false, summary: "First excluded frame; requires start-frame." },
      ],
      ports: [
        { name: "video", type: artifactTypes.blob,
          summary: "The final muxed video Artifact, addressed as `<id>.video`." },
      ],
      example: '<render:Video id="final" composition={main.composition} semantic={speech.semantic}/>',
      notes: [
        "id, composition and semantic are required; write both frame bounds to select a range; the element accepts no children and no text content.",
        "The visual render, the audio render and the mux are three separate Needs, each realized by a Provider this package does not choose.",
        "The published Artifact carries no duration or lineage metadata, so a consumer that needs stream facts requests explicit media inspection.",
      ],
    },
  }] as const;


export const renderHyperframesManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: renderHyperframesModuleRef.name,
  version: renderHyperframesModuleRef.version,
  dependencies: [
    artifactDependency,
    mediaDependency,
    compositionDependency,
    semanticTrackDependency,
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
    {
      name: renderHyperframesProducers.requestVisualRange.name,
      inputs: [{ name: "document", type: hyperframesTypes.document }, { name: "range", type: mediaTypes.frameRange }],
      outputs: [],
      needs: [{
        name: "visual",
        capability: renderHyperframesCapabilities.renderVisual,
        returns: mediaTypes.renderedVisual,
      }],
    },
  ],
};
