import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { canonicalize } from "@hypit/protocol";
import type { Need } from "@hypit/protocol";
import type { ResourceStore } from "@hypit/runtime";
import { sealAlignedTranscriptEvidence } from "@hypit/speech-evidence";
import { sealVisualObservation } from "@hypit/gemini";
import { interpretWhisperXTranscript } from "@hypit/whisperx";
import type { WhisperXAlignmentRequest } from "@hypit/whisperx";

import { runCreationCli } from "../src/creation.js";
import type { CreationEnvironment, CreationHost } from "../src/creation.js";

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
function host(seen: Need[]): CreationHost {
  return {
    providers: async (requests) => requests.map((request) => ({
      request: request.request,
      capability: request.capability,
      status: "resolved" as const,
      endpoint: "paid.default",
      use: "@hypit/provider-example",
      pricing: page,
    })),
    invoke: async (need: Need, resources: ResourceStore) => {
      seen.push(need);
      if (need.capability.name === "whisperx-alignment") {
        const request = need.constraints as unknown as WhisperXAlignmentRequest;
        return { value: { kind: "inline" as const, value: canonicalize(sealAlignedTranscriptEvidence({
          passages: interpretWhisperXTranscript({
            segments: [{ start: 0, end: 1.5, words: [{ text: "hello", start: 0.1, end: 0.5 }, { text: "world", start: 0.9, end: 1.4 }] }],
          }, request.sampleFrames),
        })) } };
      }
      const request = need.constraints as { readonly prompt: string; readonly media: readonly unknown[] };
      return { value: { kind: "inline" as const, value: canonicalize(sealVisualObservation(`saw ${request.media.length} media; asked: ${request.prompt}`)) } };
    },
  };
}

function environment(cwd: string, seen: Need[]): CreationEnvironment {
  return { cwd, openHost: async () => ({ profile: join(cwd, "hypit.runtime.json"), host: host(seen) }) };
}

function capture() {
  let output = "";
  return { io: { write: (text: string) => { output += text; } }, text: () => output };
}

test("observe seals one Gemini request from the media and writes the answer beside the Provider it named", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-observe-"));
  const seen: Need[] = [];
  try {
    await writeFile(join(root, "frame.png"), Uint8Array.from([137, 80, 78, 71]));
    await writeFile(join(root, "prompt.txt"), "What is the presenter holding?\n", "utf8");
    const out = capture();
    await runCreationCli([
      "observe", "frame.png", "--instruction", "You only observe.", "--prompt", "prompt.txt", "--to", "notes/frame.md", "--json",
    ], out.io, environment(root, seen));
    const view = JSON.parse(out.text()) as Record<string, unknown>;
    assert.equal(view.endpoint, "paid.default");
    assert.deepEqual(view.pricing, page);
    assert.equal(await readFile(join(root, "notes", "frame.md"), "utf8"), "saw 1 media; asked: What is the presenter holding?\n");
    assert.equal(seen[0]?.capability.name, "gemini-3.1-pro");
    const constraints = seen[0]!.constraints as { readonly instruction: string; readonly media: readonly { readonly artifact: { readonly mediaType: string } }[] };
    assert.equal(constraints.instruction, "You only observe.");
    assert.equal(constraints.media[0]?.artifact.mediaType, "image/png");

    const again = capture();
    await assert.rejects(runCreationCli([
      "observe", "frame.png", "--instruction", "x", "--prompt", "y", "--to", "notes/frame.md",
    ], again.io, environment(root, seen)), /already exists/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("transcribe writes every word in seconds from the Profile's alignment Endpoint", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-transcribe-"));
  const seen: Need[] = [];
  try {
    await writeFile(join(root, "speech.wav"), wav(32_000));
    const out = capture();
    await runCreationCli(["transcribe", "speech.wav", "--to", "speech.json", "--language", "en"], out.io, environment(root, seen));
    assert.match(out.text(), /paid\.default \(@hypit\/provider-example\)  ·  https:\/\/prices\.example\/models/u);
    assert.match(out.text(), /2 words in 1 passage over 2s/u);
    const file = JSON.parse(await readFile(join(root, "speech.json"), "utf8")) as {
      readonly audio_seconds: number; readonly passages: readonly { readonly words: readonly { readonly text: string; readonly start_seconds: number }[] }[];
    };
    assert.equal(file.audio_seconds, 2);
    assert.deepEqual(file.passages[0]?.words.map((word) => [word.text, word.start_seconds]), [["hello", 0.1], ["world", 0.9]]);
    const request = seen[0]!.constraints as unknown as WhisperXAlignmentRequest;
    assert.equal(request.language, "en");
    assert.equal(request.sampleFrames, 32_000);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("measure prints the seconds a line takes so the author can write the literal, without any Profile", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-measure-"));
  try {
    const noHost: CreationEnvironment = { cwd: root, openHost: async () => { throw new Error("measure must not open a host"); } };
    const out = capture();
    await runCreationCli([
      "measure", "--text", "Video editing begins with meaning, not a pile of clips on a timeline.",
      "--language", "en", "--pace", "normal", "--rounding", "round", "--json",
    ], out.io, noHost);
    const view = JSON.parse(out.text()) as { readonly seconds: number; readonly units: number; readonly language: string };
    assert.equal(view.units, 20);
    assert.equal(view.language, "en");
    assert.equal(view.seconds, 4);

    const human = capture();
    await runCreationCli(["measure", "--text", "hello world"], human.io, noHost);
    assert.match(human.text(), /^\d+(\.\d+)?s\n/u);
    assert.match(human.text(), /Choose the request duration/u);

    for (const [text, seconds] of [["Hello.", 2 / 4.6], [Array.from({ length: 460 }, () => "day").join(" "), 100]] as const) {
      const measured = capture();
      await runCreationCli(["measure", "--text", text, "--language", "en", "--rounding", "none", "--json"], measured.io, noHost);
      assert.ok(Math.abs(JSON.parse(measured.text()).seconds - seconds) < 1e-9);
    }

    await assert.rejects(runCreationCli(["measure"], capture().io, noHost), /--text|--segment/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a Profile that does not serve the capability stops before anything is spent", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-creation-unserved-"));
  try {
    await writeFile(join(root, "speech.wav"), wav(16_000));
    let invoked = false;
    const unserved: CreationEnvironment = {
      cwd: root,
      openHost: async () => ({ profile: join(root, "hypit.runtime.json"), host: {
        providers: async (requests) => requests.map((request) => ({
          request: request.request,
          capability: request.capability,
          status: "unresolved" as const,
        })),
        invoke: async () => { invoked = true; throw new Error("must not be reached"); },
      } }),
    };
    await assert.rejects(
      runCreationCli(["transcribe", "speech.wav", "--to", "speech.json"], capture().io, unserved),
      /No Endpoint in .*hypit\.runtime\.json serves @hypit\/whisperx@1#whisperx-alignment; hypit plan --runtime/u,
    );
    assert.equal(invoked, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
