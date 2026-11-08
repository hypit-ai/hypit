import {
  sealCaptionCuePayload,
  type CaptionCuePayload,
  type CaptionDocument,
  type CaptionSelection,
  type LocalCaptionTiming,
} from "@hypit/caption";
import type { NlePictureAppearance, NleProject, NleTransaction } from "@hypit/nle";
import { assertNleProject, findNleItem, findNleTrack, nleLinearSourceTime } from "@hypit/nle";
import { canonicalize } from "@hypit/protocol";
import {
  addExactTemporalValues,
  compareExactTemporalValues,
  compareTemporalMapPoints,
  preimageTemporalMapRegions,
  sealLocalTemporalDomain,
  sealTemporalMap,
  subtractExactTemporalValues,
  type ExactTemporalValue,
  type TemporalMap,
  type TemporalMapRegion,
} from "@hypit/temporal/algebra";

import { captionBasicNleComponentSymbol } from "./nle-package.js";
import {
  createCaptionPresentation,
  projectCaptionScheduleCues,
  scheduleCaptionPresentation,
} from "./presentation.js";
import type { CaptionPresentation, CaptionStyle } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function containsRegion(owner: TemporalMapRegion, candidate: TemporalMapRegion): boolean {
  return compareTemporalMapPoints(candidate.start, owner.start) >= 0
    && compareTemporalMapPoints(candidate.end, owner.end) <= 0;
}

function projectedUnitRegions(
  timing: LocalCaptionTiming,
  occurrenceMapping?: TemporalMap,
): ReadonlyMap<string, readonly TemporalMapRegion[]> {
  return new Map(timing.units.map((unit) => [unit.unitId, occurrenceMapping === undefined
    ? structuredClone(unit.regions)
    : preimageTemporalMapRegions(occurrenceMapping, {
      domain: timing.domain, regions: unit.regions,
    }).regions] as const));
}

function cuePayload(
  document: CaptionDocument,
  cue: { readonly cueId: string; readonly unitIds: readonly string[]; readonly role?: string },
  cueRegion: TemporalMapRegion,
  unitRegions: ReadonlyMap<string, readonly TemporalMapRegion[]>,
  duration: ExactTemporalValue,
): CaptionCuePayload {
  const documentUnits = new Map(document.units.map((unit) => [unit.id, unit] as const));
  const selected = new Set(cue.unitIds);
  const words = document.words.filter((word) => selected.has(word.unitId)).map((word) => structuredClone(word));
  const units = cue.unitIds.map((unitId) => {
    const unit = documentUnits.get(unitId);
    assert(unit !== undefined, `Caption Cue ${cue.cueId} references missing Unit ${unitId}.`);
    const regions = (unitRegions.get(unitId) ?? []).filter((region) => containsRegion(cueRegion, region));
    assert(regions.length === 1, regions.length === 0
      ? `Caption Unit ${unitId} has no complete occurrence inside Cue ${cue.cueId}.`
      : `Caption Unit ${unitId} has multiple occurrences inside one materialized Cue ${cue.cueId}.`);
    return {
      ...structuredClone(unit),
      start: subtractExactTemporalValues(regions[0]!.start.position, cueRegion.start.position),
      end: subtractExactTemporalValues(regions[0]!.end.position, cueRegion.start.position),
    };
  });
  return sealCaptionCuePayload({
    documentId: document.id,
    cueId: cue.cueId,
    ...(cue.role === undefined ? {} : { role: cue.role }),
    words,
    units,
  }, duration);
}

export type CaptionNleMaterializationInput = {
  readonly id: string;
  readonly track: string;
  readonly document: CaptionDocument;
  readonly timing: LocalCaptionTiming;
  readonly presentation: CaptionPresentation | CaptionStyle;
  readonly picture: NlePictureAppearance;
  readonly selection?: CaptionSelection;
  readonly itemId?: (cueId: string, occurrence: number) => string;
};

function materializeCaptionProjection(
  project: NleProject,
  input: CaptionNleMaterializationInput,
  origin: ExactTemporalValue,
  occurrenceMapping?: TemporalMap,
): NleTransaction {
  const track = findNleTrack(project, input.track);
  assert(track.kind === "picture", "Caption materialization requires a Picture Track.");
  const presentation = "overrides" in input.presentation
    ? structuredClone(input.presentation) : createCaptionPresentation(input.presentation);
  const schedule = scheduleCaptionPresentation(
    input.document,
    input.timing,
    presentation,
    input.selection ?? { kind: "all" },
  );
  const projected = projectCaptionScheduleCues(input.id, input.document, schedule, presentation, occurrenceMapping);
  const styles = new Map(schedule.styles.map((style) => [style.id, style] as const));
  const unitRegions = projectedUnitRegions(input.timing, occurrenceMapping);
  const commands: NleTransaction["commands"][number][] = [];
  for (const cue of projected.cues) {
    const style = styles.get(cue.styleId);
    assert(style !== undefined, `Caption Cue ${cue.cueId} references missing Style ${cue.styleId}.`);
    const regions = occurrenceMapping === undefined ? cue.regions : cue.occurrenceRegions ?? [];
    for (const [index, region] of regions.entries()) {
      const start = addExactTemporalValues(origin, region.start.position);
      const end = addExactTemporalValues(origin, region.end.position);
      if (compareExactTemporalValues(end, start) <= 0) continue;
      const duration = subtractExactTemporalValues(end, start);
      const caption = cuePayload(input.document, cue, region, unitRegions, duration);
      commands.push({
        kind: "item.add",
        track: track.id,
        item: {
          id: input.itemId?.(cue.cueId, index)
            ?? `${input.id}:${cue.cueId}${regions.length === 1 ? "" : `:${index + 1}`}`,
          kind: "component",
          start,
          duration,
          sourceTime: nleLinearSourceTime(duration),
          enabled: cue.presentation.kind !== "hidden",
          component: structuredClone(captionBasicNleComponentSymbol),
          parameters: canonicalize({
            caption,
            styleId: style.id,
            family: style.family,
            style: style.parameters,
          }),
          picture: structuredClone(input.picture),
        },
      });
    }
  }
  return { revision: project.revision, commands };
}

/** Bake source-local Caption timing into independent, directly editable NLE Component Items. */
export function createCaptionNleMaterialization(
  project: NleProject,
  input: CaptionNleMaterializationInput & { readonly at: ExactTemporalValue },
): NleTransaction {
  assertNleProject(project);
  return materializeCaptionProjection(project, input, input.at);
}

/** Resolve Caption Cues through one selected Media Item, then persist direct Programme times. */
export function createCaptionNleMaterializationForMediaItem(
  project: NleProject,
  input: CaptionNleMaterializationInput & { readonly mediaItem: string },
): NleTransaction {
  assertNleProject(project);
  const occurrence = findNleItem(project, input.mediaItem).item;
  assert(occurrence.kind === "media", `Caption materialization target ${input.mediaItem} is not a Media Item.`);
  const mapping = sealTemporalMap({ stages: [{
    target: sealLocalTemporalDomain({
      id: `${input.id}:${occurrence.id}:occurrence`,
      duration: structuredClone(occurrence.duration),
    }),
    source: structuredClone(input.timing.domain),
    pieces: structuredClone(occurrence.sourceTime.pieces),
  }] });
  return materializeCaptionProjection(project, input, occurrence.start, mapping);
}
