/**
 * Unit checks for the two Muse Image / Muse Voice rules Codex flagged on PR #491.
 * Run with the checkout's tsx so the provider's @hypit imports resolve:
 *   node_modules/.bin/tsx --test contrib/providers/meta-model-api/test/support-rules.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { support } from "../packages/provider-images/src/provider.mjs";
import { assertTranscribableWav } from "../packages/provider-voice/src/meta-voice-api.mjs";

const imageRequest = ({ references = 0, pending = 0, background, prompt = "an apple" } = {}) => ({
  constraints: {
    ports: {
      aspectRatio: ["1:1"],
      ...(prompt === undefined ? {} : { prompt: [prompt] }),
      ...(background === undefined ? {} : { background: [background] }),
      ...(references === 0 ? {} : {
        images: Array.from({ length: references }, (_, index) => ({ artifact: { resource: `res-${index}`, mediaType: "image/png" } })),
      }),
    },
  },
  pendingInputs: Array.from({ length: pending }, (_, index) => ({ input: "images", record: `slot-${index}` })),
});

/** A canonical 44-byte-header mono 16-bit PCM WAV of the requested length. */
function wav({ seconds, sampleRate = 16000, channels = 1, bits = 16 }) {
  const frames = Math.round(seconds * sampleRate);
  const blockAlign = channels * (bits / 8);
  const dataBytes = frames * blockAlign;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * blockAlign, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bits, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataBytes, 40);
  return new Uint8Array(buffer);
}

test("three dynamic references are three references, not six", () => {
  // Pre-Build: exactModelSpecification puts a placeholder in ports.images and a slot in pendingInputs.
  const verdict = support(imageRequest({ references: 3, pending: 3 }));
  assert.equal(verdict.status, "supported", verdict.reason);
});

test("four dynamic references still fit the four-reference cap", () => {
  const verdict = support(imageRequest({ references: 4, pending: 4 }));
  assert.equal(verdict.status, "supported", verdict.reason);
});

test("five references are refused", () => {
  const verdict = support(imageRequest({ references: 5, pending: 5 }));
  assert.equal(verdict.status, "unsupported");
  assert.match(verdict.reason, /at most 4 reference images/);
});

test("resolved references in ports alone are counted one by one", () => {
  assert.equal(support(imageRequest({ references: 2, prompt: undefined })).status, "supported");
  assert.equal(support(imageRequest({ references: 5 })).status, "unsupported");
});

test("transparent background is refused, opaque and auto are not", () => {
  assert.equal(support(imageRequest({ background: "transparent" })).status, "unsupported");
  assert.match(support(imageRequest({ background: "transparent" })).reason, /opaque background/);
  assert.equal(support(imageRequest({ background: "opaque" })).status, "supported");
  assert.equal(support(imageRequest({ background: "auto" })).status, "supported");
  assert.equal(support(imageRequest({})).status, "supported");
});

test("a ten minute WAV is accepted", () => {
  const evidence = wav({ seconds: 600 });
  const format = assertTranscribableWav(evidence, 600 * 16000);
  assert.equal(format.sampleRate, 16000);
  assert.equal(format.dataSize, 600 * 16000 * 2);
});

test("a WAV over ten minutes is refused before it is posted", () => {
  assert.throws(() => assertTranscribableWav(wav({ seconds: 601 }), 601 * 16000), /at most 10 minutes/);
});

test("a WAV over 32 MB is refused with the size it measured", () => {
  // 33 MB at 16 kHz mono is ~1078 s, so the size rule must fire before the duration rule.
  assert.throws(() => assertTranscribableWav(wav({ seconds: 1078 }), 1078 * 16000), /at most 32 MB/);
});

test("a declared frame count that disagrees is still refused", () => {
  assert.throws(() => assertTranscribableWav(wav({ seconds: 5 }), 5 * 16000 + 16000 * 2), /declares/);
  // 24 kHz used to be accepted here and then reinterpreted at 16 kHz downstream.
  assert.throws(() => assertTranscribableWav(wav({ seconds: 4, sampleRate: 24000 }), 4 * 16000),
    /16 kHz mono PCM evidence/u);
});
