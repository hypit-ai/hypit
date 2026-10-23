import type {
  StudioPlacement,
  StudioTemporalDeclarationCompanion,
  StudioTemporalDeclarationDraft,
  StudioTemporalRelationCompanion,
} from "@hypit/studio-companion";

import { narrativeTemporalModuleRef, narrativeTemporalProducers } from "./manifest.js";

function output(
  placement: StudioPlacement,
  name: string,
): StudioTemporalDeclarationDraft | undefined {
  if (placement.id === undefined) return undefined;
  const found = placement.outputPorts.find((candidate) => candidate.name === name);
  return found === undefined ? undefined : {
    id: placement.id,
    label: placement.id,
    output: found.ref,
    range: placement.range,
  };
}

export const narrativeStudioTemporalDeclarations: readonly StudioTemporalDeclarationCompanion[] = [{
  id: "instant-declaration",
  match: { module: narrativeTemporalModuleRef, surface: "narrative-instant" },
  project: ({ placement }) => {
    const found = output(placement, "instant");
    return found === undefined ? [] : [found];
  },
}];

function projectedInstant(
  producer: (typeof narrativeTemporalProducers)["projectSelectionInstant" | "projectSegmentInstant" | "projectMomentInstant"],
  sourceInput: "selection" | "segment" | "moment",
): StudioTemporalRelationCompanion {
  return {
    id: producer.name,
    match: { producer, output: "instant" },
    invert: () => [],
    trace({ output, inputs, identify }) {
      const held = output.value as { readonly id?: unknown; readonly timelineId?: unknown; readonly frame?: unknown };
      const spec = inputs.spec?.value as { readonly boundary?: unknown } | undefined;
      const source = inputs[sourceInput];
      const projection = inputs.projection?.value as { readonly id?: unknown } | undefined;
      const recognized = identify(sourceInput);
      if (source === undefined || recognized === undefined || typeof held.id !== "string"
        || typeof held.timelineId !== "string" || !Number.isSafeInteger(held.frame)
        || typeof projection?.id !== "string") return undefined;
      const boundary = typeof spec?.boundary === "string" ? spec.boundary : "point";
      const temporalSource = {
        scope: "timeline" as const,
        timelineId: held.timelineId,
        type: source.type,
        kind: recognized.kind,
        id: recognized.itemId,
        domain: { companion: recognized.companion, id: projection.id },
      };
      const reference = `${sourceInput}.${boundary === "cue" ? "cue" : boundary}`;
      return {
        kind: "instant",
        expression: reference,
        reference,
        frame: held.frame as number,
        source: temporalSource,
        authority: { kind: "domain", source: temporalSource, boundary },
      };
    },
  };
}

export const narrativeStudioTemporalRelations: readonly StudioTemporalRelationCompanion[] = [
  projectedInstant(narrativeTemporalProducers.projectSelectionInstant, "selection"),
  projectedInstant(narrativeTemporalProducers.projectSegmentInstant, "segment"),
  projectedInstant(narrativeTemporalProducers.projectMomentInstant, "moment"),
];
