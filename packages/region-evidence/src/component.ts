import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { ProducerPackage } from "@hypit/hypit/producer";
import { canonicalize } from "@hypit/hypit/protocol";
import type { Value } from "@hypit/hypit/protocol";
import type { SpatialFrame } from "@hypit/spatial";
import type { Recipe } from "@hypit/hypit/recipe";
import type { Timeline } from "@hypit/timeline";

import { regionEvidenceProducers, regionEvidenceTypes } from "./manifest.js";
import { assertRegionEvidence, resolveRegionEvidence } from "./evidence.js";
import type { RegionEvidence } from "./types.js";

function valueOf<T>(value: Value | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is missing.`);
  return value as unknown as T;
}
const output = (value: unknown) => ((canonicalize(value)));

export const regionEvidenceComponent = {
  producers: [{ producer: regionEvidenceProducers.resolve, handler: ({ inputs }) => ({ kind: "output", value: output(resolveRegionEvidence(
    valueOf<Recipe>(inputs.recipe?.value, "Recipe"),
    valueOf<SpatialFrame>(inputs.within?.value, "SpatialFrame"),
    valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
  )) }) }],
  refinements: [{ type: regionEvidenceTypes.evidence, handler: ({ value }) => assertRegionEvidence(valueOf<RegionEvidence>(value, "RegionEvidence")) }],
} satisfies ProducerPackage & RefinementPackage;
