import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { prepareTranscript, transcribeSpeechAudio } from "../src/transcript.js";
import type { TranscriptFile } from "../src/types.js";

const REFERENCE = "ref-fixture";

/** The canonical evidence WAV the Provider refuses to normalize a second time: 16 kHz mono s16. */
function wav(sampleFrames: number): Uint8Array {
  const bytes = new Uint8Array(44 + sampleFrames * 2);
  const view = new DataView(bytes.buffer);
  const write = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index);
  };
  write(0, "RIFF");
  view.setUint32(4, bytes.byteLength - 8, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16_000, true);
  view.setUint32(28, 32_000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, sampleFrames * 2, true);
  return bytes;
}

async function serving(response: unknown, run: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  const originalApiKey = process.env.HYPIHUB_API_KEY;
  // The provider call is fully mocked below; give it a deterministic credential so the
  // tests exercise request shaping and transcript parsing rather than the developer's
  // local credential store (which is intentionally absent on CI runners).
  process.env.HYPIHUB_API_KEY = "test-hypihub-key";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.endsWith("/health")
      ? {
        ok: true,
        protocol: "hypit.whisperx-service@1",
        serviceVersion: "0.1.0",
        whisperxVersion: "3.8.6",
        model: "small",
        device: "cpu",
        compute: "int8",
        batchSize: 8,
      }
      : url.includes("/models/")
        ? { name: "victor-upmeet/whisperx", endpoints: ["transcriptions"] }
        : url.endsWith("/files")
          ? { url: "https://hypit.ai/test-reference.wav" }
        : response;
    return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try { await run(); } finally {
    globalThis.fetch = original;
    if (originalApiKey === undefined) delete process.env.HYPIHUB_API_KEY;
    else process.env.HYPIHUB_API_KEY = originalApiKey;
  }
}

test("every word carries its own start and end in seconds, not only the passage around it", async () => {
  const root = await mkdtemp(join(tmpdir(), "reference-video-transcript-"));
  const audioPath = join(root, "speech.wav");
  await writeFile(audioPath, wav(32_000));

  await serving({
    language: "en",
    segments: [{ start: 0, end: 2, words: [
      { text: "number", start: 0.1, end: 0.4, score: 0.9 },
      { text: "five", start: 1.2, end: 1.6 },
    ] }],
  }, async () => {
    const passages = await transcribeSpeechAudio(audioPath, "en");
    assert.equal(passages.length, 1);
    assert.equal(passages[0]!.text, "number five");
    assert.deepEqual(passages[0]!.words, [
      { text: "number", start_seconds: 0.1, end_seconds: 0.4, score: 0.9 },
      { text: "five", start_seconds: 1.2, end_seconds: 1.6 },
    ], "placing an on-screen reveal needs the time of the word, not of the sentence it sits in");
  });
});

test("a complete transcript is written beside the other prepared artifacts and summarized by its word count", async () => {
  const root = await mkdtemp(join(tmpdir(), "reference-video-transcript-"));
  await writeFile(join(root, "speech.wav"), wav(32_000));

  await serving({
    language: "en",
    segments: [{ start: 0, end: 2, words: [{ text: "hello", start: 0.1, end: 0.4 }, { text: "world", start: 1.2, end: 1.6 }] }],
  }, async () => {
    const result = await prepareTranscript(REFERENCE, join(root, "reference.mp4"), root, true, "en", false);
    assert.deepEqual(result, { status: "complete", transcript_ref: join(root, "transcript.json"), word_count: 2 });

    const file = JSON.parse(await readFile(join(root, "transcript.json"), "utf8")) as TranscriptFile;
    assert.equal(file.reference_id, REFERENCE);
    assert.equal(file.audio_ref, join(root, "speech.wav"));
    assert.equal(file.passages[0]!.words.length, 2);
  });
});

test("a WhisperX that cannot answer leaves the transcript unavailable with its reason instead of failing preparation", async () => {
  const root = await mkdtemp(join(tmpdir(), "reference-video-transcript-"));
  assert.deepEqual(
    await prepareTranscript(REFERENCE, join(root, "reference.mp4"), root, false, "en", false),
    { status: "unavailable", transcript_ref: null, word_count: 0, reason: "the reference video has no audio track" },
    "a silent reference is prepared, not refused");

  await writeFile(join(root, "reference.mp4"), "not a video", "utf8");
  const failed = await prepareTranscript(REFERENCE, join(root, "reference.mp4"), root, true, "en", false);
  assert.equal(failed.status, "unavailable");
  assert.equal(failed.transcript_ref, null);
  assert.equal(typeof failed.reason === "string" && failed.reason.length > 0, true,
    "the whole preparation survives, so the one thing that did not work has to say why");
});
