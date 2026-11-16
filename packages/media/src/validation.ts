import { assertLocalTemporalDomain, assertTemporalMap, compareExactTemporalValues } from "@hypit/temporal/algebra";
import type {
  MediaInspection,
  MediaInterpretation,
  MediaRational,
  MediaStreamSelection,
  MediaTimestamp,
  PictureInterpretation,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown, subject: string): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${subject} must be an object.`);
  return value as Record<string, unknown>;
}

function integer(value: unknown, subject: string, positive = false): number {
  assert(Number.isSafeInteger(value) && (value as number) >= (positive ? 1 : 0), `${subject} is invalid.`);
  return value as number;
}

function verifyRational(value: unknown, subject: string): asserts value is MediaRational {
  const item = object(value, subject);
  integer(item.numerator, `${subject}.numerator`, true);
  integer(item.denominator, `${subject}.denominator`, true);
}

function verifyTimestamp(value: unknown, subject: string): asserts value is MediaTimestamp {
  const item = object(value, subject);
  assert(typeof item.ticks === "string" && /^-?(?:0|[1-9][0-9]*)$/u.test(item.ticks), `${subject}.ticks is invalid.`);
  verifyRational(item.timeBase, `${subject}.timeBase`);
}

export function verifyPictureInterpretation(value: unknown, subject = "PictureInterpretation"): asserts value is PictureInterpretation {
  const picture = object(value, subject) as unknown as PictureInterpretation;
  const image = picture.colorPrimaries === "bt709" && picture.colorTransfer === "srgb"
    && picture.colorMatrix === "rgb" && picture.colorRange === "full" && picture.bitDepth === 8;
  const video = picture.colorPrimaries === "bt709" && picture.colorTransfer === "bt709"
    && picture.colorMatrix === "bt709" && picture.colorRange === "limited" && picture.bitDepth === 8;
  assert(image || video, `${subject} is not an implemented SDR picture interpretation.`);
  assert(picture.alphaMode === "opaque" || picture.alphaMode === "straight", `${subject}.alphaMode is unsupported.`);
}

export function verifyMediaInspection(value: unknown): asserts value is MediaInspection {
  const inspection = object(value, "MediaInspection");
  assert(Array.isArray(inspection.streams), "MediaInspection.streams must be an array.");
  const indexes = new Set<number>();
  for (const [position, raw] of inspection.streams.entries()) {
    const subject = `MediaInspection.streams[${position}]`;
    const stream = object(raw, subject);
    const index = integer(stream.index, `${subject}.index`);
    assert(!indexes.has(index), `MediaInspection repeats stream ${index}.`);
    indexes.add(index);
    assert(typeof stream.codecName === "string" && stream.codecName.length > 0, `${subject}.codecName is invalid.`);
    const disposition = object(stream.disposition, `${subject}.disposition`);
    assert(typeof disposition.default === "boolean" && typeof disposition.attachedPicture === "boolean",
      `${subject}.disposition is invalid.`);
    if (stream.startPts !== undefined || stream.endPts !== undefined) {
      assert(stream.startPts !== undefined && stream.endPts !== undefined, `${subject} presentation span is incomplete.`);
      verifyTimestamp(stream.startPts, `${subject}.startPts`);
      verifyTimestamp(stream.endPts, `${subject}.endPts`);
    }
    if (stream.kind === "picture") {
      integer(stream.decodedUnitCount, `${subject}.decodedUnitCount`);
      integer(stream.width, `${subject}.width`, true);
      integer(stream.height, `${subject}.height`, true);
      verifyRational(stream.sampleAspectRatio, `${subject}.sampleAspectRatio`);
      assert(stream.rotationDegrees === 0 || stream.rotationDegrees === 90
        || stream.rotationDegrees === 180 || stream.rotationDegrees === 270,
      `${subject}.rotationDegrees is invalid.`);
      object(stream.picture, `${subject}.picture`);
    } else if (stream.kind === "audio") {
      integer(stream.sampleRate, `${subject}.sampleRate`, true);
      integer(stream.channels, `${subject}.channels`, true);
      integer(stream.decodedSampleFrames, `${subject}.decodedSampleFrames`);
    } else {
      assert(stream.kind === "other" && typeof stream.codecType === "string", `${subject}.kind is invalid.`);
    }
  }
}

export function verifyMediaStreamSelection(value: unknown): asserts value is MediaStreamSelection {
  const item = object(value, "MediaStreamSelection") as MediaStreamSelection;
  if (item.pictureStreamIndex !== undefined) integer(item.pictureStreamIndex, "MediaStreamSelection.pictureStreamIndex");
  if (item.audioStreamIndex !== undefined) integer(item.audioStreamIndex, "MediaStreamSelection.audioStreamIndex");
  if (item.domainAuthority !== undefined) {
    assert(item.domainAuthority === "picture" || item.domainAuthority === "audio", "MediaStreamSelection.domainAuthority is invalid.");
  }
  if (item.pictureInterpretation !== undefined) verifyPictureInterpretation(item.pictureInterpretation);
}

export function verifyMediaInterpretation(value: unknown): asserts value is MediaInterpretation {
  const item = object(value, "MediaInterpretation") as MediaInterpretation;
  if (item.domain !== undefined) assertLocalTemporalDomain(item.domain);
  assert(item.picture !== undefined || item.audio !== undefined, "MediaInterpretation must contain picture or audio.");
  if (item.picture !== undefined) {
    const picture = item.picture;
    integer(picture.streamIndex, "MediaInterpretation.picture.streamIndex");
    const interpreted = picture.interpretation;
    integer(interpreted.codedWidth, "MediaInterpretation.picture.codedWidth", true);
    integer(interpreted.codedHeight, "MediaInterpretation.picture.codedHeight", true);
    verifyRational(interpreted.sampleAspectRatio, "MediaInterpretation.picture.sampleAspectRatio");
    verifyPictureInterpretation(interpreted.picture, "MediaInterpretation.picture.picture");
    if (picture.kind === "signal") {
      assert(item.domain !== undefined, "Signal picture requires a media domain.");
      assertLocalTemporalDomain(picture.sourceDomain);
      assertTemporalMap(picture.map);
      assert(picture.map.stages[0]?.target.id === item.domain.id, "Picture map must begin at the media domain.");
    } else assert(picture.kind === "constant", "MediaInterpretation.picture.kind is invalid.");
  }
  if (item.audio !== undefined) {
    assert(item.domain !== undefined, "Audio requires a media domain.");
    integer(item.audio.streamIndex, "MediaInterpretation.audio.streamIndex");
    assertLocalTemporalDomain(item.audio.sourceDomain);
    assertTemporalMap(item.audio.map);
    assert(item.audio.map.stages[0]?.target.id === item.domain.id, "Audio map must begin at the media domain.");
  }
  if (item.domain !== undefined) {
    assert(compareExactTemporalValues(item.domain.duration, { ticks: "0", timeBase: { numerator: 1, denominator: 1 } }) > 0,
      "MediaInterpretation.domain must be positive.");
  }
}
