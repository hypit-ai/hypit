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

export const regionEvidenceManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: regionEvidenceModuleRef.name,
  version: regionEvidenceModuleRef.version,
  dependencies: [spatialDependency, recipeType.module, timelineDependency],
  types: [regionEvidenceTypes.evidence.name],
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
export const regionEvidenceDependency = regionEvidenceModuleRef;
