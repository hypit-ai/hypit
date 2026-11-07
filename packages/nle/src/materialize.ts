import { verifyPreparedMedia } from "@hypit/media";
import type { CanonicalValue } from "@hypit/hypit/protocol";
import { exactTemporalZero, type ExactTemporalValue } from "@hypit/temporal/algebra";

import { assertNleProject, findNleTrack } from "./project.js";
import type { NleTransaction } from "./transaction.js";
import type {
  NleAudioAppearance,
  NleComponentItem,
  NleEffect,
  NlePackageSymbol,
  NlePictureAppearance,
  NlePictureLayout,
  NleProject,
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
  readonly mediaId: string;
  readonly itemId: string;
  readonly name: string;
  /** Persistent project reference. The NLE never embeds runtime BlobRefs. */
  readonly asset: NleMediaAssetReference;
  /** File-persistent facts used only to derive and validate the direct edit. */
  readonly interpretation: NleMediaInterpretation;
  readonly track: string;
  readonly at: ExactTemporalValue;
  readonly duration?: ExactTemporalValue;
  /** Defaults to an empty Audio effect chain when the interpretation has Audio; false excludes it. */
  readonly audio?: Partial<NleAudioAppearance> | false;
  readonly picture?: Partial<NlePictureAppearance> & { readonly layout?: NlePictureLayout };
}): NleTransaction {
  assertNleProject(project);
  verifyPreparedMedia({
    ...input.interpretation,
    source: {
      kind: "blob",
      resource: "res_nle-media-import-validation",
      size: 0,
      mediaType: "application/octet-stream",
    },
  });
  const track = findNleTrack(project, input.track);
  const duration = input.duration ?? (input.interpretation.domain === undefined
    ? undefined
    : input.interpretation.domain.duration);
  assert(duration !== undefined,
    `Constant NLE Media ${input.mediaId} requires an explicit occurrence duration.`);
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
      kind: "media.add",
      media: { id: input.mediaId, name: input.name, asset: structuredClone(input.asset) },
    }, {
      kind: "item.add",
      track: track.id,
      item: {
        id: input.itemId,
        kind: "media",
        media: input.mediaId,
        start: structuredClone(input.at),
        duration: structuredClone(duration),
        localStart: exactTemporalZero(),
        enabled: true,
        ...(includeAudio ? { audio: { effects: structuredClone(input.audio?.effects ?? []) } } : {}),
        ...(track.kind === "audio" ? {} : { picture: {
          layout: structuredClone(input.picture?.layout ?? fullCanvas(project)),
          effects: structuredClone(input.picture?.effects ?? []),
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
  readonly at: ExactTemporalValue;
  readonly duration: ExactTemporalValue;
  readonly localStart?: ExactTemporalValue;
  readonly layout?: NlePictureLayout;
  readonly effects?: readonly NleEffect[];
  readonly audio?: Partial<NleAudioAppearance>;
}): NleTransaction {
  assertNleProject(project);
  const track = findNleTrack(project, input.track);
  const item: NleComponentItem = {
    id: input.id,
    kind: "component",
    component: structuredClone(input.component),
    parameters: structuredClone(input.parameters),
    start: structuredClone(input.at),
    duration: structuredClone(input.duration),
    localStart: structuredClone(input.localStart ?? exactTemporalZero()),
    enabled: true,
    ...(input.audio === undefined ? {} : { audio: {
      effects: structuredClone(input.audio.effects ?? []),
    } }),
    ...(track.kind === "audio" ? {} : { picture: {
      layout: structuredClone(input.layout ?? fullCanvas(project)),
      effects: structuredClone(input.effects ?? []),
    } }),
  };
  assert(track.kind !== "audio" || item.audio !== undefined,
    `NLE Component ${input.id} on an Audio Track requires Audio appearance.`);
  return { revision: project.revision, commands: [{ kind: "item.add", track: track.id, item }] };
}
