import { temporalContextAttributeVocabulary } from "@hypit/temporal/markup";
import { blobDependency, blobTypes } from "@hypit/hypit/blob";
import { mediaDependency, mediaTypes } from "@hypit/media";
import { compositionDependency, compositionTypes } from "@hypit/composition";
import { timelineDependency, timelineTypes } from "@hypit/timeline";
import { htmlProgramModuleRef } from "@hypit/html-program";
import type { ModuleManifest } from "@hypit/hypit/protocol";
import {
  mediaOperationsModuleRef,
} from "@hypit/media-operations";

export const htmlVideoModuleRef = { name: "@hypit/html-video", version: "1" } as const;
export const htmlVideoMarkupSurfaces = [{
    name: "video",
    tag: "Video",
    mode: "structured",
    outputs: [timelineTypes.frameSpan, mediaTypes.delivery],
    vocabulary: {
      summary:
        "Produces one final video from a Composition on its selected film time axis, publishing the muxed result as a Blob.",
      attributes: [
        { name: "id", kind: "identifier", required: true,
          summary: "Names this video assembly and the final video it publishes." },
        { name: "composition", kind: "reference", required: true,
          accepts: [compositionTypes.composition],
          summary: "Selects the Composition this element compiles, rasterizes and muxes." },
        { name: "delivery", kind: "reference", required: false, accepts: [mediaTypes.delivery],
          summary: "Selects an explicit MediaDeliverySpec instead of the standard HTML video delivery." },
        { name: "quality", kind: "literal", required: false, values: ["draft", "standard", "high"],
          summary: "Selects the standard delivery quality when delivery is omitted." },
        ...temporalContextAttributeVocabulary,
        { name: "start-frame", kind: "literal", required: false, summary: "First original program frame to render; requires end-frame-exclusive." },
        { name: "end-frame-exclusive", kind: "literal", required: false, summary: "First excluded frame; requires start-frame." },
      ],
      ports: [
        { name: "video", type: blobTypes.blob,
          summary: "The final muxed video Artifact, addressed as `<id>.video`." },
      ],
      example: '<html:Video id="final" composition={main.composition} timeline={speech.timeline}/>',
      notes: [
        "Supply id, composition and timeline. Write both frame bounds to select a range. The element is empty.",
        "Write either delivery or quality, not both. Omitted delivery becomes an explicit standard BT.709 H.264/AAC MP4 requirement in the author graph.",
        "Visual rasterization, audio preparation and mux are three separate Needs, each realized by a Provider this package does not choose.",
        "The published Artifact carries no duration or lineage metadata, so a consumer that needs stream facts requests explicit media inspection.",
      ],
    },
  }] as const;


export const htmlVideoManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: htmlVideoModuleRef.name,
  version: htmlVideoModuleRef.version,
  dependencies: [
    blobDependency,
    mediaDependency,
    compositionDependency,
    timelineDependency,
    htmlProgramModuleRef,
    mediaOperationsModuleRef,
  ],
  types: [],
  capabilities: [],
  producers: [],
};
