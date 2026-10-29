import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { AudioProgram, AudioProgramClip } from "@hypit/audio-program";
import { exactTemporalValueFromFrames, identityTemporalMap } from "@hypit/temporal";
import { fixtureResource } from "../../../test/fixture-resource.js";
import { CanonicalPcmReader, renderAudioProgramWav } from "../src/audio-render.js";

const frameRate = { numerator: 48_000, denominator: 1 } as const;
const sampleFrames = 4;
const domain = { id: "signal", duration: exactTemporalValueFromFrames(sampleFrames, { frameRate }) };
const sampling = identityTemporalMap(domain);

function wav(samples: readonly number[]): Buffer {
  const bytes = Buffer.alloc(44 + samples.length * 4);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVE", 8);
  bytes.write("fmt ", 12); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(2, 22); bytes.writeUInt32LE(48_000, 24); bytes.writeUInt32LE(192_000, 28);
  bytes.writeUInt16LE(4, 32); bytes.writeUInt16LE(16, 34); bytes.write("data", 36);
  bytes.writeUInt32LE(samples.length * 4, 40);
  samples.forEach((sample, index) => {
    bytes.writeInt16LE(sample, 44 + index * 4);
    bytes.writeInt16LE(sample, 46 + index * 4);
  });
  return bytes;
}

function sourceClip(): AudioProgramClip {
  return {
    id: "local-clip",
    source: {
      source: { kind: "blob", resource: fixtureResource("nested-audio"), size: 1, mediaType: "audio/wav" },
      streamIndex: 0,
      presentationStart: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } },
      sourceDomain: domain,
      interpretation: { sampleRate: 48_000, channels: 2 },
    },
    preparation: sampling,
    sampling,
    target: { start: exactTemporalValueFromFrames(0, { frameRate }), end: exactTemporalValueFromFrames(4, { frameRate }) },
    targetStartSample: 0,
    targetEndSampleExclusive: 4,
    mixStartSample: 0,
    mixEndSampleExclusive: 4,
    gain: 1,
    fadeInSamples: 0,
    fadeOutSamples: 0,
  };
}

test("the local audio renderer evaluates a child AudioProgram before parent occurrence gain", async () => {
  const work = await mkdtemp(join(tmpdir(), "hypit-nested-audio-"));
  const sourcePath = join(work, "source.wav");
  const outputPath = join(work, "output.wav");
  await writeFile(sourcePath, wav([1_000, 2_000, 3_000, 4_000]));
  const source = new CanonicalPcmReader(sourcePath, sampleFrames);
  try {
    const clip = sourceClip();
    const child: AudioProgram = {
      frameRate, frameCount: 4, sampleRate: 48_000, sampleFrames: 4,
      graph: { nodes: [{ kind: "source", id: "source", clip }], output: { node: "source", port: "signal" } },
    };
    const parent: AudioProgram = {
      frameRate, frameCount: 4, sampleRate: 48_000, sampleFrames: 4,
      graph: { nodes: [{
        kind: "composition", id: "child", program: child,
        target: { start: exactTemporalValueFromFrames(0, { frameRate }), end: exactTemporalValueFromFrames(4, { frameRate }) },
        targetStartSample: 0, targetEndSampleExclusive: 4, sampling,
        gain: 0.5, fadeInSamples: 0, fadeOutSamples: 0,
      }], output: { node: "child", port: "signal" } },
    };
    await renderAudioProgramWav({
      path: outputPath, program: parent, startSample: 0, sampleFrames: 4,
      sourceForClip: (value) => {
        assert.equal(value, clip);
        return source;
      },
    });
    const output = await readFile(outputPath);
    assert.deepEqual([0, 1, 2, 3].map((index) => output.readInt16LE(44 + index * 4)), [500, 1_000, 1_500, 2_000]);
    assert.equal(await readFile(`${outputPath}.nested-0.wav`).catch(() => undefined), undefined);
  } finally {
    source.close();
    await rm(work, { recursive: true, force: true });
  }
});
