import {
  addExactTemporalValues,
  assertLocalTemporalDomain,
  compareExactTemporalValues,
  exactTemporalZero,
  sealLocalTemporalDomain,
  sealTemporalMap,
  subtractExactTemporalValues,
} from "@hypit/temporal/algebra";
import type {
  ExactTemporalValue,
  LocalTemporalDomain,
  TemporalMap,
} from "@hypit/temporal/algebra";
import { canonicalize } from "@hypit/protocol";
import type { BlobRef } from "@hypit/protocol";

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
  PreparedPictureMember,
  PreparedPictureSource,
  PreparedSignalPictureSource,
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
    `Prepared Media selected ${kind} stream ${index} has no observed presentation span.`);
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
    : input.inspection.streams.find((candidate): candidate is MediaVideoStream =>
      candidate.kind === "video" && candidate.index === input.selection.videoStreamIndex);
  assert(input.selection.videoStreamIndex === undefined || video !== undefined,
    `Prepared Media selected video stream ${input.selection.videoStreamIndex} does not exist.`);
  const constantPicture = video !== undefined
    && input.source.mediaType.startsWith("image/")
    && video.decodedUnitCount === 1;
  assert(video === undefined || constantPicture
    || video.startPts !== undefined && video.endPts !== undefined,
  `Prepared Media ${input.id} selected a Picture signal without an observed presentation span.`);
  const audio = input.selection.audioStreamIndex === undefined ? undefined
    : selectedStream<MediaAudioStream>(input.inspection, input.selection.audioStreamIndex, "audio");
  const signalVideo = constantPicture ? undefined : video;
  const authority = input.selection.spanAuthority === "video" ? signalVideo
    : input.selection.spanAuthority === "audio" ? audio : undefined;
  const hasSignal = audio !== undefined || signalVideo !== undefined;
  assert(!hasSignal || authority?.startPts !== undefined && authority?.endPts !== undefined,
    `Prepared Media ${input.id} has temporal signals but no valid span authority.`);
  const authorityStart = authority?.startPts === undefined ? undefined : exact(authority.startPts);
  const domain = authorityStart === undefined || authority?.endPts === undefined ? undefined : sealLocalTemporalDomain({
    id: input.id,
    duration: subtractExactTemporalValues(exact(authority.endPts), authorityStart),
  });
  let picture: PreparedPictureMember | undefined;
  if (signalVideo?.startPts !== undefined && signalVideo.endPts !== undefined) {
    assert(domain !== undefined && authorityStart !== undefined, "Prepared moving Picture has no temporal domain.");
    assert(input.selection.picture !== undefined,
      `Prepared Media ${input.id} selected video without an author-resolved picture interpretation.`);
    const sourceDomain = streamDomain(`${input.id}:picture-source`, signalVideo.startPts, signalVideo.endPts);
    const presentationStart = exact(signalVideo.startPts);
    picture = {
      kind: "signal",
      streamIndex: signalVideo.index,
      presentationStart,
      sourceDomain,
      map: memberMap(domain, authorityStart, sourceDomain, presentationStart),
      interpretation: {
        codedWidth: signalVideo.width,
        codedHeight: signalVideo.height,
        sampleAspectRatio: { ...signalVideo.sampleAspectRatio },
        rotationDegrees: signalVideo.rotationDegrees,
        picture: structuredClone(input.selection.picture),
      },
    };
  } else if (constantPicture) {
    assert(video !== undefined, "Prepared constant Picture has no selected stream.");
    assert(input.selection.picture !== undefined,
      `Prepared Media ${input.id} selected a still image without a Picture interpretation.`);
    picture = {
      kind: "constant",
      streamIndex: video.index,
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
    assert(domain !== undefined && authorityStart !== undefined, "Prepared Audio has no temporal domain.");
    const sourceDomain = streamDomain(`${input.id}:audio-source`, audio.startPts, audio.endPts);
    const presentationStart = exact(audio.startPts);
    preparedAudio = {
      streamIndex: audio.index,
      presentationStart,
      sourceDomain,
      map: memberMap(domain, authorityStart, sourceDomain, presentationStart),
    };
  }
  const value = canonicalize({
    id: input.id,
    source: input.source,
    ...(domain === undefined ? {} : { domain }),
    ...(picture === undefined ? {} : { picture }),
    ...(preparedAudio === undefined ? {} : { audio: preparedAudio }),
  }) as unknown as PreparedMedia;
  verifyPreparedMedia(value);
  return value;
}

/** Display geometry after pixel aspect and rotation, without materializing pixels. */
export function preparedPictureExtent(media: PreparedMedia): { readonly widthPx: number; readonly heightPx: number } {
  verifyPreparedMedia(media);
  assert(media.picture !== undefined, "Prepared Media has no Picture member.");
  const value = media.picture.interpretation;
  let width = value.codedWidth * value.sampleAspectRatio.numerator / value.sampleAspectRatio.denominator;
  let height = value.codedHeight;
  if (value.rotationDegrees === 90 || value.rotationDegrees === 270) [width, height] = [height, width];
  assert(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0,
    "Prepared visual display extent is not finite and positive.");
  return { widthPx: width, heightPx: height };
}

export function preparedMediaExtent(media: PreparedMedia): ExactTemporalValue {
  verifyPreparedMedia(media);
  assert(media.domain !== undefined, "Prepared Media has no temporal domain.");
  assertLocalTemporalDomain(media.domain);
  return structuredClone(media.domain.duration);
}

/** Project only the selected visual signal facts needed by terminal visual programmes. */
export function preparedPictureSource(media: PreparedMedia): PreparedPictureSource {
  verifyPreparedMedia(media);
  assert(media.picture !== undefined, "Prepared Media has no Picture member.");
  if (media.picture.kind === "signal") {
    const { map: _map, ...picture } = media.picture;
    return canonicalize({ source: media.source, ...picture }) as unknown as PreparedPictureSource;
  }
  return canonicalize({ source: media.source, ...media.picture }) as unknown as PreparedPictureSource;
}

export function preparedSignalPictureSource(media: PreparedMedia): PreparedSignalPictureSource {
  const source = preparedPictureSource(media);
  assert(source.kind === "signal", "Prepared Media Picture is not a temporal signal.");
  return source;
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
  }) as unknown as PreparedAudioSource;
}
