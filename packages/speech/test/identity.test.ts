import assert from "node:assert/strict";
import test from "node:test";

import { assertSemanticTakeIdentity } from "@hypit/speech";

test("SemanticTake rejects Token frames that disagree with authored Anchors", () => {
  assert.throws(() => assertSemanticTakeIdentity({
    narrativeId: "story",
    media: {
      timeline: { frameRate: { numerator: 30, denominator: 1 }, frameCount: 30 },
      audio: {
        artifact: {
          kind: "blob",
          digest: `sha256:${"0".repeat(64)}`,
          size: 1,
          mediaType: "audio/wav",
        },
      },
    },
    segment: {
      segmentId: "intro", startAnchorId: "intro:start", endAnchorId: "intro:end",
      startFrame: 0, endFrameExclusive: 30,
    },
    tokens: [{
      tokenId: "hello", segmentId: "intro", text: "hello",
      startAnchorId: "hello:start", endAnchorId: "hello:end",
      startFrame: 4, endFrameExclusive: 10,
    }],
    anchors: [
      { identity: "intro:start", frame: 0 },
      { identity: "hello:start", frame: 3 },
      { identity: "hello:end", frame: 10 },
      { identity: "intro:end", frame: 30 },
    ],
  }), /disagrees with its Anchors/u);
});
