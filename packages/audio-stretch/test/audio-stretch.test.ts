import assert from "node:assert/strict";
import test from "node:test";

import {
  PITCH_PRESERVING_RECONSTRUCTION_FORMAT,
  audioStretchAuthorDeclarations,
  audioStretchMarkupDeclarations,
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
  assert.deepEqual(audioStretchAuthorDeclarations.map(({ declaration }) => declaration), ["preserve-pitch"]);
  assert.deepEqual(audioStretchMarkupDeclarations.map(({ tag }) => tag), ["PreservePitch"]);
});
