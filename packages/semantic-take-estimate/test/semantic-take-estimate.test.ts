import assert from "node:assert/strict";
import test from "node:test";

import { sealSpeechEstimatePolicy } from "@hypit/estimate";
import { sealSynchronizedMedia } from "@hypit/media";
import type { Narrative } from "@hypit/narrative";
import { fixtureResource } from "../../../test/fixture-resource.js";

import {
  estimateSemanticTakeTiming,
  materializeEstimatedSemanticTake,
} from "@hypit/semantic-take-estimate";

const narrative: Narrative = {
  id: "test-narrative",
  segments: [{
    id: "opening",
    startAnchorId: "opening:start",
    endAnchorId: "opening:end",
    tokenStart: 0,
    tokenEndExclusive: 3,
  }],
  tokens: [
    { id: "a", segmentId: "opening", startAnchorId: "a:start", endAnchorId: "a:end", text: "A", normalized: "a" },
    { id: "wonderful", segmentId: "opening", startAnchorId: "wonderful:start", endAnchorId: "wonderful:end", text: "wonderful", normalized: "wonderful" },
    { id: "cat", segmentId: "opening", startAnchorId: "cat:start", endAnchorId: "cat:end", text: "cat.", normalized: "cat" },
  ],
  turns: [],
  selections: [],
  moments: [],
  semanticIndex: {
    anchors: [
      { id: "opening:start", kind: "segment-start", segmentId: "opening" },
      { id: "a:start", kind: "token-start", segmentId: "opening", tokenId: "a" },
      { id: "a:end", kind: "token-end", segmentId: "opening", tokenId: "a" },
      { id: "wonderful:start", kind: "token-start", segmentId: "opening", tokenId: "wonderful" },
      { id: "wonderful:end", kind: "token-end", segmentId: "opening", tokenId: "wonderful" },
      { id: "cat:start", kind: "token-start", segmentId: "opening", tokenId: "cat" },
      { id: "cat:end", kind: "token-end", segmentId: "opening", tokenId: "cat" },
      { id: "opening:end", kind: "segment-end", segmentId: "opening" },
    ],
  },
};

const excerpt = { narrativeId: narrative.id, kind: "segment" as const, id: "opening", tokenStart: 0, tokenEndExclusive: 3 };
const media = sealSynchronizedMedia({
  timeline: { frameRate: { numerator: 30, denominator: 1 }, frameCount: 120 },
  visual: {
    artifact: { kind: "blob", resource: fixtureResource("estimated-take-video"), size: 1_024, mediaType: "video/mp4" },
    width: 1_080,
    height: 1_920,
  },
});
const policy = sealSpeechEstimatePolicy({
  language: "en",
  pace: "normal",
  rounding: "none",
});

test("estimated timing weights articulation by syllables and leaves visible gaps", () => {
  const timing = estimateSemanticTakeTiming(narrative, excerpt, media, policy);
  assert.equal(timing.tokens[0]!.startFrame, 4);
  assert.equal(timing.tokens[1]!.startFrame - timing.tokens[0]!.endFrameExclusive, 2);
  assert.equal(timing.tokens[2]!.startFrame - timing.tokens[1]!.endFrameExclusive, 2);
  assert.equal(media.timeline.frameCount - timing.tokens[2]!.endFrameExclusive, 4);
  const durations = timing.tokens.map((token) => token.endFrameExclusive - token.startFrame);
  assert.ok(durations[1]! > durations[0]!);
  assert.ok(durations[1]! > durations[2]!);
});

test("estimated timing fills the normalized media instead of stopping at a fixed speech length", () => {
  const frameCounts = [7 * 30, 10 * 30];
  const timings = frameCounts.map((frameCount) => estimateSemanticTakeTiming(
    narrative,
    excerpt,
    sealSynchronizedMedia({ ...media, timeline: { ...media.timeline, frameCount } }),
    policy,
  ));

  for (const [index, timing] of timings.entries()) {
    const frameCount = frameCounts[index]!;
    assert.ok(timing.tokens[0]!.startFrame <= 0.2 * 30);
    assert.ok(timing.tokens.at(-1)!.endFrameExclusive >= frameCount - 0.2 * 30);
  }
  assert.ok(
    timings[1]!.tokens[1]!.endFrameExclusive - timings[1]!.tokens[1]!.startFrame
      > timings[0]!.tokens[1]!.endFrameExclusive - timings[0]!.tokens[1]!.startFrame,
  );
});

test("estimated and measured alignment share the ordinary SemanticTake waist", () => {
  const take = materializeEstimatedSemanticTake(narrative, excerpt, media, policy);
  assert.equal(take.segment.segmentId, "opening");
  assert.deepEqual(take.tokens.map((token) => token.tokenId), ["a", "wonderful", "cat"]);
  assert.deepEqual(take.media, media);
  assert.equal(take.media.audio, undefined);
});

test("an implausibly short frame domain is refused instead of squeezing words together", () => {
  const short = sealSynchronizedMedia({
    ...media,
    timeline: { ...media.timeline, frameCount: 8 },
  });
  assert.throws(
    () => estimateSemanticTakeTiming(narrative, excerpt, short, policy),
    /keep every Token visible and separated/u,
  );
});
