import { canonicalize } from "@hypit/hypit/protocol";
import type {
  NlePackageSymbol,
  NlePictureAppearance,
  NleProject,
  NleTransaction,
} from "@hypit/nle";
import { assertNleProject, findNleItem, findNleTrack, nleLinearSourceTime } from "@hypit/nle";
import { sealLocalSpatialDomain } from "@hypit/spatial/algebra";
import {
  addExactTemporalValues,
  compareExactTemporalValues,
  sealLocalTemporalDomain,
  sealTemporalMap,
  subtractExactTemporalValues,
  type ExactTemporalValue,
  type TemporalMap,
} from "@hypit/temporal/algebra";

import { captionBasicNleComponentSymbol } from "./nle-package.js";
import {
  createCaptionPresentation,
  projectCaptionScheduleCues,
  scheduleCaptionPresentation,
} from "./source.js";
import type {
  CaptionDocument,
  CaptionPresentation,
  CaptionSelection,
  CaptionStyle,
  LocalCaptionTiming,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export type CaptionNleComponentSelection = (
  style: CaptionStyle,
) => { readonly component: NlePackageSymbol; readonly parameters?: Readonly<Record<string, unknown>> };

const defaultComponent: CaptionNleComponentSelection = (style) => {
  if (style.family !== "basic") {
    throw new Error(`Caption style family ${style.family} has no selected NLE Component.`);
  }
  return { component: captionBasicNleComponentSymbol };
};

type CaptionNleMaterializationInput = {
  readonly id: string;
  readonly track: string;
  readonly document: CaptionDocument;
  readonly timing: LocalCaptionTiming;
  readonly presentation: CaptionPresentation | CaptionStyle;
  readonly picture: NlePictureAppearance;
  readonly selection?: CaptionSelection;
  readonly itemId?: (cueId: string, occurrence: number) => string;
  readonly componentForStyle?: CaptionNleComponentSelection;
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
  const spec = {
    id: input.id,
    pictureDomain: sealLocalSpatialDomain({
      id: `${input.id}:materialization-space`,
      region: { x: 0, y: 0, width: project.canvas.width, height: project.canvas.height },
    }),
    selection: input.selection ?? { kind: "all" as const },
  };
  const schedule = scheduleCaptionPresentation(spec, input.document, input.timing, presentation);
  const projected = projectCaptionScheduleCues(
    input.id,
    input.document,
    schedule,
    presentation,
    occurrenceMapping,
  );
  const componentForStyle = input.componentForStyle ?? defaultComponent;
  const styles = new Map(schedule.styles.map((style) => [style.id, style] as const));
  const commands: NleTransaction["commands"][number][] = [];
  for (const cue of projected.cues) {
    if (cue.presentation.kind === "hidden") continue;
    const style = styles.get(cue.presentation.styleId);
    assert(style !== undefined, `Caption Cue ${cue.cueId} references missing Style ${cue.presentation.styleId}.`);
    const regions = occurrenceMapping === undefined ? cue.regions : cue.occurrenceRegions ?? [];
    const selected = componentForStyle(style);
    for (const [index, region] of regions.entries()) {
      const start = addExactTemporalValues(origin, region.start.position);
      const end = addExactTemporalValues(origin, region.end.position);
      if (compareExactTemporalValues(end, start) <= 0) continue;
      const duration = subtractExactTemporalValues(end, start);
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
          enabled: true,
          component: structuredClone(selected.component),
          parameters: canonicalize({
            text: cue.text,
            cueId: cue.cueId,
            styleId: style.id,
            family: style.family,
            style: style.parameters,
            ...(cue.role === undefined ? {} : { role: cue.role }),
            ...(selected.parameters ?? {}),
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

/**
 * Resolve source-local Caption cues through one explicitly selected Media Item, then bake the
 * resulting Programme times into ordinary Component Items. No named dependency survives the edit.
 */
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
