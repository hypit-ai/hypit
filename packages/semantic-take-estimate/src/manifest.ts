import { estimateModuleRef, estimateTypes } from "@hypit/estimate";
import { mediaDependency, mediaTypes } from "@hypit/media";
import { narrativeDependency, narrativeTypes } from "@hypit/narrative";
import type { ModuleManifest, ProducerRef } from "@hypit/protocol";
import { speechDependency, speechTypes } from "@hypit/speech";
import { svsRecipeType } from "@hypit/svs";

export const semanticTakeEstimateModuleRef = { name: "@hypit/semantic-take-estimate", version: "1" } as const;

export const semanticTakeEstimateProducers = {
  materialize: { module: semanticTakeEstimateModuleRef, name: "materialize-estimated-semantic-take" },
} satisfies Record<string, ProducerRef>;

export const semanticTakeEstimateMarkupSurfaces = [{
  name: "semantic-take",
  tag: "SemanticTake",
  mode: "structured",
  outputs: [estimateTypes.speechPolicy, speechTypes.semanticTake],
  vocabulary: {
    summary:
      "Projects estimated word windows or wordless Segment boundaries onto normalized media and publishes a SemanticTake.",
    attributes: [
      { name: "id", kind: "identifier", required: true,
        summary: "Names this estimated alignment and the SemanticTake it publishes." },
      { name: "narrative", kind: "reference", required: true, accepts: [narrativeTypes.narrative],
        summary: "Selects the authored Narrative that owns every Token and Anchor identity." },
      { name: "segment", kind: "reference", required: true, accepts: [narrativeTypes.excerpt],
        summary: "Selects the single authored Segment represented by the normalized video." },
      { name: "media", kind: "reference", required: true, accepts: [mediaTypes.synchronized],
        summary: "Selects the already normalized SynchronizedMedia whose exact frame domain receives the estimate." },
      { name: "policy", kind: "reference", required: false, accepts: [svsRecipeType],
        summary: "Selects an SVS Recipe carrying the delivery policy (language, pace or rate, rounding), in place of the inline attributes.",
        recipe: [
          { name: "language", required: true, summary: "Selects the counting rules the Segment is read with, or detects them.", values: ["auto", "en", "zh", "ja", "es"] },
          { name: "pace", required: false, summary: "Selects a named delivery density.", values: ["slow", "normal", "fast"] },
          { name: "rate", required: false, summary: "Sets the delivery density in pronunciation units per second, in place of pace." },
          { name: "rounding", required: true, summary: "Selects how an estimated duration is rounded.", values: ["none", "round", "ceil"] },
        ] },
      { name: "language", kind: "literal", required: false, values: ["auto", "en", "zh", "ja", "es"],
        summary: "Selects the counting rules the Segment is read with, or detects them from its Text." },
      { name: "pace", kind: "literal", required: false, values: ["slow", "normal", "fast"],
        summary: "Selects a named delivery density for the chosen language." },
      { name: "rate", kind: "literal", required: false,
        summary: "Sets the delivery density in pronunciation units per second, in place of pace." },
      { name: "rounding", kind: "literal", required: false, values: ["none", "round", "ceil"],
        summary: "Selects how an estimated duration is rounded." },
    ],
    ports: [
      { name: "take", type: speechTypes.semanticTake,
        summary: "The estimated SemanticTake, addressed as `<id>.take`." },
      { name: "policy", type: estimateTypes.speechPolicy,
        summary: "The sealed delivery policy this element weights Tokens with, addressed as `<id>.policy`." },
    ],
    example: `<estimated:SemanticTake id="opening-estimated" narrative={story}
  segment={story.segment.opening} media={opening-media.media}
  language="en" pace="normal" rounding="round"/>`,
    notes: [
      "The policy is the element's own: write it inline or name an SVS Recipe with policy; never both.",
      "This package does not measure audio and never claims WhisperX or other acoustic evidence.",
      "Every spoken Token uses its original Script identity. A wordless Segment keeps its two authored boundary Anchors.",
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
    { module: svsRecipeType.module },
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
