import { indexNleComposition, type NleAuthoringHost, type NleProject } from "@hypit/nle";

import type {
  NleTimelineAffordancePolicy,
  NleTimelineItemCapabilities,
  NleTimelineView,
} from "./types.js";
import { assertNleTimelineViewForProject } from "./view.js";

/** Maximum direct Timeline gesture vocabulary before one product applies its own smaller whitelist. */
export const allNleTimelineAffordances: NleTimelineAffordancePolicy = {
  move: true,
  trimStart: true,
  trimEnd: true,
  split: true,
};

/**
 * Resolve semantic occurrence capabilities before applying any product-visible whitelist.
 * Media and nested Composition have stable Source clocks. Package Components and Adjustments
 * must explicitly promise stable Source or Control window behavior through NLE authoring.
 */
export function resolveNleTimelineItemCapabilities(
  project: NleProject,
  view: NleTimelineView,
  authoring?: Pick<NleAuthoringHost, "occurrenceTemporalSupport">,
): readonly NleTimelineItemCapabilities[] {
  assertNleTimelineViewForProject(view, project);
  const index = indexNleComposition(project);
  const locked = new Set(view.tracks.filter((state) => state.locked).map((state) => state.track));
  return project.tracks.flatMap((track) => track.items.map((item) => {
    const writable = !locked.has(track.id);
    const hasLocalOperators = item.kind === "present"
      && ((item.picture?.operators?.length ?? 0) > 0 || (item.audio?.operators?.length ?? 0) > 0);
    const intrinsicTimeWindow = item.kind === "present"
      && (item.source === "media" || item.source === "composition") && !hasLocalOperators;
    const declaredTimeWindow = authoring?.occurrenceTemporalSupport(project, item.id)?.timeWindow;
    const timeWindow = declaredTimeWindow ?? intrinsicTimeWindow;
    // Splitting a relation participant requires an explicit relation rewrite that Core does not guess.
    const related = index.transitionParticipants(item.id).length > 0
      || index.matteParticipants(item.id).length > 0;
    return {
      item: item.id,
      move: writable,
      trimStart: writable && timeWindow,
      trimEnd: writable && timeWindow,
      split: writable && timeWindow && !related,
    };
  }));
}

