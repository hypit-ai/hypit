import assert from "node:assert/strict";
import test from "node:test";

import {
  PITCH_PRESERVING_RECONSTRUCTION_FORMAT,
  preservePitch,
  readPreservePitch,
} from "@hypit/audio-stretch";

test("PreservePitch is one explicit reconstruction programme without a hidden speed", () => {
  const program = preservePitch();
  assert.deepEqual(program, {
    format: PITCH_PRESERVING_RECONSTRUCTION_FORMAT,
    payload: {},
    artifacts: [],
  });
  assert.doesNotThrow(() => readPreservePitch(program));
});
