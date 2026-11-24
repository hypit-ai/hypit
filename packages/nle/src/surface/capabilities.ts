import { findNleComposition } from "../project.js";
import type { NleEditingContext } from "./types.js";
import { indexNleComposition } from "../indexing.js";
import type { NleProject } from "../types.js";
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

/** Resolve semantic Timeline editing support for the active Composition. */
export function resolveNleTimelineItemCapabilities(
  project: NleProject,
  editing: NleEditingContext,
): readonly NleTimelineItemCapabilities[] {
  const composition = findNleComposition(project, editing.activeComposition);
  const index = indexNleComposition(composition);
  return composition.tracks.flatMap((track) => track.items.map((item) => {
    const writable = !editing.lockedTracks.has(track.id);
    const related = index.transitionParticipants(item.id).length > 0
      || index.matteParticipants(item.id).length > 0;
    return {
      item: item.id,
      move: writable,
      trimStart: writable,
      trimEnd: writable,
      split: writable && !related,
    };
  }));
}
