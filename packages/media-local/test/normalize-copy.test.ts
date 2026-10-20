import assert from "node:assert/strict";
import test from "node:test";
import type { MediaVideoStream } from "@hypit/media";
import { normalizedVideoFrames, normalizedVideoSpan } from "../src/normalize-copy.js";

const video: MediaVideoStream = {
  kind: "video",
  index: 0,
  codecType: "video",
  codecName: "h264",
  role: "moving",
  disposition: { default: true, attachedPicture: false },
  timingStatus: "admissible",
  timeBase: { numerator: 1, denominator: 30 },
  startPts: { ticks: "0", timeBase: { numerator: 1, denominator: 30 } },
  endPts: { ticks: "3", timeBase: { numerator: 1, denominator: 30 } },
  decodedUnitCount: 3,
  width: 1920,
  height: 1080,
  sampleAspectRatio: { numerator: 1, denominator: 1 },
  rotationDegrees: 0,
};
const frames = [0, 1, 2].map((pts) => ({
  pts: String(pts),
  duration: "1",
  width: 1920,
  height: 1080,
  pix_fmt: "yuv420p",
  sample_aspect_ratio: "1:1",
  interlaced_frame: 0,
}));

test("copy eligibility proves every decoded frame on the requested clock", () => {
  const rate = { numerator: 30, denominator: 1 };
  assert.equal(normalizedVideoSpan(video, rate, 3), true);
  assert.equal(normalizedVideoFrames(video, rate, 3, frames), true);
  assert.equal(normalizedVideoFrames(video, rate, 3, frames.map((frame, index) =>
    index === 1 ? { ...frame, pts: "2" } : frame)), false);
  assert.equal(normalizedVideoFrames(video, rate, 3, frames.map((frame, index) =>
    index === 1 ? { ...frame, side_data_list: [{ rotation: 90 }] } : frame)), false);
});

test("copy eligibility is local proof, so uncertain timing falls back instead of broadening Media", () => {
  assert.equal(normalizedVideoSpan({ ...video, timingStatus: "missing" }, { numerator: 30, denominator: 1 }, 3), false);
  assert.equal(normalizedVideoSpan({ ...video, decodedUnitCount: 2 }, { numerator: 30, denominator: 1 }, 3), false);
});
