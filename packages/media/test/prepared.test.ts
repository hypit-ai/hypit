import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";

import {
  prepareMedia,
  preparedAudioSource,
  preparedVisualExtent,
  preparedVisualSource,
  verifyPreparedAudioSource,
  verifyPreparedMedia,
  verifyPreparedVisualSource,
} from "../src/index.js";
import type { MediaInspection, MediaVideoStream } from "../src/index.js";

const VIDEO_PICTURE = { colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
  colorRange: "limited", bitDepth: 8, alphaMode: "opaque" } as const;
const timestamp = (ticks: string) => ({ ticks, timeBase: { numerator: 1, denominator: 1_000 } });
const inspection: MediaInspection = {
  streams: [{
    kind: "video", index: 0, codecName: "h264",
    disposition: { default: true, attachedPicture: false },
    startPts: timestamp("100"), endPts: timestamp("10100"),
    decodedUnitCount: 240, width: 720, height: 576,
    sampleAspectRatio: { numerator: 16, denominator: 15 }, rotationDegrees: 90, picture: { colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709", colorRange: "limited", bitDepth: 8, alphaMode: "opaque" } as const,
  }, {
    kind: "audio", index: 1, codecName: "aac",
    disposition: { default: true, attachedPicture: false },
    startPts: timestamp("350"), endPts: timestamp("9850"),
    decodedSampleFrames: 456_000,
    sampleRate: 48_000, channels: 2,
  }],
};

test("PreparedMedia preserves source identity, exact member offsets and display interpretation without materialization", () => {
  const source = { kind: "blob" as const, resource: fixtureResource("prepared-source"), size: 1_024, mediaType: "video/mp4" };
  const media = prepareMedia({
    id: "shot",
    source,
    inspection,
    selection: { videoStreamIndex: 0, audioStreamIndex: 1, spanAuthority: "video", picture: VIDEO_PICTURE },
  });
  verifyPreparedMedia(media);
  assert.deepEqual(media.source, source);
  assert.deepEqual(media.domain.duration, { ticks: "10", timeBase: { numerator: 1, denominator: 1 } });
  assert.deepEqual(media.audio?.map.stages[0]?.pieces[0], {
    target: {
      start: { ticks: "1", timeBase: { numerator: 1, denominator: 4 } },
      end: { ticks: "39", timeBase: { numerator: 1, denominator: 4 } },
    },
    sourceAtStart: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } },
    rate: { numerator: 1, denominator: 1 },
  });
  assert.deepEqual(preparedVisualExtent(media), { widthPx: 576, heightPx: 768 });
});

test("PreparedMedia rejects a stream without an observed presentation span", () => {
  const missing: MediaInspection = {
    ...inspection,
    streams: inspection.streams.map((stream) => {
      if (stream.kind !== "video") return stream;
      const { startPts: _startPts, endPts: _endPts, ...withoutSpan } = stream;
      return withoutSpan;
    }),
  };
  assert.throws(() => prepareMedia({
    id: "missing-span-shot",
    source: { kind: "blob", resource: fixtureResource("prepared-missing-span"), size: 128, mediaType: "video/mp4" },
    inspection: missing,
    selection: { videoStreamIndex: 0, spanAuthority: "video", picture: VIDEO_PICTURE },
  }), /has no observed presentation span/u);
});

test("square-pixel display extent preserves actual dimensions instead of reducing an aspect ratio", () => {
  const squareInspection: MediaInspection = {
    streams: [{
      ...(inspection.streams[0]! as MediaVideoStream), width: 64, height: 64,
      sampleAspectRatio: { numerator: 1, denominator: 1 }, rotationDegrees: 0,
    }],
  };
  const media = prepareMedia({
    id: "square",
    source: { kind: "blob", resource: fixtureResource("prepared-square"), size: 128, mediaType: "video/mp4" },
    inspection: squareInspection,
    selection: { videoStreamIndex: 0, spanAuthority: "video", picture: VIDEO_PICTURE },
  });
  assert.deepEqual(preparedVisualExtent(media), { widthPx: 64, heightPx: 64 });
});

test("signal projections retain source selection without choosing an execution format", () => {
  const media = prepareMedia({
    id: "shot",
    source: { kind: "blob", resource: fixtureResource("prepared-projection"), size: 1_024, mediaType: "video/mp4" },
    inspection,
    selection: { videoStreamIndex: 0, audioStreamIndex: 1, spanAuthority: "video", picture: VIDEO_PICTURE },
  });
  const visual = preparedVisualSource(media);
  const audio = preparedAudioSource(media);
  verifyPreparedVisualSource(visual);
  verifyPreparedAudioSource(audio);
  assert.equal(visual.streamIndex, 0);
  assert.equal(audio.streamIndex, 1);
  assert.deepEqual(visual.sourceDomain, media.visual?.sourceDomain);
  assert.deepEqual(audio.sourceDomain, media.audio?.sourceDomain);
  assert.equal("artifact" in visual, false);
  assert.equal("artifact" in audio, false);
});
