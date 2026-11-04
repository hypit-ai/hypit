import assert from "node:assert/strict";
import test from "node:test";
import { sealAudioExtractionRequest, sealFrameExtractionRequest } from "@hypit/media-extraction";

test("extraction requests keep ordinary defaults explicit", () => {
  assert.deepEqual(sealAudioExtractionRequest({ audio: { mode: "default" } }), {
    audio: { mode: "default" },
  });
  assert.deepEqual(sealFrameExtractionRequest({
    video: { mode: "primary-moving" },
    at: { kind: "first" },
  }), {
    video: { mode: "primary-moving" },
    at: { kind: "first" },
  });
});
