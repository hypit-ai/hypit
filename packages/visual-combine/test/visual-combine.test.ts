import assert from "node:assert/strict";
import test from "node:test";

import {
  assertVisualTrackIdentity,
  sealPresentVisualTrack,
  sealVisualTrack,
} from "@hypit/composition";
import type { VisualPresent, VisualTrack } from "@hypit/composition";
import { sealTimeline } from "@hypit/timeline";
import type { FrameSpan } from "@hypit/timeline";

import {
  combineVisualTracks,
  createVisualCombineFragment,
} from "../src/index.js";
import { concatVisualCombineBlocks, createVisualCombineBlock } from "../src/program.js";

const timeline = sealTimeline({ id: "story", frameCount: 90, frameRate: { numerator: 30, denominator: 1 } });

function present(id: string, subjectId: string, span: FrameSpan): VisualPresent {
  return {
    kind: "present",
    id,
    subjectId,
    span,
    root: {
      kind: "program",
      id: "root",
      program: { format: "fixture.visual@1", payload: {}, artifacts: [] },
      slots: [],
    },
  };
}

function track(id: string, itemId: string, subjectId: string, span: FrameSpan): VisualTrack {
  return sealPresentVisualTrack({
    timelineId: timeline.id,
    id,
    presents: [present(itemId, subjectId, span)],
  });
}

test("Visual Combine preserves Use and Track-local paint order even when Windows overlap", () => {
  const laterStarting = track("opening", "shared", "opening-scene", { startFrame: 20, endFrameExclusive: 60 });
  const earlierStarting = track("editor", "shared", "editor-scene", { startFrame: 10, endFrameExclusive: 50 });
  const combined = combineVisualTracks([
    { spec: { id: "opening" }, track: laterStarting },
    { spec: { id: "editor" }, track: earlierStarting },
  ], { id: "motion" }, timeline);
  assert.deepEqual(combined.items.map((item) => item.subjectId), ["opening-scene", "editor-scene"]);
  assert.deepEqual(combined.items.map((item) => item.span), [
    { startFrame: 20, endFrameExclusive: 60 },
    { startFrame: 10, endFrameExclusive: 50 },
  ]);
  assert.equal(new Set(combined.items.map((item) => item.id)).size, 2);
  assert.match(combined.items[0]!.id, /opening/u);
  assert.match(combined.items[1]!.id, /editor/u);
  assert.doesNotThrow(() => assertVisualTrackIdentity(combined, timeline));
});

test("Visual Combine retains each source block and ordinary Adjustment semantics", () => {
  const background = sealVisualTrack({
    timelineId: timeline.id,
    id: "background",
    items: [
      present("background", "background", { startFrame: 0, endFrameExclusive: 90 }),
      {
        kind: "adjustment",
        id: "look",
        subjectId: "background-look",
        span: { startFrame: 0, endFrameExclusive: 90 },
        program: { format: "fixture.adjustment@1", payload: {}, artifacts: [] },
      },
    ],
  });
  const title = track("title", "title", "title", { startFrame: 15, endFrameExclusive: 45 });
  const combined = combineVisualTracks([
    { spec: { id: "background" }, track: background },
    { spec: { id: "title" }, track: title },
  ], { id: "picture" }, timeline);
  assert.deepEqual(combined.items.map((item) => item.kind), ["present", "adjustment", "present"]);
  assert.deepEqual(combined.items.map((item) => item.subjectId), ["background", "background-look", "title"]);
});

test("Visual Combine rejects duplicate Use identity and Timeline mismatch", () => {
  const source = track("source", "picture", "picture", { startFrame: 0, endFrameExclusive: 30 });
  assert.throws(() => combineVisualTracks([
    { spec: { id: "source" }, track: source },
    { spec: { id: "source" }, track: source },
  ], { id: "duplicate" }, timeline), /repeats Use source/u);
  const block = createVisualCombineBlock(timeline, { id: "source" }, source);
  assert.throws(() => concatVisualCombineBlocks(block, block, timeline), /repeats Use source/u);

  const otherTimeline = sealTimeline({ id: "other", frameCount: 90, frameRate: { numerator: 30, denominator: 1 } });
  assert.throws(() => combineVisualTracks([
    { spec: { id: "source" }, track: source },
  ], { id: "wrong-timeline" }, otherTimeline),
    /belongs to Timeline story, not other/u);
});

test("Visual Combine output is closed under another ordered Combine", () => {
  const source = track("source", "picture", "picture", { startFrame: 0, endFrameExclusive: 30 });
  const inner = combineVisualTracks([{ spec: { id: "source" }, track: source }], { id: "inner" }, timeline);
  const outer = combineVisualTracks([{ spec: { id: "inner" }, track: inner }], { id: "outer" }, timeline);
  assert.equal(outer.items.length, 1);
  assert.equal(outer.items[0]?.subjectId, "picture");
  assert.notEqual(outer.items[0]?.id, inner.items[0]?.id);
  assert.doesNotThrow(() => assertVisualTrackIdentity(outer, timeline));
});

test("Visual Combine requires at least one Use", () => {
  assert.throws(() => combineVisualTracks([], { id: "empty" }, timeline),
    /requires at least one Use/u);
});

test("Visual Combine preserves Present then Adjustment as one ordered Picture programme", () => {
  const picture = track("picture", "picture", "picture", { startFrame: 0, endFrameExclusive: 90 });
  const filter = sealVisualTrack({
    timelineId: timeline.id,
    id: "filter",
    items: [{
      kind: "adjustment",
      id: "filter",
      span: { startFrame: 0, endFrameExclusive: 90 },
      program: { format: "fixture.adjustment@1", payload: {}, artifacts: [] },
    }],
  });
  const combined = combineVisualTracks([
    { spec: { id: "picture" }, track: picture },
    { spec: { id: "filter" }, track: filter },
  ], { id: "filtered-picture" }, timeline);
  assert.deepEqual(combined.items.map((item) => item.kind), ["present", "adjustment"]);
});

test("Visual Combine fragment lowers Uses through a balanced fixed-port reduction", () => {
  const fragment = createVisualCombineFragment(8);
  const producers = fragment.operations.map((operation) => operation.producer.name);
  assert.equal(producers.filter((name) => name === "create-combine-block").length, 8);
  assert.equal(producers.filter((name) => name === "concat-combine-blocks").length, 7);
  assert.equal(producers.filter((name) => name === "finalize-combine-block").length, 1);
  assert.equal(producers.some((name) => name.includes("set") || name.includes("append")), false);
});
