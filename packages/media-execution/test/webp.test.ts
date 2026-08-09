import assert from "node:assert/strict";
import test from "node:test";

import {
  compositeAnimatedWebpFrame,
  createAnimatedWebpCanvas,
} from "../src/webp.js";
import type { AnimatedWebp, AnimatedWebpFrame } from "../src/webp.js";

function animation(frame: AnimatedWebpFrame): AnimatedWebp {
  return {
    width: 3,
    height: 1,
    background: [10, 20, 30, 255],
    loopCount: 0,
    frames: [frame],
  };
}

test("animated WebP composition honors no-blend and dispose-to-background independently", () => {
  const frame: AnimatedWebpFrame = {
    x: 1,
    y: 0,
    width: 1,
    height: 1,
    durationMs: 100,
    disposeToBackground: true,
    blend: false,
    image: new Uint8Array(),
  };
  const source = animation(frame);
  const canvas = createAnimatedWebpCanvas(source);
  const snapshot = compositeAnimatedWebpFrame(canvas, source, frame, new Uint8Array([200, 100, 50, 128]));
  assert.deepEqual([...snapshot], [10, 20, 30, 255, 200, 100, 50, 128, 10, 20, 30, 255]);
  assert.deepEqual([...canvas], [10, 20, 30, 255, 10, 20, 30, 255, 10, 20, 30, 255]);
});

test("animated WebP alpha blending uses the existing straight-alpha canvas", () => {
  const frame: AnimatedWebpFrame = {
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    durationMs: 100,
    disposeToBackground: false,
    blend: true,
    image: new Uint8Array(),
  };
  const source = animation(frame);
  const canvas = createAnimatedWebpCanvas(source);
  const snapshot = compositeAnimatedWebpFrame(canvas, source, frame, new Uint8Array([210, 120, 70, 128]));
  assert.deepEqual([...snapshot.slice(0, 4)], [110, 70, 50, 255]);
});
