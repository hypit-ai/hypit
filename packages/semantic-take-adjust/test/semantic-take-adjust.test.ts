import assert from "node:assert/strict";
import test from "node:test";

import { adjustSemanticTake } from "../src/program.js";
import type { SemanticTake } from "@hypit/speech";

const source = {
  narrativeId: "story",
  media: {
    timeline: { frameRate: { numerator: 30, denominator: 1 }, frameCount: 100 },
    visual: {
      artifact: { kind: "blob", resource: "res_semantic-take-adjust", size: 1, mediaType: "video/mp4" },
      width: 720,
      height: 1280,
    },
  },
  segment: {
    segmentId: "opening",
    startAnchorId: "opening:start",
    endAnchorId: "opening:end",
    startFrame: 0,
    endFrameExclusive: 100,
  },
  tokens: [{
    tokenId: "answer",
    segmentId: "opening",
    text: "Ajá",
    startAnchorId: "answer:start",
    endAnchorId: "answer:end",
    startFrame: 58,
    endFrameExclusive: 85,
  }],
  anchors: [
    { identity: "opening:start", frame: 0 },
    { identity: "answer:start", frame: 58 },
    { identity: "answer:end", frame: 85 },
    { identity: "opening:end", frame: 100 },
  ],
} satisfies SemanticTake;

test("adjusts an authored semantic anchor without changing media", () => {
  const adjusted = adjustSemanticTake(source, {
    narrativeId: "story",
    anchors: [{ anchorId: "answer:start", frame: 63 }],
  });

  assert.equal(adjusted.tokens[0]?.startFrame, 63);
  assert.equal(adjusted.tokens[0]?.endFrameExclusive, 85);
  assert.equal(adjusted.anchors.find((anchor) => anchor.identity === "answer:start")?.frame, 63);
  assert.deepEqual(adjusted.media, source.media);
});
