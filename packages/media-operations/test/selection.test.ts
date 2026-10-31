import { sealMediaInspection, verifyMediaStreamSelection } from "@hypit/media";
import type { MediaInspection, MediaVideoStream } from "@hypit/media";
import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";


import {
  sealMediaSelectionRequest,
  selectMediaStreams,
} from "../src/index.js";

const source = {
  kind: "blob" as const,
  resource: fixtureResource("grok-container"),
  size: 123,
  mediaType: "video/mp4",
};
const timeBase = { numerator: 1, denominator: 12_288 } as const;
const timestamp = (ticks: string) => ({ ticks, timeBase });

function grokInspection(): MediaInspection {
  return sealMediaInspection({
    streams: [
      {
        kind: "video",
        index: 0,
        codecName: "h264",
        disposition: { default: true, attachedPicture: false },
        startPts: timestamp("0"),
        endPts: timestamp("74240"),
        decodedUnitCount: 145,
        width: 464,
        height: 688,
        sampleAspectRatio: { numerator: 1, denominator: 1 },
        rotationDegrees: 0, picture: { colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709", colorRange: "limited", bitDepth: 8, alphaMode: "opaque" } as const,
        averageFrameRate: { numerator: 24, denominator: 1 },
      },
      {
        kind: "audio",
        index: 1,
        codecName: "aac",
        disposition: { default: true, attachedPicture: false },
        startPts: { ticks: "0", timeBase: { numerator: 1, denominator: 48_000 } },
        endPts: { ticks: "288000", timeBase: { numerator: 1, denominator: 48_000 } },
        sampleRate: 48_000,
        channels: 2,
        decodedSampleFrames: 289_792,
      },
      {
        kind: "video",
        index: 2,
        codecName: "mjpeg",
        disposition: { default: false, attachedPicture: true },
        startPts: { ticks: "0", timeBase: { numerator: 1, denominator: 90_000 } },
        endPts: { ticks: "543750", timeBase: { numerator: 1, denominator: 90_000 } },
        decodedUnitCount: 1,
        width: 464,
        height: 688,
        sampleAspectRatio: { numerator: 1, denominator: 1 },
        rotationDegrees: 0, picture: { colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709", colorRange: "limited", bitDepth: 8, alphaMode: "opaque" } as const,
      },
    ],
  });
}

test("primary stream selection excludes Grok's MJPEG attached picture and observes AAC without speech semantics", () => {
  const inspection = grokInspection();
  const request = sealMediaSelectionRequest({
    video: { mode: "primary-moving" },
    audio: { mode: "default" },
    spanAuthority: "video",
    picture: { mode: "source" },
  });
  const selection = selectMediaStreams(inspection, request);
  verifyMediaStreamSelection(selection);
  assert.equal(selection.videoStreamIndex, 0);
  assert.equal(selection.audioStreamIndex, 1);
  assert.equal(selection.spanAuthority, "video");
});

test("multiple moving streams without one default fail closed instead of guessing by index or size", () => {
  const inspection = grokInspection();
  const primary = inspection.streams.find((stream): stream is MediaVideoStream => stream.kind === "video" && stream.index === 0)!;
  const ambiguous = sealMediaInspection({
    ...inspection,
    streams: [
      { ...primary, disposition: { default: false, attachedPicture: false } },
      { ...primary, index: 3, width: 1920, height: 1080, disposition: { default: false, attachedPicture: false } },
    ],
  });
  const request = sealMediaSelectionRequest({
    video: { mode: "primary-moving" },
    audio: { mode: "none" },
    spanAuthority: "video",
    picture: { mode: "source" },
  });
  assert.throws(() => selectMediaStreams(ambiguous, request), /ambiguous/u);
  const explicit = sealMediaSelectionRequest({
    video: { mode: "stream-index", streamIndex: 3 },
    audio: { mode: "none" },
    spanAuthority: "video",
    picture: { mode: "source" },
  });
  assert.equal(selectMediaStreams(ambiguous, explicit).videoStreamIndex, 3);
});

test("an attached picture cannot be forced into the moving-video preparation path", () => {
  const request = sealMediaSelectionRequest({
    video: { mode: "stream-index", streamIndex: 2 },
    audio: { mode: "none" },
    spanAuthority: "video",
    picture: { mode: "source" },
  });
  assert.throws(() => selectMediaStreams(grokInspection(), request), /not a moving visual stream/u);
});

test("a stream without an observed presentation span cannot be selected for exact preparation", () => {
  const inspection = grokInspection();
  const missing = sealMediaInspection({
    ...inspection,
    streams: inspection.streams.map((stream) => {
      if (stream.kind !== "video" || stream.index !== 0) return stream;
      const { startPts: _startPts, endPts: _endPts, ...withoutSpan } = stream;
      return withoutSpan;
    }),
  });
  const request = sealMediaSelectionRequest({
    video: { mode: "stream-index", streamIndex: 0 },
    audio: { mode: "none" },
    spanAuthority: "video",
    picture: { mode: "source" },
  });
  assert.throws(() => selectMediaStreams(missing, request), /has no presentation interval/u);
});

test("incomplete source picture facts require an explicit author interpretation", () => {
  const inspection = grokInspection();
  const primary = inspection.streams.find((stream): stream is MediaVideoStream => stream.kind === "video" && stream.index === 0)!;
  const incomplete = sealMediaInspection({
    ...inspection,
    streams: inspection.streams.map((stream) => stream === primary
      ? { ...primary, picture: { colorPrimaries: "bt709", bitDepth: 8, alphaMode: "opaque" } }
      : stream),
  });
  const common = {
    video: { mode: "primary-moving" as const },
    audio: { mode: "none" as const },
    spanAuthority: "video" as const,
  };
  assert.throws(() => selectMediaStreams(incomplete, sealMediaSelectionRequest({
    ...common,
    picture: { mode: "source" },
  })), /choose an explicit picture profile/u);

  const interpretation = {
    colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
    colorRange: "limited", bitDepth: 8, alphaMode: "opaque",
  } as const;
  const selected = selectMediaStreams(incomplete, sealMediaSelectionRequest({
    ...common,
    picture: { mode: "explicit", interpretation },
  }));
  assert.deepEqual(selected.picture, interpretation);
});
