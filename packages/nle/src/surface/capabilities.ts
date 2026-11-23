import { findNleComposition } from "../project.js";
import type { NleEditingContext } from "./types.js";
import { indexNleComposition } from "../indexing.js";
import { resolveNleOperatorParameters } from "../project.js";
import type { NleItem, NleProject } from "../types.js";
import type { NleAuthoringHost, NleProcessAuthoringContext } from "./authoring.js";
import type {
  NleTimelineAffordancePolicy,
  NleTimelineItemCapabilities,
} from "./projection-types.js";

export const allNleTimelineAffordances: NleTimelineAffordancePolicy = {
  move: true,
  trimStart: true,
  trimEnd: true,
  split: true,
};

function itemTimeWindow(
  project: NleProject,
  composition: NleProject["compositions"][number],
  track: NleProject["compositions"][number]["tracks"][number],
  item: NleItem,
  authoring: NleAuthoringHost | undefined,
): boolean {
  if (item.kind === "adjust") {
    return authoring?.operatorTimeWindow({
      project,
      composition,
      track,
      item,
      process: item,
      parameters: resolveNleOperatorParameters(project, item.operator, item.parameters),
      scope: { kind: "adjust" },
    }) === true;
  }
  const contexts: NleProcessAuthoringContext[] = [
    ...(item.picture?.processes ?? []).map((process) => ({
      project, composition, track, item, process,
      parameters: resolveNleOperatorParameters(project, process.operator, process.parameters),
      scope: { kind: "occurrence" as const, medium: "picture" as const },
    })),
    ...(item.audio?.processes ?? []).map((process) => ({
      project, composition, track, item, process,
      parameters: resolveNleOperatorParameters(project, process.operator, process.parameters),
      scope: { kind: "occurrence" as const, medium: "audio" as const },
    })),
  ];
  return contexts.every((context) => authoring?.operatorTimeWindow(context) === true);
}

/** Resolve semantic Timeline editing support for the active Composition. */
export function resolveNleTimelineItemCapabilities(
  project: NleProject,
  editing: NleEditingContext,
  authoring?: NleAuthoringHost,
): readonly NleTimelineItemCapabilities[] {
  const composition = findNleComposition(project, editing.activeComposition);
  const index = indexNleComposition(composition);
  return composition.tracks.flatMap((track) => track.items.map((item) => {
    const writable = !editing.lockedTracks.has(track.id);
    const timeWindow = writable && itemTimeWindow(project, composition, track, item, authoring);
    const related = index.transitionParticipants(item.id).length > 0
      || index.matteParticipants(item.id).length > 0;
    return {
      item: item.id,
      move: writable,
      trimStart: timeWindow,
      trimEnd: timeWindow,
      split: timeWindow && !related,
    };
  }));
}
