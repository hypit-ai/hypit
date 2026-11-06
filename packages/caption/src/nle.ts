import type { NleProjectionValue, NleSubjectProjector } from "@hypit/nle-view";

import { captionModuleRef, captionTypes } from "./manifest.js";
import {
  assertCaptionDocument,
  assertCaptionPresentation,
  assertCaptionPresentationSchedule,
  projectCaptionScheduleNle,
} from "./source.js";
import type {
  CaptionDocument,
  CaptionPresentation,
  CaptionPresentationSchedule,
} from "./types.js";

function valueOf<T>(values: Readonly<Record<string, NleProjectionValue>>, name: string): T {
  const value = values[name]?.value;
  if (value === undefined) throw new Error(`Caption NLE projection requires ${name}.`);
  return value as unknown as T;
}

/**
 * Caption owns Cue interpretation and presentation actions. It deliberately publishes no temporal
 * mutation: Cue regions belong to the supplied LocalCaptionTiming owner.
 */
export const captionNleSubjectProjector: NleSubjectProjector = {
  id: "cues",
  module: captionModuleRef,
  declaration: "Component",
  requirements: [
    { id: "document", type: captionTypes.document, from: { kind: "input", name: "document" } },
    { id: "presentation", type: captionTypes.presentation,
      from: { kind: "output", name: "presentation" } },
    { id: "schedule", type: captionTypes.schedule, from: { kind: "output", name: "schedule" } },
  ],
  project(context) {
    const document = valueOf<CaptionDocument>(context.values, "document");
    const presentation = valueOf<CaptionPresentation>(context.values, "presentation");
    const schedule = valueOf<CaptionPresentationSchedule>(context.values, "schedule");
    assertCaptionDocument(document);
    assertCaptionPresentation(presentation);
    assertCaptionPresentationSchedule(schedule);
    const projection = projectCaptionScheduleNle(context.ownerId, document, schedule, presentation,
      context.target?.mapping);
    return {
      id: "cues",
      label: "Captions",
      items: projection.cues.map((cue) => ({
        id: cue.cueId,
        label: cue.text,
        summary: [cue.role, cue.presentation.kind === "hidden"
          ? "Hidden" : cue.presentation.styleId].filter(Boolean).join(" · "),
        regions: {
          domain: projection.occurrenceDomain ?? projection.sourceDomain,
          regions: cue.occurrenceRegions ?? cue.regions,
        },
        actions: [{
          id: "style",
          label: "Change style",
          authority: { module: captionModuleRef, declaration: "Component", action: "style-cues",
            subject: context.subject },
          preset: { cues: [cue.cueId] },
        }, {
          id: "hide",
          label: "Hide",
          authority: { module: captionModuleRef, declaration: "Component", action: "hide-cues",
            subject: context.subject },
          preset: { cues: [cue.cueId] },
        }],
      })),
    };
  },
};
