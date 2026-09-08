import { artifactTypes } from "@hypit/artifact";
import { mediaTypes } from "@hypit/media";
import { programSpaceTypes } from "@hypit/program-space";
import { speechTypes } from "@hypit/speech";
import { svsRecipeType } from "@hypit/svs";
import { installRunFragmentHostFacets, RunFragmentRegistry } from "@hypit/run";
import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";

import {
  mediaPipelineTypes,
  decodeSynchronizedMediaSurface,
  decodeExtractAudioSurface,
  decodeExtractFrameSurface,
  decodeTransformMediaSurface,
  decodeStillVideoSurface,
  createStillVideoFragment,
  planStillVideoSegments,
  bindStillVideoSource,
  extractAudioFragment,
  extractFrameFragment,
  synchronizedMediaFragment,
  transformMediaFragment,
  stillVideoFragment,
} from "../src/index.js";
import { hypitPackage } from "../src/activation.js";

test("the package exposes StillVideo as an ordinary Run Fragment", () => {
  const fragments = new RunFragmentRegistry();
  installRunFragmentHostFacets(hypitPackage.hostFacets, fragments);
  assert.equal(fragments.resolve("@hypit/media-pipeline@1", "still-video"), stillVideoFragment);
});

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
        clock: { kind: "reference", path: "clock" },
        recipe: { kind: "reference", path: "policy" },
      },
      children: [],
      range,
    },
    resolveReference: (path) => path === "generated"
      ? { path, ref: { kind: "record", id: path }, type: artifactTypes.blob }
      : path === "clock"
        ? { path, ref: { kind: "record", id: path }, type: programSpaceTypes.clock,
          record: { value: { kind: "inline", value: { frameRate: { numerator: 30_000, denominator: 1_001 } } } } as never }
        : path === "policy"
          ? { path, ref: { kind: "record", id: path }, type: svsRecipeType,
            record: { value: { kind: "inline", value: { path, properties: { video: "primary-moving", audio: "none", "span-authority": "video" } } } } as never }
          : undefined,
    resolveAsset: async () => { throw new Error("no asset resolution expected"); },
  });
  assert.equal(result.fragments[0]?.id, synchronizedMediaFragment.id);
  assert.deepEqual(result.components[0]?.outputs, { media: "motion.media" });
  const request = result.records[0]?.value;
  assert.ok(request?.kind === "inline");
  assert.deepEqual(request.value, {
    video: { mode: "primary-moving" },
    audio: { mode: "none" },
    spanAuthority: "video",
    frameRate: { numerator: 30_000, denominator: 1_001 },
  });
});

test("media operations are ordinary graph branches over BlobArtifact", async () => {
  const range = { source: "operations.svml", start: 0, end: 1 };
  const resolveReference = (path: string) => path === "generated.media"
    ? { path, ref: { kind: "record" as const, id: path }, type: mediaTypes.synchronized }
    : path === "generated.video"
      ? { path, ref: { kind: "record" as const, id: path }, type: artifactTypes.blob }
      : undefined;
  const context = { sourceName: range.source, resolveReference,
    resolveAsset: async () => { throw new Error("no asset resolution expected"); } };
  const transform = await decodeTransformMediaSurface({
    ...context,
    element: {
      kind: "element", name: "media:Transform", range,
      attributes: {
        id: "prepared", source: { kind: "reference", path: "generated.media" },
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

test("StillVideo stops at an ordinary MP4 branch before Normalize", async () => {
  const range = { source: "still.svml", start: 0, end: 1 };
  const output = await decodeStillVideoSurface({
    sourceName: range.source,
    element: {
      kind: "element",
      name: "media:StillVideo",
      attributes: {
        id: "opening-still",
        source: { kind: "reference", path: "opening-head" },
        duration: "6",
        clock: { kind: "reference", path: "clock" },
      },
      children: [],
      range,
    },
    resolveReference: (path) => path === "opening-head"
      ? { path, ref: { kind: "record", id: path }, type: artifactTypes.blob }
      : path === "clock"
        ? { path, ref: { kind: "record", id: path }, type: programSpaceTypes.clock }
        : undefined,
    resolveAsset: async () => { throw new Error("no asset resolution expected"); },
  });
  assert.equal(output.fragments[0]?.id, stillVideoFragment.id);
  assert.deepEqual(output.components[0]?.outputs, { video: "opening-still.video" });
  assert.deepEqual(output.records[0], {
    id: "opening-still.duration", type: speechTypes.duration, value: { kind: "inline", value: 6 }, range,
  }, "the literal duration is the author's, published as an ordinary SpeechDuration Record");
  assert.deepEqual(output.components[0]?.inputs.duration, { kind: "record", id: "opening-still.duration" });
  assert.deepEqual(output.components[0]?.inputs["source-0"], { kind: "record", id: "opening-head" });
  assert.deepEqual(output.records[1]?.value, { kind: "inline", value: { weights: [1] } }, "one picture, one whole share");
  assert.equal(stillVideoFragment.exports[0]?.type.name, artifactTypes.blob.name);
});

test("StillVideo spreads several pictures over one literal duration by weight, in authored order", async () => {
  const range = { source: "still.svml", start: 0, end: 1 };
  const resolveReference = (path: string) => path === "clock"
    ? { path, ref: { kind: "record" as const, id: path }, type: programSpaceTypes.clock }
    : { path, ref: { kind: "record" as const, id: path }, type: artifactTypes.blob };
  const child = (source: string, weight?: string) => ({
    kind: "element" as const, name: "media:Still",
    attributes: { source: { kind: "reference" as const, path: source }, ...(weight === undefined ? {} : { weight }) },
    children: [], range,
  });
  const output = await decodeStillVideoSurface({
    sourceName: range.source,
    element: {
      kind: "element", name: "media:StillVideo",
      attributes: { id: "kitchen", duration: "6", clock: { kind: "reference", path: "clock" } },
      children: [child("counter"), child("basil", "2"), child("board")],
      range,
    },
    resolveReference,
    resolveAsset: async () => { throw new Error("no asset resolution expected"); },
  });
  assert.equal(output.fragments[0]?.id, createStillVideoFragment(3).id);
  assert.notEqual(output.fragments[0]?.id, stillVideoFragment.id, "three pictures are a different shape from one");
  assert.deepEqual(output.records[1]?.value, { kind: "inline", value: { weights: [1, 2, 1] } });
  assert.deepEqual(
    ["source-0", "source-1", "source-2"].map((name) => output.components[0]?.inputs[name]),
    [{ kind: "record", id: "counter" }, { kind: "record", id: "basil" }, { kind: "record", id: "board" }],
  );
  await assert.rejects(async () => await decodeStillVideoSurface({
    sourceName: range.source,
    element: {
      kind: "element", name: "media:StillVideo",
      attributes: { id: "both", source: { kind: "reference", path: "counter" }, duration: "6", clock: { kind: "reference", path: "clock" } },
      children: [child("basil")],
      range,
    },
    resolveReference,
    resolveAsset: async () => { throw new Error("no asset resolution expected"); },
  }), /either source or Still children/u);
});

test("still video frames are whole and every picture holds at least one", () => {
  assert.deepEqual(planStillVideoSegments(180, [1, 2, 1]).map((item) => item.endFrameExclusive - item.startFrame), [45, 90, 45]);
  assert.deepEqual(planStillVideoSegments(10, [1, 1, 1]).map((item) => item.endFrameExclusive - item.startFrame), [4, 3, 3],
    "the leftover frame goes to the earliest of equal remainders");
  assert.deepEqual(planStillVideoSegments(10, [1, 1.5, 1]).map((item) => item.endFrameExclusive - item.startFrame), [3, 4, 3]);
  assert.deepEqual(planStillVideoSegments(3, [100, 1, 1]).map((item) => item.endFrameExclusive - item.startFrame), [1, 1, 1]);
  assert.throws(() => planStillVideoSegments(2, [1, 1, 1]), /each picture needs at least one/u);
  const bound = bindStillVideoSource(
    { frameRate: { numerator: 30, denominator: 1 }, frameCount: 2, output: { container: "mp4", codec: "h264", pixelFormat: "yuv420p" },
      segments: [{ startFrame: 0, endFrameExclusive: 1 }, { startFrame: 1, endFrameExclusive: 2 }] },
    { kind: "blob", resource: fixtureResource("still:first"), size: 1, mediaType: "image/png" },
  );
  assert.equal(bound.segments[0]?.source?.mediaType, "image/png");
  assert.equal(bound.segments[1]?.source, undefined, "pictures bind in order, one per step");
});
