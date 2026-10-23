import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { canonicalize } from "@hypit/hypit/protocol";
import type { Need } from "@hypit/hypit/protocol";
import { decodeSpeechTranscriptSource, sealSpeechTranscriptEvidence } from "@hypit/speech-evidence";
import { interpretWhisperXTranscript } from "@hypit/whisperx";
import type { WhisperXTranscriptionRequest } from "@hypit/whisperx";

import { runTranscribeCli } from "../src/cli.js";
import type { TranscribeEnvironment } from "../src/cli.js";

/** 16 kHz mono PCM s16 WAV: the canonical evidence shape, so no ffmpeg runs in these tests. */
function wav(sampleFrames: number): Uint8Array {
  const bytes = new Uint8Array(44 + sampleFrames * 2);
  const view = new DataView(bytes.buffer);
  const write = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index);
  };
  write(0, "RIFF"); view.setUint32(4, bytes.byteLength - 8, true); write(8, "WAVE");
  write(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 16_000, true); view.setUint32(28, 32_000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, "data"); view.setUint32(40, sampleFrames * 2, true);
  return bytes;
}

const page = { kind: "page" as const, url: "https://prices.example/models" };

/** A host whose Profile serves everything through one paid Endpoint, answering each Need in kind. */
function host(seen: Need[]): Awaited<ReturnType<TranscribeEnvironment["openHost"]>>["host"] {
  return {
    endpoints: async (queries) => queries.map((query) => ({
      need: query.need,
      capability: query.capability,
      status: "resolved" as const,
      support: "supported" as const,
      endpoint: "paid.default",
      use: "@hypit/provider-example",
      pricing: page,
    })),
    invoke: async (need, resources, observation) => {
      await observation?.reportProgress?.({ phase: "Aligning words" });
      await observation?.reportProgress?.({ phase: "Aligning words" });
      seen.push(need);
      if (need.capability.name === "whisperx-transcription") {
        const request = need.constraints as unknown as WhisperXTranscriptionRequest;
        return canonicalize(sealSpeechTranscriptEvidence({
          sampleFrames: request.sampleFrames,
          passages: interpretWhisperXTranscript({
            segments: [{ start: 0, end: 1.5, words: [{ text: "hello", start: 0.1, end: 0.5 }, { text: "world", start: 0.9, end: 1.4 }] }],
          }, request.sampleFrames),
        }));
      }
      throw new Error(`Unexpected capability ${need.capability.name}`);
    },
  };
}

function environment(cwd: string, seen: Need[]): TranscribeEnvironment {
  return { cwd, openHost: async () => ({ profile: join(cwd, "hypit.runtime.json"), host: host(seen) }) };
}

function capture() {
  let output = "";
  return { io: { write: (text: string) => { output += text; } }, text: () => output };
}

test("transcribe writes exact editable evidence from the Profile's transcription Endpoint", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-transcribe-"));
  const seen: Need[] = [];
  try {
    await writeFile(join(root, "speech.wav"), wav(32_000));
    const out = capture();
    await runTranscribeCli(["transcribe", "speech.wav", "--to", "speech.transcript.svml", "--language", "en"], out.io, environment(root, seen));
    assert.match(out.text(), /paid\.default \(@hypit\/provider-example\)  ·  https:\/\/prices\.example\/models/u);
    assert.match(out.text(), /2 words in 1 passage over 2s/u);
    assert.equal(out.text().match(/Aligning words/gu)?.length, 1);
    const file = decodeSpeechTranscriptSource(await readFile(join(root, "speech.transcript.svml"), "utf8"));
    assert.equal(file.sampleFrames, 32_000);
    assert.deepEqual(file.passages[0]?.words.map((word) => [word.text, word.startSample]), [["hello", 1_600], ["world", 14_400]]);
    const request = seen[0]!.constraints as unknown as WhisperXTranscriptionRequest;
    assert.equal(request.language, "en");
    assert.equal(request.sampleFrames, 32_000);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a Profile that does not serve the capability stops before anything is spent", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-creation-unserved-"));
  try {
    await writeFile(join(root, "speech.wav"), wav(16_000));
    let invoked = false;
    const unserved: TranscribeEnvironment = {
      cwd: root,
      openHost: async () => ({ profile: join(root, "hypit.runtime.json"), host: {
        endpoints: async (queries) => queries.map((query) => ({
          need: query.need,
          capability: query.capability,
          status: "unresolved" as const,
          support: "not-evaluated" as const,
        })),
        invoke: async () => { invoked = true; throw new Error("must not be reached"); },
      } }),
    };
    await assert.rejects(
      runTranscribeCli(["transcribe", "speech.wav", "--to", "speech.transcript.svml", "--language", "en"], capture().io, unserved),
      /No Endpoint in .*hypit\.runtime\.json serves @hypit\/whisperx@1#whisperx-transcription; configure an Endpoint/u,
    );
    assert.equal(invoked, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("transcribe requires a spoken language before opening a host", async () => {
  const noHost: TranscribeEnvironment = { cwd: "/tmp", openHost: async () => { throw new Error("host must not open"); } };
  await assert.rejects(runTranscribeCli(["transcribe", "speech.wav", "--to", "speech.transcript.svml"], capture().io, noHost),
    /transcribe --language must be an explicit/u);
});

test("transcribe passes Korean to the selected endpoint", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-transcribe-ko-"));
  try {
    await writeFile(join(root, "speech.wav"), wav(32_000));
    const seen: Need[] = [];
    await runTranscribeCli(["transcribe", "speech.wav", "--language", "ko", "--to", "speech.transcript.svml"], capture().io, {
      cwd: root, openHost: async () => ({ profile: join(root, "runtime.json"), host: host(seen) }),
    });
    assert.equal((seen[0]!.constraints as unknown as WhisperXTranscriptionRequest).language, "ko");
    assert.equal(decodeSpeechTranscriptSource(await readFile(join(root, "speech.transcript.svml"), "utf8")).sampleFrames, 32_000);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Chinese transcription explicitly sends zh and retains individual character windows", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-transcribe-zh-"));
  try {
    await writeFile(join(root, "speech.wav"), wav(32_000));
    const selected = host([]);
    const env: TranscribeEnvironment = { cwd: root, openHost: async () => ({ profile: join(root, "runtime.json"), host: {
      ...selected,
      invoke: async (need) => {
        const request = need.constraints as unknown as WhisperXTranscriptionRequest;
        assert.equal(request.language, "zh");
        return canonicalize({
          sampleFrames: request.sampleFrames,
          passages: interpretWhisperXTranscript({
          segments: [{ words: [{ word: "你", start: 0.1, end: 0.24 }, { word: "好！", start: 0.5, end: 1.1 }] }],
        }, request.sampleFrames),
        });
      },
    } }) };
    await runTranscribeCli(["transcribe", "speech.wav", "--language", "zh", "--to", "speech.transcript.svml"], capture().io, env);
    const result = decodeSpeechTranscriptSource(await readFile(join(root, "speech.transcript.svml"), "utf8"));
    assert.deepEqual(result.passages[0]!.words, [
      { text: "你", startSample: 1_600, endSampleExclusive: 3_840 },
      { text: "好！", startSample: 8_000, endSampleExclusive: 17_600 },
    ]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("transcription explains ambiguous selection and preserves unsupported request reasons before invoking", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-transcribe-selection-"));
  try {
    await writeFile(join(root, "speech.wav"), wav(16_000));
    for (const selection of [
      { status: "ambiguous" as const, support: "not-evaluated" as const, endpoints: ["local.words", "hosted.words"] },
      { status: "resolved" as const, support: "unsupported" as const, endpoint: "hosted.words", binding: "hosted.words",
        rejections: [{ endpoint: "hosted.words", message: "This deployment does not support zh alignment" }] },
    ]) {
      let invoked = false;
      const env: TranscribeEnvironment = { cwd: root, openHost: async () => ({
        profile: join(root, "runtime.json"), host: {
          endpoints: async (queries) => queries.map((query) => ({
            need: query.need, capability: query.capability, ...selection,
          })),
          invoke: async () => { invoked = true; throw new Error("must not invoke rejected selection"); },
        },
      }) };
      await assert.rejects(runTranscribeCli([
        "transcribe", "speech.wav", "--to", "speech.transcript.svml", "--language", "zh",
      ], capture().io, env), (error: Error) => {
        if (selection.status === "ambiguous") {
          assert.match(error.message, /local\.words, hosted\.words/u);
          assert.match(error.message, /bindings\["@hypit\/whisperx@1#whisperx-transcription"\]/u);
        } else {
          assert.match(error.message, /binding: hosted\.words/u);
          assert.match(error.message, /hosted\.words: This deployment does not support zh alignment/u);
        }
        assert.doesNotMatch(error.message, /keep exactly one|hypit plan --runtime/u);
        return true;
      });
      assert.equal(invoked, false);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
