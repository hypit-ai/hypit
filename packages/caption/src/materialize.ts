import { canonicalize } from "@hypit/hypit/protocol";
import type {
  NlePackageSymbol,
  NlePictureAppearance,
  NleProject,
  NleTransaction,
} from "@hypit/nle";
import { assertNleProject, findNleTrack } from "@hypit/nle";
import { sealLocalSpatialDomain } from "@hypit/spatial/algebra";
import { resolveTemporalBoundary } from "@hypit/temporal/sampling";

import { captionBasicNleRendererSymbol } from "./nle-package.js";
import {
  createCaptionPresentation,
  projectCaptionScheduleNle,
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

export type CaptionNleRendererSelection = (
  style: CaptionStyle,
) => { readonly renderer: NlePackageSymbol; readonly parameters?: Readonly<Record<string, unknown>> };

const defaultRenderer: CaptionNleRendererSelection = (style) => {
  if (style.family !== "basic") {
    throw new Error(`Caption style family ${style.family} has no selected NLE renderer.`);
  }
  return { renderer: captionBasicNleRendererSymbol };
};

/** Bake source-local Caption timing into independent, directly editable NLE Caption Items. */
export function createCaptionNleMaterialization(project: NleProject, input: {
  readonly id: string;
  readonly track: string;
  readonly document: CaptionDocument;
  readonly timing: LocalCaptionTiming;
  readonly presentation: CaptionPresentation | CaptionStyle;
  readonly atFrame: number;
  readonly picture: NlePictureAppearance;
  readonly selection?: CaptionSelection;
  readonly itemId?: (cueId: string) => string;
  readonly rendererForStyle?: CaptionNleRendererSelection;
}): NleTransaction {
  assertNleProject(project);
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
  const projected = projectCaptionScheduleNle(input.id, input.document, schedule, presentation);
  const rendererForStyle = input.rendererForStyle ?? defaultRenderer;
  const styles = new Map(schedule.styles.map((style) => [style.id, style] as const));
  const commands: NleTransaction["commands"][number][] = [];
  for (const cue of projected.cues) {
    if (cue.presentation.kind === "hidden") continue;
    const style = styles.get(cue.presentation.styleId);
    assert(style !== undefined, `Caption Cue ${cue.cueId} references missing Style ${cue.presentation.styleId}.`);
    const region = cue.regions[0];
    assert(region !== undefined && cue.regions.length === 1,
      `Caption Cue ${cue.cueId} must materialize as one source-local region.`);
    const start = input.atFrame + resolveTemporalBoundary(region.start.position,
      { frameRate: project.frameRate }, "inside");
    const end = input.atFrame + resolveTemporalBoundary(region.end.position,
      { frameRate: project.frameRate }, "cover");
    assert(end > start, `Caption Cue ${cue.cueId} does not cover one NLE frame.`);
    const selected = rendererForStyle(style);
    commands.push({
      kind: "item.add",
      track: track.id,
      item: {
        id: input.itemId?.(cue.cueId) ?? `${input.id}:${cue.cueId}`,
        kind: "caption",
        startFrame: start,
        durationFrames: end - start,
        localStartFrame: 0,
        enabled: true,
        text: cue.text,
        renderer: structuredClone(selected.renderer),
        parameters: canonicalize({
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
  return { revision: project.revision, commands };
}
