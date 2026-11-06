import assert from "node:assert/strict";
import test from "node:test";

import { sealAudioExtractionRequest, sealFrameExtractionRequest } from "@hypit/media";

test("Media seals explicit audio and frame materialization requests", () => {
  assert.deepEqual(sealAudioExtractionRequest({ audio: { mode: "default" } }), {
    audio: { mode: "default" },
  });
  assert.deepEqual(sealFrameExtractionRequest({
    video: { mode: "primary-moving" },
    at: { kind: "last" },
  }), {
    video: { mode: "primary-moving" },
    at: { kind: "last" },
  });
  assert.throws(() => sealFrameExtractionRequest({
    video: { mode: "primary-moving" },
    at: { kind: "frame", index: -1 },
  }), /non-negative integer/u);
});
