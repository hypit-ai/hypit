import {
  addExactTemporalValues,
  compareExactTemporalValues,
  exactTemporalZero,
  sealLocalTemporalDomain,
  sealTemporalMap,
  subtractExactTemporalValues,
} from "@hypit/temporal/algebra";
import type { ExactTemporalValue, LocalTemporalDomain, TemporalMap } from "@hypit/temporal/algebra";
import { verifyMediaInspection, verifyMediaInterpretation, verifyMediaStreamSelection } from "./validation.js";
import type {
  AudioMember,
  MediaAudioStream,
  MediaInspection,
  MediaInterpretation,
  MediaPictureStream,
  MediaStreamSelection,
  MediaTimestamp,
  ResolvedMedia,
  MediaResource,
  SignalPictureMember,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function exact(value: MediaTimestamp): ExactTemporalValue {
  return { ticks: value.ticks, timeBase: structuredClone(value.timeBase) };
}

function streamDomain(id: string, start: MediaTimestamp, end: MediaTimestamp): LocalTemporalDomain {
  return sealLocalTemporalDomain({ id, duration: subtractExactTemporalValues(exact(end), exact(start)) });
}

function memberMap(
  media: LocalTemporalDomain,
  authorityStart: ExactTemporalValue,
  source: LocalTemporalDomain,
  sourceStart: ExactTemporalValue,
): TemporalMap {
  const zero = exactTemporalZero();
  const startOnMedia = subtractExactTemporalValues(sourceStart, authorityStart);
  const endOnMedia = subtractExactTemporalValues(addExactTemporalValues(sourceStart, source.duration), authorityStart);
  const targetStart = compareExactTemporalValues(startOnMedia, zero) < 0 ? zero : startOnMedia;
  const targetEnd = compareExactTemporalValues(endOnMedia, media.duration) > 0 ? media.duration : endOnMedia;
  assert(compareExactTemporalValues(targetStart, targetEnd) < 0,
    `Media member ${source.id} does not overlap media domain ${media.id}.`);
  return sealTemporalMap({ stages: [{
    target: media,
    source,
    pieces: [{
      target: { start: targetStart, end: targetEnd },
      sourceAtStart: subtractExactTemporalValues(addExactTemporalValues(authorityStart, targetStart), sourceStart),
      rate: { numerator: 1, denominator: 1 },
    }],
  }] });
}

export function interpretMedia(input: {
  readonly mediaType: string;
  readonly inspection: MediaInspection;
  readonly selection: MediaStreamSelection;
}): MediaInterpretation {
  verifyMediaInspection(input.inspection);
  verifyMediaStreamSelection(input.selection);
  const picture = input.selection.pictureStreamIndex === undefined ? undefined
    : input.inspection.streams.find((stream): stream is MediaPictureStream =>
      stream.kind === "picture" && stream.index === input.selection.pictureStreamIndex);
  assert(input.selection.pictureStreamIndex === undefined || picture !== undefined,
    `Selected picture stream ${input.selection.pictureStreamIndex} does not exist.`);
  const constantPicture = picture !== undefined && input.mediaType.startsWith("image/")
    && picture.decodedUnitCount === 1;
  const signalPicture = constantPicture ? undefined : picture;
  if (signalPicture !== undefined) {
    assert(signalPicture.startPts !== undefined && signalPicture.endPts !== undefined,
      `Selected picture stream ${signalPicture.index} has no presentation interval.`);
  }
  const audio = input.selection.audioStreamIndex === undefined ? undefined
    : input.inspection.streams.find((stream): stream is MediaAudioStream =>
      stream.kind === "audio" && stream.index === input.selection.audioStreamIndex);
  assert(input.selection.audioStreamIndex === undefined || audio?.startPts !== undefined && audio.endPts !== undefined,
    `Selected audio stream ${input.selection.audioStreamIndex} has no presentation interval.`);
  const authority = input.selection.domainAuthority === "picture" ? signalPicture
    : input.selection.domainAuthority === "audio" ? audio : undefined;
  const hasSignal = signalPicture !== undefined || audio !== undefined;
  assert(!hasSignal || authority?.startPts !== undefined && authority.endPts !== undefined,
    "Temporal media requires an explicit valid domain authority.");
  const authorityStart = authority?.startPts === undefined ? undefined : exact(authority.startPts);
  const domain = authorityStart === undefined || authority?.endPts === undefined ? undefined
    : sealLocalTemporalDomain({ id: "media", duration: subtractExactTemporalValues(exact(authority.endPts), authorityStart) });

  let interpretedPicture: MediaInterpretation["picture"];
  if (constantPicture) {
    assert(picture !== undefined && input.selection.pictureInterpretation !== undefined,
      "Constant picture requires a complete interpretation.");
    interpretedPicture = {
      kind: "constant",
      streamIndex: picture.index,
      interpretation: {
        codedWidth: picture.width,
        codedHeight: picture.height,
        sampleAspectRatio: structuredClone(picture.sampleAspectRatio),
        rotationDegrees: picture.rotationDegrees,
        picture: structuredClone(input.selection.pictureInterpretation),
      },
    };
  } else if (signalPicture?.startPts !== undefined && signalPicture.endPts !== undefined) {
    assert(domain !== undefined && authorityStart !== undefined && input.selection.pictureInterpretation !== undefined,
      "Signal picture requires media domain and interpretation.");
    const sourceDomain = streamDomain("media:picture-source", signalPicture.startPts, signalPicture.endPts);
    const presentationStart = exact(signalPicture.startPts);
    interpretedPicture = {
      kind: "signal",
      streamIndex: signalPicture.index,
      presentationStart,
      sourceDomain,
      map: memberMap(domain, authorityStart, sourceDomain, presentationStart),
      interpretation: {
        codedWidth: signalPicture.width,
        codedHeight: signalPicture.height,
        sampleAspectRatio: structuredClone(signalPicture.sampleAspectRatio),
        rotationDegrees: signalPicture.rotationDegrees,
        picture: structuredClone(input.selection.pictureInterpretation),
      },
    } satisfies SignalPictureMember;
  }

  let interpretedAudio: AudioMember | undefined;
  if (audio?.startPts !== undefined && audio.endPts !== undefined) {
    assert(domain !== undefined && authorityStart !== undefined, "Audio requires a media domain.");
    const sourceDomain = streamDomain("media:audio-source", audio.startPts, audio.endPts);
    const presentationStart = exact(audio.startPts);
    interpretedAudio = {
      streamIndex: audio.index,
      presentationStart,
      sourceDomain,
      map: memberMap(domain, authorityStart, sourceDomain, presentationStart),
    };
  }
  const value: MediaInterpretation = {
    ...(domain === undefined ? {} : { domain }),
    ...(interpretedPicture === undefined ? {} : { picture: interpretedPicture }),
    ...(interpretedAudio === undefined ? {} : { audio: interpretedAudio }),
  };
  verifyMediaInterpretation(value);
  return structuredClone(value);
}

export function resolveMedia(resource: MediaResource, interpretation: MediaInterpretation): ResolvedMedia {
  assert(typeof resource.address === "string" && resource.address.length > 0, "Media resource address is empty.");
  assert(typeof resource.mediaType === "string" && resource.mediaType.length > 0, "Media resource type is empty.");
  if (resource.size !== undefined) assert(Number.isSafeInteger(resource.size) && resource.size >= 0, "Media resource size is invalid.");
  verifyMediaInterpretation(interpretation);
  return { resource: structuredClone(resource), interpretation: structuredClone(interpretation) };
}

export function mediaPictureExtent(picture: NonNullable<MediaInterpretation["picture"]>): {
  readonly widthPx: number;
  readonly heightPx: number;
} {
  let width = picture.interpretation.codedWidth
    * picture.interpretation.sampleAspectRatio.numerator / picture.interpretation.sampleAspectRatio.denominator;
  let height = picture.interpretation.codedHeight;
  if (picture.interpretation.rotationDegrees === 90 || picture.interpretation.rotationDegrees === 270) {
    [width, height] = [height, width];
  }
  assert(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0,
    "Media picture extent is not finite and positive.");
  return { widthPx: width, heightPx: height };
}
