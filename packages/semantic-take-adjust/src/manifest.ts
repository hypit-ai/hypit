import { narrativeDependency } from "@hypit/narrative";
import type { ModuleManifest, ProducerRef, TypeRef } from "@hypit/protocol";
import { speechDependency, speechTypes } from "@hypit/speech";

export const semanticTakeAdjustModuleRef = { name: "@hypit/semantic-take-adjust", version: "1" } as const;

export const semanticTakeAdjustTypes = {
  plan: { module: semanticTakeAdjustModuleRef, name: "SemanticTakeAdjustmentPlan" },
} satisfies Record<string, TypeRef>;

export const semanticTakeAdjustProducers = {
  adjust: { module: semanticTakeAdjustModuleRef, name: "adjust-semantic-take" },
} satisfies Record<string, ProducerRef>;

export const semanticTakeAdjustMarkupSurfaces = [{
  name: "semantic-take",
  tag: "SemanticTake",
  mode: "structured",
  outputs: [semanticTakeAdjustTypes.plan, speechTypes.semanticTake],
  vocabulary: {
    summary: "Applies explicit author corrections to measured SemanticTake anchor frames without changing its media or Script identities.",
    attributes: [
      { name: "id", kind: "identifier", required: true,
        summary: "Names the corrected SemanticTake." },
      { name: "source", kind: "reference", required: true, accepts: [speechTypes.semanticTake],
        summary: "Selects the measured SemanticTake being corrected." },
    ],
    ports: [{ name: "take", type: speechTypes.semanticTake,
      summary: "The corrected SemanticTake, addressed as `<id>.take`." }],
    example: `<adjust:SemanticTake id="opening-corrected" source={opening-measured.take}>
  <adjust:Anchor at={story.moment.answer} frame="63"/>
</adjust:SemanticTake>`,
    notes: [
      "Each Anchor names an author-declared Script Moment and gives its exact Segment-local frame.",
      "This is an explicit correction layer over measured evidence; it does not guess timing or modify media.",
      "Every Token boundary that owns the corrected Anchor is updated together, preserving SemanticTake identity invariants.",
    ],
  },
}] as const;

export const semanticTakeAdjustManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: semanticTakeAdjustModuleRef.name,
  version: semanticTakeAdjustModuleRef.version,
  dependencies: [narrativeDependency, speechDependency],
  types: [{ name: semanticTakeAdjustTypes.plan.name }],
  capabilities: [],
  producers: [{
    name: semanticTakeAdjustProducers.adjust.name,
    inputs: [
      { name: "source", type: speechTypes.semanticTake },
      { name: "plan", type: semanticTakeAdjustTypes.plan },
    ],
    outputs: [{ name: "take", type: speechTypes.semanticTake }],
    needs: [],
  }],
};
