import assert from "node:assert/strict";
import test from "node:test";

import {
  PITCH_PRESERVING_RECONSTRUCTION_FORMAT,
  preservePitch,
  readPreservePitch,
} from "@hypit/audio-preserve-pitch";

test("PreservePitch is one typed Audio reconstruction without a hidden speed", () => {
  const reconstruction = preservePitch();
  assert.deepEqual(reconstruction, {
    signal: { module: { name: "@hypit/audiovisual" }, name: "Audio" },
    program: {
      format: PITCH_PRESERVING_RECONSTRUCTION_FORMAT,
      payload: {},
      artifacts: [],
    },
  });
  assert.doesNotThrow(() => readPreservePitch(reconstruction.program));
});
