import { programSourceFromPreparedMedia } from "@hypit/audiovisual-media";
import { verifyPreparedMedia } from "@hypit/media";
import type { PreparedMedia } from "@hypit/media";
import type { CanonicalValue } from "@hypit/protocol";
import { resolveTemporalBoundary } from "@hypit/temporal/sampling";

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
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function fullCanvas(project: NleProject): NlePictureLayout {
  return { x: 0, y: 0, width: project.canvas.width, height: project.canvas.height, fit: "contain" };
}

/** NLE-owned import transaction; applying it does not retain a live dependency on the producer. */
export function createPreparedMediaMaterialization(project: NleProject, input: {
  readonly mediaId: string;
  readonly itemId: string;
  readonly name: string;
  readonly prepared: PreparedMedia;
  readonly track: string;
  readonly atFrame: number;
  readonly durationFrames?: number;
  /** Defaults to an empty Audio effect chain when the prepared media has Audio; false excludes it. */
  readonly audio?: Partial<NleAudioAppearance> | false;
  readonly picture?: Partial<NlePictureAppearance> & { readonly layout?: NlePictureLayout };
}): NleTransaction {
  assertNleProject(project);
  verifyPreparedMedia(input.prepared);
  const track = findNleTrack(project, input.track);
  const source = programSourceFromPreparedMedia(input.prepared);
  const durationFrames = input.durationFrames ?? (input.prepared.domain === undefined
    ? undefined
    : resolveTemporalBoundary(input.prepared.domain.duration, { frameRate: project.frameRate }, "cover"));
  assert(durationFrames !== undefined,
    `Constant NLE Media ${input.mediaId} requires an explicit occurrence duration.`);
  const includeAudio = input.audio !== false && source.outputs.audio !== undefined;
  assert(input.audio === undefined || input.audio === false || source.outputs.audio !== undefined,
    `Prepared Media ${input.prepared.id} cannot include missing Audio.`);
  assert(track.kind !== "picture" || source.outputs.picture !== undefined,
    `Prepared Media ${input.prepared.id} has no Picture for Track ${track.id}.`);
  assert(track.kind !== "audio" || source.outputs.audio !== undefined,
    `Prepared Media ${input.prepared.id} has no Audio for Track ${track.id}.`);
  return {
    revision: project.revision,
    commands: [{
      kind: "media.add",
      media: { id: input.mediaId, name: input.name, prepared: structuredClone(input.prepared) },
    }, {
      kind: "item.add",
      track: track.id,
      item: {
        id: input.itemId,
        kind: "media",
        media: input.mediaId,
        startFrame: input.atFrame,
        durationFrames,
        localStartFrame: 0,
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
  readonly atFrame: number;
  readonly durationFrames: number;
  readonly localStartFrame?: number;
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
    startFrame: input.atFrame,
    durationFrames: input.durationFrames,
    localStartFrame: input.localStartFrame ?? 0,
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
