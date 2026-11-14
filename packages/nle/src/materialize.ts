import { preparedPictureExtent, verifyPreparedMedia } from "@hypit/media";
import type { CanonicalValue } from "@hypit/protocol";
import type { ExactTemporalValue } from "@hypit/temporal/algebra";

import { assertNleProject, findNleTrack } from "./project.js";
import { nleLinearTimeMapping } from "./source-time.js";
import { containNlePictureLayout } from "./picture.js";
import type { NleTransaction } from "./transaction.js";
import type {
  NleAudioAppearance,
  NleAdjustmentItem,
  NleComponentSharedValueReference,
  NlePackageSymbol,
  NlePictureAppearance,
  NlePictureLayout,
  NleProject,
  NleTimeMapping,
  NleMediaAssetReference,
  NleMediaInterpretation,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function fullCanvas(project: NleProject): NlePictureLayout {
  return { x: 0, y: 0, width: project.canvas.width, height: project.canvas.height, fit: "contain" };
}

/** NLE-owned import transaction; applying it does not retain a live dependency on the producer. */
export function createMediaAssetMaterialization(project: NleProject, input: {
  readonly itemId: string;
  /** Persistent project reference. The NLE never embeds runtime BlobRefs. */
  readonly asset: NleMediaAssetReference;
  /** File-persistent facts used only to derive and validate the direct edit. */
  readonly interpretation: NleMediaInterpretation;
  readonly track: string;
  readonly at: ExactTemporalValue;
  readonly duration?: ExactTemporalValue;
  /** Includes the selected Audio source when present; false excludes it. */
  readonly audio?: Partial<NleAudioAppearance> | false;
  readonly picture?: Partial<NlePictureAppearance> & { readonly layout?: NlePictureLayout };
}): NleTransaction {
  assertNleProject(project);
  const prepared = {
    ...input.interpretation,
    source: {
      kind: "blob",
      resource: "res_nle-media-import-validation",
      size: 0,
      mediaType: "application/octet-stream",
    },
  } as const;
  verifyPreparedMedia(prepared);
  const track = findNleTrack(project, input.track);
  const duration = input.duration ?? (input.interpretation.domain === undefined
    ? undefined
    : input.interpretation.domain.duration);
  assert(duration !== undefined,
    `Constant NLE Media Asset ${input.asset.path} requires an explicit occurrence duration.`);
  const includeAudio = input.audio !== false && input.interpretation.audio !== undefined;
  assert(input.audio === undefined || input.audio === false || input.interpretation.audio !== undefined,
    `Media Interpretation ${input.interpretation.id} cannot include missing Audio.`);
  assert(track.kind !== "picture" || input.interpretation.picture !== undefined,
    `Media Interpretation ${input.interpretation.id} has no Picture for Track ${track.id}.`);
  assert(track.kind !== "audio" || input.interpretation.audio !== undefined,
    `Media Interpretation ${input.interpretation.id} has no Audio for Track ${track.id}.`);
  return {
    revision: project.revision,
    commands: [{
      kind: "item.add",
      track: track.id,
      item: {
        id: input.itemId,
        kind: "present",
        source: "media",
        asset: structuredClone(input.asset),
        start: structuredClone(input.at),
        duration: structuredClone(duration),
        sourceTime: nleLinearTimeMapping(duration),
        enabled: true,
        ...(includeAudio ? { audio: structuredClone(input.audio ?? {}) } : {}),
        ...(track.kind === "audio" ? {} : { picture: {
          layout: structuredClone(input.picture?.layout ?? containNlePictureLayout(
            project.canvas,
            (() => {
              const extent = preparedPictureExtent(prepared);
              return { width: extent.widthPx, height: extent.heightPx };
            })(),
          )),
        } }),
      },
    }],
  };
}

/** Materialize one package Component instance without evaluating its Programme. */
export function createComponentMaterialization(project: NleProject, input: {
  readonly id: string;
  readonly track: string;
  readonly component: NlePackageSymbol;
  readonly parameters: CanonicalValue;
  readonly sharedValues?: readonly NleComponentSharedValueReference[];
  readonly media?: Readonly<Record<string, NleMediaAssetReference>>;
  readonly at: ExactTemporalValue;
  readonly duration: ExactTemporalValue;
  readonly sourceTime?: NleTimeMapping;
  readonly layout?: NlePictureLayout;
  readonly audio?: Partial<NleAudioAppearance>;
}): NleTransaction {
  assertNleProject(project);
  const track = findNleTrack(project, input.track);
  const item = {
    id: input.id,
    kind: "present" as const,
    source: "component" as const,
    component: structuredClone(input.component),
    parameters: structuredClone(input.parameters),
    ...(input.sharedValues === undefined ? {} : { sharedValues: structuredClone(input.sharedValues) }),
    ...(input.media === undefined ? {} : { media: structuredClone(input.media) }),
    start: structuredClone(input.at),
    duration: structuredClone(input.duration),
    sourceTime: structuredClone(input.sourceTime ?? nleLinearTimeMapping(input.duration)),
    enabled: true,
    ...(input.audio === undefined ? {} : { audio: structuredClone(input.audio) }),
    ...(track.kind === "audio" ? {} : { picture: {
      layout: structuredClone(input.layout ?? fullCanvas(project)),
    } }),
  };
  assert(track.kind !== "audio" || item.audio !== undefined,
    `NLE Component ${input.id} on an Audio Track requires Audio appearance.`);
  return { revision: project.revision, commands: [{ kind: "item.add", track: track.id, item }] };
}

/** Materialize one independently timed Programme-scoped Operator Application. */
export function createAdjustmentMaterialization(project: NleProject, input: {
  readonly id: string;
  readonly track: string;
  readonly operator: NlePackageSymbol;
  readonly parameters: CanonicalValue;
  readonly at: ExactTemporalValue;
  readonly duration: ExactTemporalValue;
  readonly controlTime?: NleTimeMapping;
}): NleTransaction {
  assertNleProject(project);
  findNleTrack(project, input.track);
  const item: NleAdjustmentItem = {
    id: input.id,
    kind: "adjustment",
    operator: structuredClone(input.operator),
    parameters: structuredClone(input.parameters),
    start: structuredClone(input.at),
    duration: structuredClone(input.duration),
    controlTime: structuredClone(input.controlTime ?? nleLinearTimeMapping(input.duration)),
    enabled: true,
  };
  return { revision: project.revision, commands: [{ kind: "item.add", track: input.track, item }] };
}
