import assert from "node:assert/strict";
import test from "node:test";

import type { MediaInspection } from "@hypit/media";

import {
  localMediaImportSelection,
  mediaAssetIdFromFile,
  mediaTypeFromFile,
} from "../src/asset-import.js";

const timestamp = (ticks: string) => ({ ticks, timeBase: { numerator: 1, denominator: 1 } });

function movingInspection(): MediaInspection {
  return { streams: [{
    kind: "video", index: 2, codecName: "h264",
    disposition: { default: true, attachedPicture: false },
    startPts: timestamp("0"), endPts: timestamp("5"), decodedUnitCount: 125,
    width: 1920, height: 1080, sampleAspectRatio: { numerator: 1, denominator: 1 }, rotationDegrees: 0,
    picture: {},
  }, {
    kind: "audio", index: 4, codecName: "aac",
    disposition: { default: true, attachedPicture: false },
    startPts: timestamp("0"), endPts: timestamp("5"), sampleRate: 48_000,
    channels: 2, decodedSampleFrames: 240_000,
  }] };
}

test("local import policy resolves ordinary video without moving guesses into Media Asset Core", () => {
  const selection = localMediaImportSelection(movingInspection(), "video/mp4");
  assert.deepEqual(selection.video, { mode: "primary-moving" });
  assert.deepEqual(selection.audio, { mode: "default-if-present" });
  assert.equal(selection.spanAuthority, "video");
  assert.equal(selection.picture.mode, "explicit");
  if (selection.picture.mode === "explicit") assert.equal(selection.picture.interpretation.colorTransfer, "bt709");

  const explicit = localMediaImportSelection(movingInspection(), "video/mp4", {
    videoStream: 2, audioStream: false, picture: "sdr-bt709",
  });
  assert.deepEqual(explicit.video, { mode: "stream-index", streamIndex: 2 });
  assert.deepEqual(explicit.audio, { mode: "none" });
});

test("still and audio-only imports establish their own natural authority", () => {
  const still = localMediaImportSelection({ streams: [{
    kind: "video", index: 0, codecName: "png",
    disposition: { default: true, attachedPicture: false }, decodedUnitCount: 1,
    width: 20, height: 10, sampleAspectRatio: { numerator: 1, denominator: 1 }, rotationDegrees: 0,
    picture: {},
  }] }, "image/png");
  assert.deepEqual(still.video, { mode: "primary-picture" });
  assert.equal(still.spanAuthority, undefined);
  assert.equal(still.picture.mode, "explicit");
  if (still.picture.mode === "explicit") assert.equal(still.picture.interpretation.colorTransfer, "srgb");

  const audio = localMediaImportSelection({ streams: [movingInspection().streams[1]!] }, "audio/mp4");
  assert.deepEqual(audio.video, { mode: "none" });
  assert.equal(audio.spanAuthority, "audio");
});

test("file names provide explicit, inspectable defaults without hashes", () => {
  assert.equal(mediaTypeFromFile("camera.MOV"), "video/quicktime");
  assert.equal(mediaAssetIdFromFile("/incoming/采访 01.mp4"), "media-01");
  assert.throws(() => mediaTypeFromFile("unknown.bin"), /provide mediaType/u);
});
