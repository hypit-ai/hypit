import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { canonicalize } from "@hypit/protocol";
import { sealAlignedTranscriptEvidence } from "@hypit/speech-evidence";
import { interpretWhisperXTranscript } from "@hypit/whisperx";
import type { WhisperXAlignmentRequest, WhisperXTranscriptResponse } from "@hypit/whisperx";

import { prepareTranscript, transcribeSpeechAudio } from "../src/transcript.js";
import type { InvokeNeed } from "../src/transcript.js";
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

/**
 * The Runtime host's one-shot invocation, answered with a WhisperX-shaped response. These tests
 * exercise request shaping and transcript parsing; which Provider the Profile binds is the Runtime's
 * business and never this module's.
 */
function answering(response: WhisperXTranscriptResponse): InvokeNeed {
  return async (need) => {
    assert.equal(need.capability.name, "whisperx-alignment");
    const request = need.constraints as unknown as WhisperXAlignmentRequest;
    assert.equal(request.audio.mediaType, "audio/wav");
    assert.equal(request.language, "en");
    return {
      value: {
        kind: "inline",
        value: canonicalize(sealAlignedTranscriptEvidence({
          passages: interpretWhisperXTranscript(response, request.sampleFrames),
        })),
      },
    };
  };
}

const unanswered: InvokeNeed = async () => {
  throw new Error("no Endpoint in the selected Runtime Profile serves @hypit/whisperx#whisperx-alignment");
};

test("every word carries its own start and end in seconds, not only the passage around it", async () => {
  const root = await mkdtemp(join(tmpdir(), "reference-video-transcript-"));
  const audioPath = join(root, "speech.wav");
  await writeFile(audioPath, wav(32_000));

  const passages = await transcribeSpeechAudio(audioPath, "en", answering({
    language: "en",
    segments: [{ start: 0, end: 2, words: [
      { text: "number", start: 0.1, end: 0.4, score: 0.9 },
      { text: "five", start: 1.2, end: 1.6 },
    ] }],
  }));
  assert.equal(passages.length, 1);
  assert.equal(passages[0]!.text, "number five");
  assert.deepEqual(passages[0]!.words, [
    { text: "number", start_seconds: 0.1, end_seconds: 0.4, score: 0.9 },
    { text: "five", start_seconds: 1.2, end_seconds: 1.6 },
  ], "placing an on-screen reveal needs the time of the word, not of the sentence it sits in");
});

test("a complete transcript is written beside the other prepared artifacts and summarized by its word count", async () => {
  const root = await mkdtemp(join(tmpdir(), "reference-video-transcript-"));
  await writeFile(join(root, "speech.wav"), wav(32_000));

  const result = await prepareTranscript(REFERENCE, join(root, "reference.mp4"), root, true, "en", false, answering({
    language: "en",
    segments: [{ start: 0, end: 2, words: [{ text: "hello", start: 0.1, end: 0.4 }, { text: "world", start: 1.2, end: 1.6 }] }],
  }));
  assert.deepEqual(result, { status: "complete", transcript_ref: join(root, "transcript.json"), word_count: 2 });

  const file = JSON.parse(await readFile(join(root, "transcript.json"), "utf8")) as TranscriptFile;
  assert.equal(file.reference_id, REFERENCE);
  assert.equal(file.audio_ref, join(root, "speech.wav"));
  assert.equal(file.passages[0]!.words.length, 2);
});

test("an alignment Endpoint that cannot answer leaves the transcript unavailable with its reason instead of failing preparation", async () => {
  const root = await mkdtemp(join(tmpdir(), "reference-video-transcript-"));
  assert.deepEqual(
    await prepareTranscript(REFERENCE, join(root, "reference.mp4"), root, false, "en", false, unanswered),
    { status: "unavailable", transcript_ref: null, word_count: 0, reason: "the reference video has no audio track" },
    "a silent reference is prepared, not refused");

  await writeFile(join(root, "speech.wav"), wav(32_000));
  const refused = await prepareTranscript(REFERENCE, join(root, "reference.mp4"), root, true, "en", false, unanswered);
  assert.equal(refused.status, "unavailable");
  assert.match(refused.reason ?? "", /WhisperX alignment did not answer: no Endpoint in the selected Runtime Profile/u,
    "the Profile, not this tool, decides who measures the transcript; the reader learns exactly what is missing");

  await writeFile(join(root, "reference.mp4"), "not a video", "utf8");
  const failed = await prepareTranscript(REFERENCE, join(root, "reference.mp4"), root, true, "en", true, unanswered);
  assert.equal(failed.status, "unavailable");
  assert.equal(failed.transcript_ref, null);
  assert.equal(typeof failed.reason === "string" && failed.reason.length > 0, true,
    "the whole preparation survives, so the one thing that did not work has to say why");
});
