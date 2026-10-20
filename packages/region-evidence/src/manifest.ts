import type { ModuleManifest, ProducerRef, TypeRef } from "@hypit/hypit/protocol";
import { spatialDependency, spatialTypes } from "@hypit/spatial";
import { recipeType } from "@hypit/hypit/recipe";
import { timelineDependency, timelineTypes } from "@hypit/timeline";

export const regionEvidenceModuleRef = { name: "@hypit/region-evidence", version: "1" } as const;
export const regionEvidenceTypes = {
  evidence: { module: regionEvidenceModuleRef, name: "RegionEvidence" },
} satisfies Record<string, TypeRef>;
export const regionEvidenceProducers = {
  resolve: { module: regionEvidenceModuleRef, name: "resolve-region-evidence" },
} satisfies Record<string, ProducerRef>;

export const regionEvidenceMarkupSurface = {
  name: "evidence", tag: "Evidence", mode: "structured", outputs: [regionEvidenceTypes.evidence],
  vocabulary: {
    summary: "Resolves externally prepared normalized regions into one frame-exact Region Evidence.",
    attributes: [
      { name: "id", kind: "identifier", required: true, summary: "Names the RegionEvidence value." },
      { name: "within", kind: "reference", required: true, accepts: [spatialTypes.frame], summary: "Chooses the program-picture Frame normalized regions occupy." },
      { name: "timeline", kind: "reference", required: true, accepts: [timelineTypes.timeline], summary: "Chooses the Timeline whose Frames index the evidence." },
      { name: "recipe", kind: "reference", required: true, accepts: [recipeType], summary: "Chooses a Recipe with one or more named region series.", recipe: [
        { name: "series", required: true, summary: "Lists {id, regions}; each regions array contains one normalized [x, y, width, height] or null per Timeline Frame." },
      ] },
    ],
    example: `<region:Evidence id="heads" within={vertical.bounds} timeline={program.timeline} recipe={tracking.heads.default}/>` ,
    notes: [
      "The element is empty; it accepts no children or text.",
      "Detection, identity association, interpolation and source-to-picture projection remain explicit preparation choices.",
      "The resolver performs no detection and never invents a missing region.",
    ],
  },
} as const;

export const regionEvidenceManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: regionEvidenceModuleRef.name,
  version: regionEvidenceModuleRef.version,
  dependencies: [spatialDependency, { module: recipeType.module }, timelineDependency],
  types: [{ name: regionEvidenceTypes.evidence.name }],
  capabilities: [],
  producers: [{
    name: regionEvidenceProducers.resolve.name,
    inputs: [
      { name: "within", type: spatialTypes.frame },
      { name: "timeline", type: timelineTypes.timeline },
      { name: "recipe", type: recipeType },
    ],
    result: { kind: "output" as const, name: "evidence", type: regionEvidenceTypes.evidence },
  }],
};
export const regionEvidenceDependency = { module: regionEvidenceModuleRef } as const;
