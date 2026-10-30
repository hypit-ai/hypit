import {
  addExactTemporalValues,
  assertLocalTemporalDomain,
  assertTemporalMap,
  compareExactTemporalValues,
  composeTemporalMaps,
  exactTemporalZero,
  sealLocalTemporalDomain,
  sealTemporalMap,
  subtractExactTemporalValues,
} from "@hypit/temporal";
import type {
  ExactTemporalValue,
  LocalTemporalDomain,
  TemporalMap,
} from "@hypit/temporal";
import { canonicalize } from "@hypit/hypit/protocol";
import type { BlobRef } from "@hypit/hypit/protocol";

import { verifyMediaInspection, verifyMediaStreamSelection, verifyPreparedMedia } from "./identity.js";
import type {
  MediaAudioStream,
  MediaInspection,
  MediaStreamSelection,
  MediaTimestamp,
  MediaVideoStream,
  PreparedAudioMember,
  PreparedAudioSource,
  PreparedMedia,
  PreparedVisualMember,
  PreparedVisualSource,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function exact(value: MediaTimestamp): ExactTemporalValue {
  return { ticks: value.ticks, timeBase: { ...value.timeBase } };
}

function streamDomain(id: string, start: MediaTimestamp, end: MediaTimestamp): LocalTemporalDomain {
  return sealLocalTemporalDomain({ id, duration: subtractExactTemporalValues(exact(end), exact(start)) });
}

function selectedStream<T extends MediaVideoStream | MediaAudioStream>(
  inspection: MediaInspection,
  index: number,
  kind: T["kind"],
): T {
  const stream = inspection.streams.find((candidate) => candidate.index === index && candidate.kind === kind) as T | undefined;
  assert(stream !== undefined && stream.startPts !== undefined && stream.endPts !== undefined,
    `Prepared Media selected ${kind} stream ${index} has no admissible presentation span.`);
  return stream;
}

function memberMap(
  prepared: LocalTemporalDomain,
  authorityStart: ExactTemporalValue,
  source: LocalTemporalDomain,
  sourceStart: ExactTemporalValue,
): TemporalMap {
  const zero = exactTemporalZero();
  const sourceEndOnPrepared = subtractExactTemporalValues(
    addExactTemporalValues(sourceStart, source.duration), authorityStart,
  );
  const sourceStartOnPrepared = subtractExactTemporalValues(sourceStart, authorityStart);
  const targetStart = compareExactTemporalValues(sourceStartOnPrepared, zero) < 0 ? zero : sourceStartOnPrepared;
  const targetEnd = compareExactTemporalValues(sourceEndOnPrepared, prepared.duration) > 0
    ? prepared.duration : sourceEndOnPrepared;
  assert(compareExactTemporalValues(targetStart, targetEnd) < 0,
    `Prepared Media member ${source.id} does not overlap authority domain ${prepared.id}.`);
  const sourceAtStart = subtractExactTemporalValues(
    addExactTemporalValues(authorityStart, targetStart), sourceStart,
  );
  return sealTemporalMap({
    stages: [{
      target: prepared,
      source,
      pieces: [{
        target: { start: targetStart, end: targetEnd },
        sourceAtStart,
        rate: { numerator: 1, denominator: 1 },
      }],
    }],
  });
}

/** Establish the selected source members and their shared exact local domain without materializing bytes. */
export function prepareMedia(input: {
  readonly id: string;
  readonly source: BlobRef;
  readonly inspection: MediaInspection;
  readonly selection: MediaStreamSelection;
}): PreparedMedia {
  verifyMediaInspection(input.inspection);
  verifyMediaStreamSelection(input.selection);
  const video = input.selection.videoStreamIndex === undefined ? undefined
    : selectedStream<MediaVideoStream>(input.inspection, input.selection.videoStreamIndex, "video");
  const audio = input.selection.audioStreamIndex === undefined ? undefined
    : selectedStream<MediaAudioStream>(input.inspection, input.selection.audioStreamIndex, "audio");
  const authority = input.selection.spanAuthority === "video" ? video : audio;
  assert(authority?.startPts !== undefined && authority.endPts !== undefined,
    `Prepared Media ${input.id} has no selected ${input.selection.spanAuthority} authority stream.`);
  const authorityStart = exact(authority.startPts);
  const domain = sealLocalTemporalDomain({
    id: input.id,
    duration: subtractExactTemporalValues(exact(authority.endPts), authorityStart),
  });
  let visual: PreparedVisualMember | undefined;
  if (video?.startPts !== undefined && video.endPts !== undefined) {
    assert(input.selection.picture !== undefined,
      `Prepared Media ${input.id} selected video without an author-resolved picture interpretation.`);
    const sourceDomain = streamDomain(`${input.id}:visual-source`, video.startPts, video.endPts);
    const presentationStart = exact(video.startPts);
    visual = {
      streamIndex: video.index,
      presentationStart,
      sourceDomain,
      map: memberMap(domain, authorityStart, sourceDomain, presentationStart),
      interpretation: {
        codedWidth: video.width,
        codedHeight: video.height,
        sampleAspectRatio: { ...video.sampleAspectRatio },
        rotationDegrees: video.rotationDegrees,
        picture: structuredClone(input.selection.picture),
      },
    };
  }
  let preparedAudio: PreparedAudioMember | undefined;
  if (audio?.startPts !== undefined && audio.endPts !== undefined) {
    const sourceDomain = streamDomain(`${input.id}:audio-source`, audio.startPts, audio.endPts);
    const presentationStart = exact(audio.startPts);
    preparedAudio = {
      streamIndex: audio.index,
      presentationStart,
      sourceDomain,
      map: memberMap(domain, authorityStart, sourceDomain, presentationStart),
      interpretation: {
        sampleRate: audio.sampleRate,
        channels: audio.channels,
        ...(audio.channelLayout === undefined ? {} : { channelLayout: audio.channelLayout }),
      },
    };
  }
  const value = canonicalize({
    source: input.source,
    domain,
    ...(visual === undefined ? {} : { visual }),
    ...(preparedAudio === undefined ? {} : { audio: preparedAudio }),
  }) as unknown as PreparedMedia;
  verifyPreparedMedia(value);
  return value;
}

/** Apply one target-to-current relation to every selected member without materializing media. */
export function mapPreparedMedia(media: PreparedMedia, relation: TemporalMap): PreparedMedia {
  verifyPreparedMedia(media);
  assertTemporalMap(relation);
  const relationSource = relation.stages.at(-1)!.source.id;
  assert(relationSource === media.domain.id,
    `Prepared Media map source ${relationSource} differs from ${media.domain.id}.`);
  const domain = structuredClone(relation.stages[0]!.target);
  const value = canonicalize({
    source: media.source,
    domain,
    ...(media.visual === undefined ? {} : {
      visual: { ...media.visual, map: composeTemporalMaps(relation, media.visual.map) },
    }),
    ...(media.audio === undefined ? {} : {
      audio: { ...media.audio, map: composeTemporalMaps(relation, media.audio.map) },
    }),
  }) as unknown as PreparedMedia;
  verifyPreparedMedia(value);
  return value;
}

/** Display geometry after pixel aspect and rotation, without materializing pixels. */
export function preparedVisualExtent(media: PreparedMedia): { readonly widthPx: number; readonly heightPx: number } {
  verifyPreparedMedia(media);
  assert(media.visual !== undefined, "Prepared Media has no visual member.");
  const value = media.visual.interpretation;
  let width = value.codedWidth * value.sampleAspectRatio.numerator / value.sampleAspectRatio.denominator;
  let height = value.codedHeight;
  if (value.rotationDegrees === 90 || value.rotationDegrees === 270) [width, height] = [height, width];
  assert(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0,
    "Prepared visual display extent is not finite and positive.");
  return { widthPx: width, heightPx: height };
}

export function preparedMediaExtent(media: PreparedMedia): ExactTemporalValue {
  verifyPreparedMedia(media);
  assertLocalTemporalDomain(media.domain);
  return structuredClone(media.domain.duration);
}

/** Project only the selected visual signal facts needed by terminal visual programmes. */
export function preparedVisualSource(media: PreparedMedia): PreparedVisualSource {
  verifyPreparedMedia(media);
  assert(media.visual !== undefined, "Prepared Media has no visual member.");
  return canonicalize({
    source: media.source,
    streamIndex: media.visual.streamIndex,
    presentationStart: media.visual.presentationStart,
    sourceDomain: media.visual.sourceDomain,
    interpretation: media.visual.interpretation,
  }) as unknown as PreparedVisualSource;
}

/** Project only the selected audio signal facts needed by terminal audio programmes. */
export function preparedAudioSource(media: PreparedMedia): PreparedAudioSource {
  verifyPreparedMedia(media);
  assert(media.audio !== undefined, "Prepared Media has no audio member.");
  return canonicalize({
    source: media.source,
    streamIndex: media.audio.streamIndex,
    presentationStart: media.audio.presentationStart,
    sourceDomain: media.audio.sourceDomain,
    interpretation: media.audio.interpretation,
  }) as unknown as PreparedAudioSource;
}
