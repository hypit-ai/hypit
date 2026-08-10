import { artifactTypes } from "@narratage/artifact";
import assert from "node:assert/strict";
import test from "node:test";

import {
  mediaPipelineTypes,
  decodeSynchronizedMediaSurface,
  decodeExtractAudioSurface,
  decodeExtractFrameSurface,
  decodeTransformMediaSurface,
  extractAudioFragment,
  extractFrameFragment,
  synchronizedMediaFragment,
  transformMediaFragment,
} from "../src/index.js";

test("the Normalize Surface makes inspection and normalization an explicit author graph branch", async () => {
  const range = { source: "normalize.svml", start: 0, end: 1 };
  const result = await decodeSynchronizedMediaSurface({
    sourceName: range.source,
    element: {
      kind: "element",
      name: "pipeline:Normalize",
      attributes: {
        id: "motion",
        source: { kind: "reference", path: "generated" },
        video: "primary-moving",
        audio: "none",
        "span-authority": "video",
        "frame-rate": "30000/1001",
      },
      children: [],
      range,
    },
    resolveReference: (path) => path === "generated"
      ? { path, ref: { kind: "record", id: path }, type: artifactTypes.blob }
      : undefined,
    resolveAsset: async () => { throw new Error("no asset resolution expected"); },
  });
  assert.equal(result.fragments[0]?.id, synchronizedMediaFragment.id);
  assert.deepEqual(result.components[0]?.outputs, { media: "motion.media" });
  const request = result.records[0]?.value;
  assert.ok(request?.kind === "inline");
  assert.deepEqual(request.value, {
    contract: "svml.media-selection-request@1",
    video: { mode: "primary-moving" },
    audio: { mode: "none" },
    spanAuthority: "video",
    frameRate: { numerator: 30_000, denominator: 1_001 },
  });
});

test("media operations are ordinary graph branches over BlobArtifact", async () => {
  const range = { source: "operations.svml", start: 0, end: 1 };
  const resolveReference = (path: string) => path === "generated.video"
    ? { path, ref: { kind: "record" as const, id: path }, type: artifactTypes.blob }
    : undefined;
  const context = { sourceName: range.source, resolveReference,
    resolveAsset: async () => { throw new Error("no asset resolution expected"); } };
  const transform = await decodeTransformMediaSurface({
    ...context,
    element: {
      kind: "element", name: "media:Transform", range,
      attributes: {
        id: "prepared", source: { kind: "reference", path: "generated.video" },
        video: "primary-moving", audio: "default", "span-authority": "video", "frame-rate": "30",
      },
      children: [
        { kind: "element", name: "media:Trim", attributes: { tail: "0.25s" }, children: [], range },
        { kind: "element", name: "media:Retime", attributes: { rate: "1.05", pitch: "preserve" }, children: [], range },
      ],
    },
  });
  assert.equal(transform.fragments[0]?.id, transformMediaFragment.id);
  assert.deepEqual(transform.components[0]?.outputs, { video: "prepared.video" });
  const program = transform.records.find((record) => record.id === "prepared.program");
  assert.ok(program?.value.kind === "inline");
  assert.deepEqual(program.value.value, {
    contract: "svml.media-transform-program@1",
    operations: [
      { kind: "trim", tailSec: 0.25 },
      { kind: "retime", rate: 1.05, pitch: "preserve" },
    ],
  });

  const audio = await decodeExtractAudioSurface({
    ...context,
    element: {
      kind: "element", name: "media:ExtractAudio", range,
      attributes: { id: "voice-reference", source: { kind: "reference", path: "generated.video" }, audio: "default" },
      children: [],
    },
  });
  assert.equal(audio.fragments[0]?.id, extractAudioFragment.id);
  assert.deepEqual(audio.components[0]?.outputs, { audio: "voice-reference.audio" });

  const frame = await decodeExtractFrameSurface({
    ...context,
    element: {
      kind: "element", name: "media:ExtractFrame", range,
      attributes: { id: "continuity", source: { kind: "reference", path: "generated.video" },
        video: "primary-moving", at: "last" },
      children: [],
    },
  });
  assert.equal(frame.fragments[0]?.id, extractFrameFragment.id);
  assert.deepEqual(frame.components[0]?.outputs, { image: "continuity.image" });
});
