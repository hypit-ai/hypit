import { estimateModuleRef, estimateTypes } from "@hypit/estimate";
import { mediaDependency, mediaTypes } from "@hypit/media";
import { narrativeDependency, narrativeTypes } from "@hypit/narrative";
import type { ModuleManifest, ProducerRef } from "@hypit/protocol";
import { speechDependency, speechTypes } from "@hypit/speech";

export const semanticTakeEstimateModuleRef = { name: "@hypit/semantic-take-estimate", version: "1" } as const;

export const semanticTakeEstimateProducers = {
  materialize: { module: semanticTakeEstimateModuleRef, name: "materialize-estimated-semantic-take" },
} satisfies Record<string, ProducerRef>;

export const semanticTakeEstimateMarkupSurfaces = [{
  name: "semantic-take",
  tag: "SemanticTake",
  mode: "structured",
  outputs: [speechTypes.semanticTake],
  vocabulary: {
    summary:
      "Projects syllable-weighted estimated word windows onto one already normalized video and publishes a SemanticTake.",
    attributes: [
      { name: "id", kind: "identifier", required: true,
        summary: "Names this estimated alignment and the SemanticTake it publishes." },
      { name: "narrative", kind: "reference", required: true, accepts: [narrativeTypes.narrative],
        summary: "Selects the authored Narrative that owns every Token and Anchor identity." },
      { name: "segment", kind: "reference", required: true, accepts: [narrativeTypes.excerpt],
        summary: "Selects the single authored Segment represented by the normalized video." },
      { name: "media", kind: "reference", required: true, accepts: [mediaTypes.synchronized],
        summary: "Selects the already normalized SynchronizedMedia whose exact frame domain receives the estimate." },
      { name: "policy", kind: "reference", required: true, accepts: [estimateTypes.speechPolicy],
        summary: "Selects the speech-estimate policy whose explicit language rules weight each authored Token." },
    ],
    ports: [{ name: "take", type: speechTypes.semanticTake,
      summary: "The estimated SemanticTake, addressed as `<id>.take`." }],
    example: `<estimated:SemanticTake id="opening-estimated" narrative={story}
  segment={story.segment.opening} media={opening-media.media}
  policy={opening-duration.policy}/>`,
    notes: [
      "This package does not measure audio and never claims WhisperX or other acoustic evidence.",
      "Every Token uses its original Script identity. Only its local frame window is estimated.",
      "Pronunciation-unit weights determine relative word lengths; adjacent words and both media edges retain non-zero frame gaps.",
      "The result has the same SemanticTake Type as a measured alignment, so Run chooses between ordinary candidates without a preview-specific downstream protocol.",
    ],
  },
}] as const;

export const semanticTakeEstimateManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: semanticTakeEstimateModuleRef.name,
  version: semanticTakeEstimateModuleRef.version,
  dependencies: [
    mediaDependency,
    narrativeDependency,
    speechDependency,
    { module: estimateModuleRef },
  ],
  types: [],
  capabilities: [],
  producers: [{
    name: semanticTakeEstimateProducers.materialize.name,
    inputs: [
      { name: "narrative", type: narrativeTypes.narrative },
      { name: "segment", type: narrativeTypes.excerpt },
      { name: "media", type: mediaTypes.synchronized },
      { name: "policy", type: estimateTypes.speechPolicy },
    ],
    outputs: [{ name: "take", type: speechTypes.semanticTake }],
    needs: [],
  }],
};
