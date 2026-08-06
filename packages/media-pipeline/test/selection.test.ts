import assert from "node:assert/strict";
import test from "node:test";

import {
  sealMediaInspection,
  verifyMediaStreamSelection,
} from "@svml/contracts";
import type { MediaInspection, MediaVideoStream } from "@svml/contracts";
import { digestOf } from "@svml/protocol";

import {
  sealMediaSelectionRequest,
  selectMediaStreams,
} from "../src/index.js";

const source = {
  kind: "blob" as const,
  digest: digestOf("grok-container"),
  size: 123,
  mediaType: "video/mp4",
};
const timeBase = { numerator: 1, denominator: 12_288 } as const;
const timestamp = (ticks: string) => ({ ticks, timeBase });

function grokInspection(): MediaInspection {
  return sealMediaInspection({
    contract: "svml.media-inspection@1",
    source,
    container: { formatNames: ["mov", "mp4"] },
    streams: [
      {
        kind: "video",
        index: 0,
        codecType: "video",
        codecName: "h264",
        disposition: { default: true, attachedPicture: false },
        timingStatus: "admissible",
        timeBase,
        startPts: timestamp("0"),
        endPts: timestamp("74240"),
        decodedUnitCount: 145,
        role: "moving",
        width: 464,
        height: 688,
        averageFrameRate: { numerator: 24, denominator: 1 },
        nominalFrameRate: { numerator: 24, denominator: 1 },
      },
      {
        kind: "audio",
        index: 1,
        codecType: "audio",
        codecName: "aac",
        disposition: { default: true, attachedPicture: false },
        timingStatus: "admissible",
        timeBase: { numerator: 1, denominator: 48_000 },
        startPts: { ticks: "0", timeBase: { numerator: 1, denominator: 48_000 } },
        endPts: { ticks: "288000", timeBase: { numerator: 1, denominator: 48_000 } },
        decodedUnitCount: 283,
        sampleRate: 48_000,
        channels: 2,
        channelLayout: "stereo",
        decodedSampleFrames: 289_792,
      },
      {
        kind: "video",
        index: 2,
        codecType: "video",
        codecName: "mjpeg",
        disposition: { default: false, attachedPicture: true },
        timingStatus: "admissible",
        timeBase: { numerator: 1, denominator: 90_000 },
        startPts: { ticks: "0", timeBase: { numerator: 1, denominator: 90_000 } },
        endPts: { ticks: "543750", timeBase: { numerator: 1, denominator: 90_000 } },
        decodedUnitCount: 1,
        role: "attached-picture",
        width: 464,
        height: 688,
      },
    ],
    probe: { algorithm: "ffprobe-decoded-units-json@1", implementation: "ffprobe fixture" },
  });
}

test("primary stream selection excludes Grok's MJPEG attached picture and observes AAC without speech semantics", () => {
  const inspection = grokInspection();
  const request = sealMediaSelectionRequest({
    contract: "svml.media-selection-request@1",
    video: { mode: "primary-moving" },
    audio: { mode: "default" },
    spanAuthority: "video",
    frameRate: { numerator: 30, denominator: 1 },
  });
  const selection = selectMediaStreams(inspection, request);
  verifyMediaStreamSelection(selection);
  assert.equal(selection.videoStreamIndex, 0);
  assert.equal(selection.audioStreamIndex, 1);
  assert.equal(selection.spanAuthority, "video");
  assert.equal("basisDigest" in selection, false);
  assert.equal("narrativeDigest" in selection, false);
});

test("multiple moving streams without one default fail closed instead of guessing by index or size", () => {
  const inspection = grokInspection();
  const primary = inspection.streams.find((stream): stream is MediaVideoStream => stream.kind === "video" && stream.index === 0)!;
  const { inspectionDigest: _inspectionDigest, ...inspectionContent } = inspection;
  const ambiguous = sealMediaInspection({
    ...inspectionContent,
    streams: [
      { ...primary, disposition: { default: false, attachedPicture: false } },
      { ...primary, index: 3, width: 1920, height: 1080, disposition: { default: false, attachedPicture: false } },
    ],
  });
  const request = sealMediaSelectionRequest({
    contract: "svml.media-selection-request@1",
    video: { mode: "primary-moving" },
    audio: { mode: "none" },
    spanAuthority: "video",
    frameRate: { numerator: 30, denominator: 1 },
  });
  assert.throws(() => selectMediaStreams(ambiguous, request), /ambiguous/u);
  const explicit = sealMediaSelectionRequest({
    contract: "svml.media-selection-request@1",
    video: { mode: "stream-index", streamIndex: 3 },
    audio: { mode: "none" },
    spanAuthority: "video",
    frameRate: { numerator: 30, denominator: 1 },
  });
  assert.equal(selectMediaStreams(ambiguous, explicit).videoStreamIndex, 3);
});

test("an attached picture cannot be forced into the moving-video normalization path", () => {
  const request = sealMediaSelectionRequest({
    contract: "svml.media-selection-request@1",
    video: { mode: "stream-index", streamIndex: 2 },
    audio: { mode: "none" },
    spanAuthority: "video",
    frameRate: { numerator: 30, denominator: 1 },
  });
  assert.throws(() => selectMediaStreams(grokInspection(), request), /not a moving visual stream/u);
});
