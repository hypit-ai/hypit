import {
  sealCaptionCuePayload,
  type CaptionCuePayload,
  type CaptionDocument,
  type CaptionSelection,
  type LocalCaptionTiming,
} from "@hypit/caption";
import type { NlePictureAppearance, NleProject, NleTransaction } from "@hypit/nle";
import { assertNleProject, findNleItem, findNleTrack, nleLinearSourceTime } from "@hypit/nle";
import {
  addExactTemporalValues,
  compareExactTemporalValues,
  compareTemporalMapPoints,
  exactTemporalZero,
  preimageTemporalMapRegions,
  sealLocalTemporalDomain,
  sealTemporalMap,
  subtractExactTemporalValues,
  type ExactTemporalValue,
  type TemporalMap,
  type TemporalMapRegion,
} from "@hypit/temporal/algebra";

import {
  createCaptionPresentation,
  projectCaptionScheduleCues,
  scheduleCaptionPresentation,
} from "./presentation.js";
import type {
  CaptionNleFamily,
  CaptionPresentation,
  CaptionStyle,
  CaptionVisibilityEnvelope,
} from "./types.js";

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
  contentRegion: TemporalMapRegion,
  visibleRegion: TemporalMapRegion,
  unitRegions: ReadonlyMap<string, readonly TemporalMapRegion[]>,
  duration: ExactTemporalValue,
): CaptionCuePayload {
  const documentUnits = new Map(document.units.map((unit) => [unit.id, unit] as const));
  const selected = new Set(cue.unitIds);
  const words = document.words.filter((word) => selected.has(word.unitId)).map((word) => structuredClone(word));
  const units = cue.unitIds.map((unitId) => {
    const unit = documentUnits.get(unitId);
    assert(unit !== undefined, `Caption Cue ${cue.cueId} references missing Unit ${unitId}.`);
    const regions = (unitRegions.get(unitId) ?? []).filter((region) => containsRegion(contentRegion, region));
    assert(regions.length === 1, regions.length === 0
      ? `Caption Unit ${unitId} has no complete occurrence inside Cue ${cue.cueId}.`
      : `Caption Unit ${unitId} has multiple occurrences inside one materialized Cue ${cue.cueId}.`);
    return {
      ...structuredClone(unit),
      start: subtractExactTemporalValues(regions[0]!.start.position, visibleRegion.start.position),
      end: subtractExactTemporalValues(regions[0]!.end.position, visibleRegion.start.position),
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

function minimum(left: ExactTemporalValue, right: ExactTemporalValue): ExactTemporalValue {
  return compareExactTemporalValues(left, right) <= 0 ? structuredClone(left) : structuredClone(right);
}

function maximum(left: ExactTemporalValue, right: ExactTemporalValue): ExactTemporalValue {
  return compareExactTemporalValues(left, right) >= 0 ? structuredClone(left) : structuredClone(right);
}

function visibleRegion(
  content: TemporalMapRegion,
  policy: CaptionVisibilityEnvelope | undefined,
  upperBound: ExactTemporalValue | undefined,
): TemporalMapRegion {
  const zero = exactTemporalZero();
  const lead = policy?.lead ?? zero;
  const tail = policy?.tail ?? zero;
  const start = maximum(zero, subtractExactTemporalValues(content.start.position, lead));
  const desiredEnd = addExactTemporalValues(content.end.position, tail);
  const end = upperBound === undefined ? desiredEnd : minimum(desiredEnd, upperBound);
  return {
    start: { position: start, side: "after" },
    end: { position: maximum(start, end), side: "before" },
  };
}

export type CaptionNleMaterializationInput<Family extends string = string> = {
  readonly id: string;
  readonly track: string;
  readonly document: CaptionDocument;
  readonly timing: LocalCaptionTiming;
  readonly presentation: CaptionPresentation<Family> | CaptionStyle<Family>;
  readonly family: CaptionNleFamily<Family>;
  readonly picture: NlePictureAppearance;
  readonly selection?: CaptionSelection;
  readonly itemId?: (cueId: string, occurrence: number) => string;
};

function materializeCaptionProjection<Family extends string>(
  project: NleProject,
  input: CaptionNleMaterializationInput<Family>,
  origin: ExactTemporalValue,
  occurrenceMapping?: TemporalMap,
): NleTransaction {
  const track = findNleTrack(project, input.track);
  assert(track.kind === "picture", "Caption materialization requires a Picture Track.");
  const presentation = "overrides" in input.presentation
    ? structuredClone(input.presentation) : createCaptionPresentation(input.presentation);
  assert(presentation.family === input.family.family,
    `Caption presentation belongs to ${presentation.family}, not ${input.family.family}.`);
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
  const upperBound = occurrenceMapping?.stages[0]!.target.duration;
  const occurrences = projected.cues.flatMap((cue) => {
    const style = styles.get(cue.styleId);
    assert(style !== undefined, `Caption Cue ${cue.cueId} references missing Style ${cue.styleId}.`);
    const regions = occurrenceMapping === undefined ? cue.regions : cue.occurrenceRegions ?? [];
    return regions.map((region, index) => ({
      cue,
      style,
      index,
      content: structuredClone(region),
      visible: visibleRegion(region, style.visibility, upperBound),
    }));
  }).sort((left, right) => compareTemporalMapPoints(left.content.start, right.content.start)
    || compareTemporalMapPoints(left.content.end, right.content.end)
    || left.cue.cueId.localeCompare(right.cue.cueId));
  const previousByRole = new Map<string | undefined, number>();
  for (const [occurrenceIndex, occurrence] of occurrences.entries()) {
    const previousIndex = previousByRole.get(occurrence.cue.role);
    const previous = previousIndex === undefined ? undefined : occurrences[previousIndex];
    if (previous !== undefined && occurrence.style.visibility?.handoff === "cut"
      && compareTemporalMapPoints(previous.content.end, occurrence.content.start) <= 0) {
      previous.visible = {
        ...previous.visible,
        end: { position: minimum(previous.visible.end.position, occurrence.content.start.position), side: "before" },
      };
      occurrence.visible = {
        ...occurrence.visible,
        start: { position: maximum(occurrence.visible.start.position, previous.visible.end.position), side: "after" },
      };
    }
    previousByRole.set(occurrence.cue.role, occurrenceIndex);
  }
  const counts = new Map<string, number>();
  for (const occurrence of occurrences) counts.set(occurrence.cue.cueId,
    (counts.get(occurrence.cue.cueId) ?? 0) + 1);
  for (const occurrence of occurrences) {
    const start = addExactTemporalValues(origin, occurrence.visible.start.position);
    const end = addExactTemporalValues(origin, occurrence.visible.end.position);
    if (compareExactTemporalValues(end, start) <= 0) continue;
    const duration = subtractExactTemporalValues(end, start);
    const caption = cuePayload(input.document, occurrence.cue, occurrence.content,
      occurrence.visible, unitRegions, duration);
    commands.push({
      kind: "item.add",
      track: track.id,
      item: {
        id: input.itemId?.(occurrence.cue.cueId, occurrence.index)
          ?? `${input.id}:${occurrence.cue.cueId}${counts.get(occurrence.cue.cueId) === 1
            ? "" : `:${occurrence.index + 1}`}`,
        kind: "component",
        start,
        duration,
        sourceTime: nleLinearSourceTime(duration),
        enabled: occurrence.cue.presentation.kind !== "hidden",
        component: structuredClone(input.family.component),
        parameters: input.family.parameters(caption, occurrence.style),
        picture: structuredClone(input.picture),
      },
    });
  }
  return { revision: project.revision, commands };
}

/** Bake source-local Caption timing into independent, directly editable NLE Component Items. */
export function createCaptionNleMaterialization<Family extends string>(
  project: NleProject,
  input: CaptionNleMaterializationInput<Family> & { readonly at: ExactTemporalValue },
): NleTransaction {
  assertNleProject(project);
  return materializeCaptionProjection(project, input, input.at);
}

/** Resolve Caption Cues through one selected Media Item, then persist direct Programme times. */
export function createCaptionNleMaterializationForMediaItem<Family extends string>(
  project: NleProject,
  input: CaptionNleMaterializationInput<Family> & { readonly mediaItem: string },
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
