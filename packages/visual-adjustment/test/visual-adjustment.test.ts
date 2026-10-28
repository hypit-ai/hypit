import assert from "node:assert/strict";
import test from "node:test";

import { composeTemporalWindow } from "@hypit/temporal";
import { sealTimeline } from "@hypit/timeline";
import { studioContributionFromPackage } from "@hypit/studio-companion";

import hypitPackage from "../src/activation.js";
import {
  appendVisualAdjustment,
  assertVisualAdjustmentEffect,
  assertVisualAdjustmentSet,
  createVisualAdjustmentSet,
  finalizeVisualAdjustmentTrack,
} from "../src/index.js";

const timeline = sealTimeline({ id: "story", frameCount: 90, frameRate: { numerator: 30, denominator: 1 } });
const window = composeTemporalWindow({ id: "look.window", subjectId: "look" },
  { id: "look.start", subjectId: "look", timelineId: timeline.id, frame: 10 },
  { id: "look.end", subjectId: "look", timelineId: timeline.id, frame: 80 });
const effect = (format: string) => ({ format, payload: { amount: 0.5 }, artifacts: [] } as const);

test("Visual Adjustment assembles package-owned effects without interpreting their vocabulary", () => {
  const program = effect("example.visual-effect@1");
  const track = finalizeVisualAdjustmentTrack(
    appendVisualAdjustment(createVisualAdjustmentSet(), { id: "look" }, timeline,
      { id: "cinematic", effect: program }, window),
    { id: "look" }, timeline,
  );
  assert.equal(track.items[0]?.kind, "adjustment");
  assert.deepEqual(track.items[0]?.program, program);
  assert.deepEqual(track.items[0]?.span, window.span);
});

test("one resolved Window can time effects from distinct packages", () => {
  let set = appendVisualAdjustment(createVisualAdjustmentSet(), { id: "look" }, timeline,
    { id: "first", effect: effect("one.effect@1") }, window);
  set = appendVisualAdjustment(set, { id: "look" }, timeline,
    { id: "second", effect: effect("another.effect@1") }, window);
  assert.deepEqual(set.items.map((item) => item.id), ["first", "second"]);
  assert.deepEqual(set.items.map((item) => item.program.format), ["one.effect@1", "another.effect@1"]);
});

test("Visual Adjustment validates generic programme shape and Adjustment-only accumulation", () => {
  assert.doesNotThrow(() => assertVisualAdjustmentEffect(effect("example.effect@1")));
  assert.throws(() => assertVisualAdjustmentEffect({ format: "", payload: {}, artifacts: [] }), /format/u);
  const set = appendVisualAdjustment(createVisualAdjustmentSet(), { id: "look" }, timeline,
    { id: "first", effect: effect("one.effect@1") }, window);
  assert.doesNotThrow(() => assertVisualAdjustmentSet(set));
  assert.throws(() => assertVisualAdjustmentSet({ items: [set.items[0]!, structuredClone(set.items[0]!)] }),
    /duplicate Visual Item first/u);
  assert.throws(() => assertVisualAdjustmentSet({ items: [{
    kind: "present", id: "wrong", span: window.span,
    root: { id: "root", kind: "box", style: [], children: [] },
  }] } as never), /accepts only Adjustment items/u);
});

test("Visual Adjustment Studio contribution owns timing, not an effect vocabulary", () => {
  const contribution = studioContributionFromPackage("@hypit/visual-adjustment", hypitPackage.facets);
  assert.equal(contribution.tracks.length, 1);
  assert.equal(contribution.parameters.length, 0);
  assert.equal(contribution.tracks[0]?.family, "visual-adjustment");
});
